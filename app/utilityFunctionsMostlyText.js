const Autolinker = require('autolinker')
const mongoose = require('mongoose')
const fs = require('fs')
const sharp = require('sharp')
const path = require('path')
const sanitizeHtml = require('sanitize-html')
const hbs = require('./pageRenderer')
const User = require('./models/user')
const Image = require('./models/image')

// these requires are not in server.js bc they're only used here
const { URL } = require('url')
const metascraper = require('metascraper')([
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-title')(),
  require('metascraper-url')()
])
const request = require('request')

module.exports = {
  // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
  parseText: async function (rawText, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true) {
    console.log('Parsing content')
    let inlineElements
    if (typeof rawText !== 'string') { // it is an array of paragraphs and inline elements
      const parsedParagraphList = await this.parseParagraphList(rawText)
      rawText = parsedParagraphList.text
      inlineElements = parsedParagraphList.inlineElements
    } else {
      inlineElements = []
      // this is also done by parseParagraphList, but if we're not using that we use this, here
      rawText = rawText.replace(/^(<p>(<br>|\s)*<\/p>)*/, '') // filter out blank lines from beginning
      rawText = rawText.replace(/(<p>(<br>|\s)<\/p>)*$/, '') // filter them out from the end
      rawText = rawText.replace(/(<p>(<br>|\s)<\/p>){2,}/g, '<p><br></p>') // filters out multiple blank lines in a row within the post
    }

    const mentionRegex = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
    const mentionReplace = '$1<a href="/$2">@$2</a>'
    const hashtagRegex = /(^|>|\n|\ |\t)#(\w{1,60})\b/g
    const hashtagReplace = '$1<a href="/tag/$2">#$2</a>'

    if (urlsEnabled) {
      rawText = Autolinker.link(rawText)
    }
    if (mentionsEnabled) {
      rawText = rawText.replace(mentionRegex, mentionReplace)
    }
    if (hashtagsEnabled) {
      rawText = rawText.replace(hashtagRegex, hashtagReplace)
    }

    rawText = this.sanitizeHtmlForSweet(rawText)

    const mentionsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, ' ').match(mentionRegex)))
    const tagsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, ' ').match(hashtagRegex)))
    const trimmedMentions = []
    const trimmedTags = []
    if (mentionsArray) {
      mentionsArray.forEach((el) => {
        trimmedMentions.push(el.replace(/(@|\s)*/i, ''))
      })
    }
    if (tagsArray) {
      tagsArray.forEach((el) => {
        trimmedTags.push(el.replace(/(#|\s)*/i, ''))
      })
    }

    const parsedStuff = {
      text: rawText, // well, not raw anymore
      mentions: trimmedMentions,
      tags: trimmedTags,
      inlineElements: inlineElements
    }

    // console.log(JSON.stringify(parsedStuff, null, 4));

    return parsedStuff
  },
  parseParagraphList: async function (pList) {
    const inlineElements = []
    // iterate over list, remove blank lines from the beginning, collapse consecutive blank lines into one, and finally remove the last line if it's blank
    // also, pull out the inline elements and put them in their own array with their position
    let lastWasBlank = false
    for (let i = 0; i < pList.length; i++) {
      if (typeof pList[i] === 'string') {
        const isBlank = pList[i].match(/^<p>(<br>|\s)*<\/p>$/)
        if (((i === 0 && !inlineElements.length) || lastWasBlank) && isBlank) {
          pList.splice(i, 1)
          i--
        }
        lastWasBlank = isBlank
      } else {
        if (pList[i].type === 'link-preview') {
          try {
            pList[i] = await this.getLinkMetadata(pList[i].linkUrl)
          } catch (err) {
            console.log('could not parse link preview while creating post:')
            console.log(err)
            pList.splice(i, 1)
            i--
          }
        }
        lastWasBlank = false
        pList[i].position = i
        inlineElements.push(pList[i])
        pList.splice(i, 1)
        i--
      }
    }
    if (pList.length && lastWasBlank) {
      pList.splice(pList.length - 1, 1)
    }
    return { text: pList.join(''), inlineElements: inlineElements }
  },
  sanitizeHtmlForSweet: function (parsedContent) {
    return sanitizeHtml(parsedContent, {
      allowedTags: ['blockquote', 'ul', 'li', 'em', 'i', 'b', 'strong', 'a', 'p', 'br'],
      allowedAttributes: {
        a: ['href', 'target']
      },
      transformTags: {
        a: function (tagName, attribs) {
          // if a link is not explicitly relative due to an initial / (like mention and hashtag links are) and doesn't already include a protocol:
          if (attribs.href.substring(0, 1) !== '/' && !attribs.href.includes('//')) {
            // make the link explicitly non-relative (even though technically maybe it should be https browsers will generally figure that out)
            attribs.href = 'http://' + attribs.href
          }
          attribs.target = '_blank'
          return {
            tagName: 'a',
            attribs: attribs
          }
        }
      }
    })
  },
  // stolen from mustache.js (https://github.com/janl/mustache.js/blob/master/mustache.js#L73) via stack overflow (https://stackoverflow.com/questions/24816/escaping-html-strings-with-jquery)
  escapeHTMLChars: function (string) {
    const entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;',
      '\t': '&emsp;' // this one is my idea
    }
    return String(string).replace(/[&<>"'`=\/\t]/g, function (s) {
      return entityMap[s]
    })
  },
  getLinkMetadata: async function (url) {
    // remove the protocol and the path if it's empty from the url bc that's how it's stored in the cache (that way it matches it with or without)
    const parsedUrl = new URL(url)
    parsedUrl.protocol = ''
    parsedUrl.slashes = false

    if (parsedUrl.path === '/' && parsedUrl.pathname === '/') {
      parsedUrl.path = ''
      parsedUrl.pathname = ''
    }
    const retrievalUrl = parsedUrl.toString()
    let finalUrl // this will have the correct protocol, obtained either by the cache or the request package
    const Cache = mongoose.model('Cached Link Metadata')
    const found = await Cache.findOne({ retrievalUrl: retrievalUrl })
    const cacheHit = !!found
    let metadata
    if (!cacheHit) {
      const urlreq = new Promise(function (resolve, reject) {
        request({ url: url.includes('//') ? url : ('http://' + url), gzip: true }, function (error, response, body) { // (faking a maybe-wrong protocol here just so the this thing will accept it)
          if (error) {
            reject(error)
          } else {
            finalUrl = response.request.href
            resolve(body)
          }
        })
      })
      const html = await urlreq
      metadata = await metascraper({ html, url: finalUrl })
    } else {
      metadata = found
      finalUrl = metadata.linkUrl
    }
    const result = {
      type: 'link-preview',
      retrievalUrl: retrievalUrl,
      linkUrl: finalUrl,
      image: metadata.image,
      title: metadata.title,
      description: metadata.description,
      domain: new URL(finalUrl).hostname
    }
    // taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
    const youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
    // taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
    const vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/
    let parsed
    let isEmbeddableVideo = false
    if (parsed = youtubeUrlFindingRegex.exec(finalUrl)) {
      result.embedUrl = 'https://www.youtube.com/embed/' + parsed[5] + '?autoplay=1' // won't actually autoplay until link preview is clicked
      isEmbeddableVideo = true
      try {
        const time = /t=(?:([0-9]*)m)?((?:[0-9])*)(?:s)?/.exec(parsed[6])
        if (time) {
          let seconds = 0
          if (time[2]) {
            seconds += parseInt(time[2])
          }
          if (time[1]) {
            seconds += (parseInt(time[1]) * 60)
          }
          if (seconds) {
            result.embedUrl += '&start=' + seconds
          }
        }
      } catch (err) { // catch potential parseInt errors
        console.log('youtube link had time specifier that was apparently malformed! error:')
        console.log(err)
      }
    } else if (parsed = vimeoUrlFindingRegex.exec(finalUrl)) {
      result.embedUrl = 'https://player.vimeo.com/video/' + parsed[4] + '?autoplay=1' // won't actually autoplay until link preview is clicked
      isEmbeddableVideo = true
    }
    result.isEmbeddableVideo = isEmbeddableVideo
    if (!cacheHit) {
      (new Cache(result)).save()
    }
    return result
  },
  // moves them out of temp storage, creates image documents for them in the database, and returns arrays with their horizontality/verticality
  // the non-first arguments are just stored in the image documents in the database. postType is "original" or "community"
  finalizeImages: async function (imageFileNames, postType, community, posterID, privacy, postImageQuality, imagesCurrentFolder = (global.appRoot + '/cdn/images/temp/')) {
    const imageIsVertical = []
    const imageIsHorizontal = []
    for (const imageFileName of imageFileNames) {
      await new Promise((resolve, reject) => {
        fs.rename(imagesCurrentFolder + imageFileName, './cdn/images/' + imageFileName, function (e) {
          if (e) { console.error('could not move ' + imageFileName + ' out of temp\n' + e) }
          resolve()
        })
      })

      const metadata = await sharp('./cdn/images/' + imageFileName).metadata()
      const image = new Image({
        // posts' types are either original or community; the image's contexts are either user or community, meaning the same things.
        context: postType === 'community' ? 'community' : 'user',
        community: postType === 'community' ? community : undefined,
        filename: imageFileName,
        privacy: privacy,
        user: posterID,
        quality: postImageQuality,
        height: metadata.height,
        width: metadata.width
      })
      await image.save()

      if (fs.existsSync(path.resolve('./cdn/images/' + imageFileName))) {
        imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? 'vertical-image' : '')
        imageIsHorizontal.push(((metadata.width / metadata.height) > 1.33) ? 'horizontal-image' : '')
      } else {
        console.log('image ' + './cdn/images/' + imageFileName + ' not found when determining orientation! Oh no')
        imageIsVertical.push('')
        imageIsHorizontal.push('')
      }
    }
    return { imageIsHorizontal: imageIsHorizontal, imageIsVertical: imageIsVertical }
  },
  // returns a string with the html contents of the post or comment rendered based on parsedContent, inlineElements, embeds, and/or the image parallel arrays. also, some extra info in the inlineElements, but that won't get saved 'cause it's not in the inlineElement schema
  renderHTMLContent: async (postOrComment, forEditor = false) => {
    let cleanedParsedContent
    if (forEditor) {
      // remove relative links (those that start with a / but not //) from content for the editor. this is so that @ mention links and
      // hashtag links don't get picked up and re-linked when the edit is parsed after submission.
      cleanedParsedContent = sanitizeHtml(postOrComment.parsedContent, {
        transformTags: {
          a: function (tagName, attribs) {
            if (attribs.href.match(/^\/\w/)) {
              return {
                tagName: '',
                attribs: {}
              }
            } else {
              return {
                tagName: 'a',
                attribs: attribs
              }
            }
          }
        }
      })
    } else {
      cleanedParsedContent = postOrComment.parsedContent
    }
    let filenames
    let html
    if (postOrComment.inlineElements && postOrComment.inlineElements.length) {
      const lines = [] // they're more like paragraphs, really
      const lineFinder = /(<p>.*?<\/p>)|(<ul>.*?<\/ul>)|(<blockquote>.*?<\/blockquote>)/g
      let line
      while (line = lineFinder.exec(cleanedParsedContent)) {
        lines.push(line[0])
      }
      let addedLines = 0
      for (const il of postOrComment.inlineElements) {
        if (il.type === 'link-preview') {
          if (forEditor) {
            il.editing = true
            html = await hbs.render('./views/partials/scriptPartials/linkPreviewPreview.handlebars', il)
          } else {
            if (il.isEmbeddableVideo) {
              console.log('embed!!!!')
              il.type = 'video' // the template looks for "video" in this field, like what older posts with embeds have
            }
            html = await hbs.render('./views/partials/embed.handlebars', il)
            il.type = 'link-preview' // yes, this is dumb. the alternative is to list all the different variables the template expects in the rendering options with type: (isEmbeddableVideo ? "video" : "asdj;lfkfdsajkfl;") or something
          }
        } else if (il.type === 'image(s)') {
          if (forEditor) {
            html = ''
            for (let i = 0; i < il.images.length; i++) {
              html += (await hbs.render('./views/partials/scriptPartials/imagePreview.handlebars', { editing: true, image: il.images[i], imageUrl: '/api/image/display/' + il.images[i], description: il.imageDescriptions[i] }))
            }
          } else {
            il.contentWarnings = postOrComment.contentWarnings
            il.author = { username: (await User.findById(postOrComment.author, { username: 1 })).username }
            filenames = il.images
            il.images = il.images.map(v => '/api/image/display/' + v)
            html = await hbs.render('./views/partials/imagegallery.handlebars', il)
            il.images = filenames // yes, this is dumb. the alternative is to specify each variable the template expects individually in the rendering options with like images: fullImagePaths
          }
        }
        lines.splice(il.position + addedLines, 0, html)
        addedLines++
      }
      return lines.join('')
    } else if ((postOrComment.images && postOrComment.images.length) || (postOrComment.embeds && postOrComment.embeds.length)) {
      let endHTML = ''
      if (postOrComment.embeds && postOrComment.embeds.length) {
        // this is a post from before the inlineElements array, render its embed (mandated to be just one) and put it at the end of html
        if (forEditor) {
          postOrComment.embeds[0].editing = true
          endHTML += await hbs.render('./views/partials/scriptPartials/linkPreviewPreview.handlebars', postOrComment.embeds[0])
        } else {
          endHTML += await hbs.render('./views/partials/embed.handlebars', postOrComment.embeds[0])
        }
      }
      if (postOrComment.images && postOrComment.images.length) {
        // if it's not a comment and it either has no registered image version or the registered image version is less than 2, it uses the old url scheme.
        const imageUrlPrefix = !postOrComment.parent && (!postOrComment.imageVersion || postOrComment.imageVersion < 2) ? '/images/uploads/' : '/api/image/display/'
        if (forEditor) {
          for (let i = 0; i < postOrComment.images.length; i++) {
            endHTML += (await hbs.render('./views/partials/scriptPartials/imagePreview.handlebars', { editing: true, image: postOrComment.images[i], imageUrl: imageUrlPrefix + postOrComment.images[i], description: postOrComment.imageDescriptions[i] })) + '</div>' // is this line long enough yet
          }
        } else {
          // this is a post or comment from before the inlineElements array, render its images (with determined full urls) with the parallel arrays and put that at the end of html
          filenames = postOrComment.images
          postOrComment.images = postOrComment.images.map(v => imageUrlPrefix + v)
          endHTML += await hbs.render('./views/partials/imagegallery.handlebars', postOrComment)
          postOrComment.images = filenames // yes, this is dumb
        }
      }
      return cleanedParsedContent + endHTML
    } else {
      return cleanedParsedContent
    }
  },
  isEven: (n) => {
    return n % 2 === 0
  },
  isOdd: (n) => {
    return Math.abs(n % 2) === 1
  },
  slugify: (string) => {
    const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;'
    const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------'
    const p = new RegExp(a.split('').join('|'), 'g')

    return string.toString().toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
      .replace(/&/g, '-and-') // Replace & with 'and'
      .replace(/[^\w\-]+/g, '') // Remove all non-word characters
      .replace(/\-\-+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, '') // Trim - from end of text
  }
}

