const Post = require('../app/models/post.js')
const Image = require('../app/models/image')
const helper = require('../app/utilityFunctionsMostlyText.js')
var configDatabase = require('../config/database.js')
const sharp = require('sharp')
var mongoose = require('mongoose')
const fs = require('fs')
const LinkMetadata = mongoose.model('Cached Link Metadata')
const ObjectId = require('mongoose').Types.ObjectId
mongoose.connect(configDatabase.url, {
  useNewUrlParser: true
})

function getOrientation (width, height) {
  if (width / height < 0.75) {
    return 'vertical'
  } else if (width / height > 1.33) {
    return 'horizontal'
  } else {
    return 'neutral'
  }
}

async function updateImageDocsFromParallelArrays (doc, images, imageDescriptions, parentPost) {
  const imageDBReferences = []
  for (let i = 0; i < images.length; i++) {
    const filename = images[i]
    const desc = imageDescriptions[i]
    let image = await Image.findOne({ filename })
    if (!image) {
      try {
        await sharp('../public/images/uploads/' + filename).metadata().then(async metadata => {
          image = new Image({
            filename,
            width: metadata.width,
            height: metadata.height,
            orientation: getOrientation(metadata.width, metadata.height)
            // other fields filled in below
          })
        })
        fs.renameSync(global.appRoot + '/public/images/uploads/' + filename, global.appRoot + '/cdn/images/' + filename)
      } catch (err) {
        console.error(`could not find image ${filename} in the database or retrieve from the uploads folder!`)
        console.error(err)
      }
    }
    image.description = desc
    image.post = parentPost._id
    if (image.width && image.height) {
      image.orientation = getOrientation(image.width, image.height)
    }
    await image.save()
    imageDBReferences.push(image._id)
  }
  return imageDBReferences
}

async function updateImageDocsFromInlineElements (doc, inlineElements, parentPost) {
  let imageGroups
  for (const ie of inlineElements) {
    if (ie.type === 'image(s)') {
      imageGroups.push(await updateImageDocsFromParallelArrays(doc, ie.images, ie.imageDescriptions, parentPost, ie.position))
    }
  }
}

async function recursiveImageUpdate (doc, post) {
  if (doc.images && doc.images.length) {
    const imageDBReferences = await updateImageDocsFromParallelArrays(doc, doc.images, doc.imageDescriptions, post)
    doc.contents = [{ type: 'html', html: doc.parsedContents }, { type: 'image(s)', images: imageDBReferences }]
    if (doc.embeds && doc.embeds.length) {
      for (const embed of doc.embeds) {
        let embedMetadata = LinkMetadata.findOne({ linkUrl: embed.linkUrl })
        if (!embedMetadata) {
          await helper.getLinkMetadata(embed.linkUrl)
          embedMetadata = LinkMetadata.findOne({ linkUrl: embed.linkUrl })
        }
        doc.contents.push({ type: 'link preview', linkPreview: embedMetadata._id })
      }
    }
  } else if (doc.inlineElements && doc.inlineElements.length) {
    const imageGroups = updateImageDocsFromInlineElements(doc, doc.inlineElements, post)
    const contents = [...doc.parsedContents.matchAll(/(<p>.*?<\/p>)|(<ul>.*?<\/ul>)|(<blockquote>.*?<\/blockquote>)/g)]
    let addedElements = 0
    let currentElement = {}
    for (const ie of doc.inlineElements) {
      if (ie.type === 'link-preview') {
        currentElement = { type: 'link preview', linkPreview: (await LinkMetadata.findOne({ linkUrl: ie.linkUrl })) }
      } else if (ie.type === 'image(s)') {
        currentElement = { type: 'image(s)', images: imageGroups[0] }
        imageGroups.splice(0, 1)
      } else {
        throw Error('malformed inlineElement in post ' + post._id)
      }
      contents.splice(ie.position + addedElements, 0, currentElement)
      addedElements++
    }
  }
  for (const comment in doc.comments) {
    await recursiveImageUpdate(comment, post)
  }
  for (const comment in doc.replies) {
    await recursiveImageUpdate(comment, post)
  }
}

Post.find().then(async posts => {
  for (const post in posts) {
    const newSubscribedUsers = []
    const newUnsubscribedUsers = []
    for (const user in post.subscribedUsers) {
      newSubscribedUsers.push(new ObjectId(user))
    }
    for (const user in post.unsubscribedUsers) {
      newUnsubscribedUsers.push(new ObjectId(user))
    }
    await recursiveImageUpdate(post, post)
  }
})
