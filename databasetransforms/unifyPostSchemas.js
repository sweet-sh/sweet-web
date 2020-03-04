const Post = require('../app/models/post.js')
const Image = require('../app/models/image')
const LinkMetadata = mongoose.model('Cached Link Metadata')
const helper = require('../app/utilityFunctionsMostlyText.js')
const sharp = require('sharp')
var configDatabase = require('../config/database.js')
var mongoose = require('mongoose')
const ObjectId = require('mongoose').Types.ObjectId
mongoose.connect(configDatabase.url, {
  useNewUrlParser: true
})

async function updateImageDocsFromParallelArrays (doc, images, imageDescriptions, parentPost, position = -1) {
  const imageDBReferences = []
  for (let i = 0; i < images.length; i++) {
    const filename = images[i]
    const desc = imageDescriptions[i]
    const image = await Image.find({ filename })
    image.description = desc
    image.post = parentPost._id
    if (image.height && image.width) {
      if (image.width / image.height < 0.75) {
        image.orientation = 'vertical'
      } else if (image.width / image.height > 1.33) {
        image.orientation = 'horizontal'
      } else {
        image.orientation = 'neutral'
      }
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
  if (doc.images) {
    const imageDBReferences = await updateImageDocsFromParallelArrays(doc, doc.images, doc.imageDescriptions, post)
    doc.contents = [{ type: 'html', html: doc.parsedContents }, { type: 'image(s)', images: imageDBReferences }]
    if (doc.embeds) {
      for (const embed of doc.embeds) {
        let embedMetadata = LinkMetadata.findOne({ linkUrl: embed.linkUrl })
        if (!embedMetadata) {
          await helper.getLinkMetadata(embed.linkUrl)
          embedMetadata = LinkMetadata.findOne({ linkUrl: embed.linkUrl })
        }
        doc.contents.push({ type: 'link preview', linkPreview: embedMetadata._id })
      }
    }
  } else if (doc.inlineElements) {
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