function wordCount (str) {
  return str.split(' ').filter(function (n) { return n !== '' }).length
}

// the following is a function i wrote to parse quilljs' delta format and turn formatted text into html and inline elements into an array. it turned
// out to be more complicated than necessary so right now we're actually just going to pull the html from the quill editor directly and process it in
// the parseParagraphList function above. this function works well to the best of my knowledge and could still be used for turning quilljs deltas into
// custom formatted html if such a need ever arises.

// called by parse text to turn the quilljs delta format (which can be used for text with embeds) into html
function parseDeltaNotUsedRightNow (delta) {
  // taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
  const youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
  // taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
  const vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/

  // this starts the first line. it may be modified if it turns out this is a line in a list or blockquote
  const linesOfParsedString = ['<p>']

  const inlineElements = []
  let imagesAdded = 0
  let linkPreviewsAdded = 0
  const imagesAllowed = 4
  const linkPreviewsAllowed = 4

  let linesFinished = 0 // the assumption is that the text parsing in parseText will not add or remove any lines
  let withinList = false
  // the delta format stores a series of operations in "ops." in this context, they will all be "insert" ops, with their main content in .insert and the extra attributes of that content in .attributes
  // the best way to understand this function is probably to step through it. basically, we start with a line "in progress" (the <p> that starts the array above) and add each insert onto it,
  // accompanied by the tags for its formatting, until we hit an end of line signal, when we finish the line with an end tag. it may turn out that the end of line is blockquote or list formatted,
  // in which case we have to go back and start the line with the appropriate tag (or tags in the case of lists, <ul> and <li>), and then for lists we start starting lines with <li> and then
  // when we leave that formatting mode (when we hit a non list-fomatted newline) we have to end the previous (finished) line with </li> and </ul> and go back and start the current one with <p>.
  // embeds are added with a position attribute describing how many lines have been completed when they are encountered, which serves to place them in the text later.
  for (let i = 0; i < delta.ops.length; i++) {
    const op = delta.ops[i]
    if (typeof op.insert === 'string' && (op.insert !== '' || op.attributes)) {
      op.insert = this.escapeHTMLChars(op.insert)
      let formattingStartTags = ''
      let formattingEndTags = ''
      if (op.attributes) {
        // blockquote and list formatted lines end with "\n"s with that formatting attached, that's the only way you can tell what they are. as far as i can tell, it is guaranteed that only
        // newlines will have this formatting.
        if (op.attributes.blockquote) {
          if (withinList) {
            withinList = false
            linesOfParsedString[linesOfParsedString.length - 2] += '</ul>'
            linesOfParsedString[linesOfParsedString.length - 1] = '<blockquote>' + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length) + '</blockquote>'
            linesFinished++
            linesOfParsedString.push('<p>')
          } else {
            linesOfParsedString[linesOfParsedString.length - 1] = '<blockquote>' + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + '</blockquote>'
            linesFinished++
            linesOfParsedString.push('<p>')
          }
          continue
        } else if (op.attributes.list === 'bullet') {
          if (!withinList) {
            withinList = true
            linesOfParsedString[linesOfParsedString.length - 1] = '<ul><li>' + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + '</li>'
            linesFinished++
            linesOfParsedString.push('<li>')
            continue
          } else {
            linesOfParsedString[linesOfParsedString.length - 1] += '</li>'
            linesFinished++
            linesOfParsedString.push('<li>')
            continue
          }
        }
        // other formatting is attached directly to the text it applies to
        if (op.attributes.bold) {
          formattingStartTags = '<strong>' + formattingStartTags
          formattingEndTags = formattingEndTags + '</strong>'
        }
        if (op.attributes.italic) {
          formattingStartTags = '<em>' + formattingStartTags
          formattingEndTags = formattingEndTags + '</em>'
        }
        if (op.attributes.link) {
          formattingStartTags = '<a href="' + op.attributes.link + '" target="_blank">' + formattingStartTags
          formattingEndTags = formattingEndTags + '</a>'
        }
      }
      // splitting the string into lines like this means that the first element is part of the previous line and then all subsequent ones start and finish their own lines, except the last one doesn't finish its
      const lines = op.insert.split('\n')
      linesOfParsedString[linesOfParsedString.length - 1] += formattingStartTags + lines[0] + formattingEndTags
      for (let i = 1; i < lines.length; i++) {
        if (withinList) {
          withinList = false
          linesOfParsedString[linesOfParsedString.length - 2] += '</ul>'
          linesOfParsedString[linesOfParsedString.length - 1] = '<p>' + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length)
        }
        if (linesOfParsedString[linesOfParsedString.length - 1] === '<p>') { // if the line we're finishing has no actual content
          linesOfParsedString[linesOfParsedString.length - 1] += '<br>'
        }
        linesOfParsedString[linesOfParsedString.length - 1] += '</p>'
        linesFinished++
        linesOfParsedString.push('<p>' + formattingStartTags + lines[i] + formattingEndTags)
      }
    } else if (op.insert.LinkPreview && linkPreviewsAdded <= linkPreviewsAllowed) {
      // i'm assuming that there will always be a newline text insert in the text right before an inline embed, so we don't have to go through the end-of-line process
      const embed = op.attributes
      embed.type = 'link-preview'
      embed.position = linesFinished
      embed.linkUrl = (op.insert.LinkPreview.includes('//') ? '' : '//') + op.insert.LinkPreview
      if (youtubeUrlFindingRegex.test(op.insert.LinkPreview)) {
        embed.isEmbeddableVideo = true
        embed.embedUrl = 'https://www.youtube.com/embed/' + youtubeUrlFindingRegex.exec(op.insert.LinkPreview)[5] + '?autoplay=1'
      } else if (vimeoUrlFindingRegex.test(op.insert.LinkPreview)) {
        embed.isEmbeddableVideo = true
        embed.embedUrl = 'https://www.youtube.com/embed/' + vimeoUrlFindingRegex.exec(op.insert.LinkPreview)[4] + '?autoplay=1'
      } else {
        embed.isEmbeddableVideo = false
      }
      inlineElements.push(embed)
      linkPreviewsAdded++

      console.log('link preview on line: ' + linesFinished)
      console.log('it is to ' + op.insert.LinkPreview)
      if (embed.isEmbeddableVideo) {
        console.log('it is an embeddable video')
      }
    } else if (op.insert.PostImage && imagesAdded <= imagesAllowed && op.attributes.imageURL !== 'loading...') {
      let image
      if (imagesAdded > 0 && inlineElements[inlineElements.length - 1].type === 'image(s)' && inlineElements[inlineElements.length - 1].position === linesFinished) {
        image = inlineElements[inlineElements.length - 1] // the below should modify this actual array element
      } else {
        image = { images: [], imageDescriptions: [], position: linesFinished, type: 'image(s)' }
        inlineElements.push(image)
      }
      image.images.push(op.attributes.imageURL)
      image.imageDescriptions.push(op.attributes.description)
      imagesAdded++

      console.log('image on line: ' + linesFinished)
      console.log('its file name will be ' + op.attributes.imageURL)
      console.log('its description is ' + op.attributes.description)
    }
  }
  if (withinList) {
    if (typeof delta.ops[delta.ops.length - 1].insert === 'string' && (!delta.ops[delta.ops.length - 1].attributes || !delta.ops[delta.ops.length - 1].attributes.list)) {
      linesOfParsedString[linesOfParsedString.length - 2] += '</ul>'
      linesOfParsedString[linesOfParsedString.length - 1] = '<p>' + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length) + '</p>'
    } else {
      linesOfParsedString[linesOfParsedString.length - 2] += '</ul>'
      linesOfParsedString.pop()
    }
  } else {
    if ((typeof delta.ops[delta.ops.length - 1].insert !== 'string')) {
      linesOfParsedString.pop()
    } else {
      if (linesOfParsedString[linesOfParsedString.length - 1] === '<p>') {
        linesOfParsedString[linesOfParsedString.length - 1] += '<br></p>'
      } else {
        linesOfParsedString[linesOfParsedString.length - 1] += '</p>'
      }
    }
  }
  console.log('finished html:')
  console.log(linesOfParsedString.join('\n'))
  return { text: linesOfParsedString.join(''), inlineElements: inlineElements }
}
