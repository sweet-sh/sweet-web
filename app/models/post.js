const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

const linkPreviewCacheSchema = new mongoose.Schema({
  isEmbeddableVideo: Boolean,
  retrievalUrl: String, // the url without the protocol - this is used to retrieve the document (works if the user inputs the url with http://, https://, or neither)
  linkUrl: String, // the url with the correct protocol (determined by the request package)
  embedUrl: String, // only used if isEmbeddableVideo is true
  title: String,
  image: String,
  description: String,
  domain: String
})

const contentSchema = new mongoose.Schema({
  type: { type: String, enum: ['html', 'image(s)', 'link preview'] },
  html: String,
  images: [{ type: DBReference, ref: 'Image' }],
  linkPreview: { type: DBReference, ref: 'Cached Link Metadata' }
})

const commentSchema = new mongoose.Schema({
  author: { type: DBReference, ref: 'User' },
  timestamp: Date,
  mentions: [String],
  tags: [String],
  contents: [contentSchema],
  deleted: { type: Boolean, default: false },
  cachedHTML: { // was rendered with either the versions of the templates indicated by the post's corresponding cachedHTML MTimes or the version that was available when the comment was created, whichever is newer
    fullContentHTML: String
  }
})

commentSchema.add({ replies: [commentSchema] })

const boostSchema = new mongoose.Schema({
  booster: { type: DBReference, ref: 'User', required: true },
  timestamp: { type: Date, required: true },
  boost: { type: DBReference, ref: 'Post' }
})

const postSchema = new mongoose.Schema({
  type: String, // "original", "community", or "boost". note that the equivalent "context" field in image documents stores either "user", "community", or "user"
  community: { type: DBReference, ref: 'Community' }, // hopefully undefined if type=="user"
  author: { type: DBReference, ref: 'User' },
  url: { type: String, required: true },
  privacy: { type: String, required: true },
  timestamp: { type: Date, required: true },
  lastUpdated: Date, // intially equal to timestamp, updated as comments are left
  lastEdited: Date, // initially undefined (although it wouldn't be crazy to set it equal to timestamp initially) and then changed when the post content is edited through the saveedits route in postingToSweet.js
  comments: [commentSchema],
  boostTarget: { type: DBReference, ref: 'Post' },
  numberOfComments: Number,
  mentions: [String],
  tags: [String],
  // boosts of this post will produce seperate post documents in the database that are linked to here. they link back to the original post through the boostTarget field.
  boostsV2: [{ type: boostSchema, required: true }],
  contentWarnings: String,
  commentsDisabled: Boolean,

  subscribedUsers: [{ type: DBReference, ref: 'User' }],
  unsubscribedUsers: [{ type: DBReference, ref: 'User' }],

  cachedHTML: { // the below MTimes also set a floor for the rendering date of the cached comment html (none will have older cached html, newer comments may have newer cached html, either way it'll all be brought up to date when the post is displayed)
    fullContentHTML: String,
    imageGalleryMTime: Date, // the last modified date of the imagegallery template when the html was rendered
    embedsMTime: Date // the last modified date of the embeds template when the html was rendered
  }
})

// used to select posts to display in feeds
postSchema.index({ author: 1 })
postSchema.index({ community: 1 })

// used to sort posts in feeds
postSchema.index({ lastUpdated: -1 })
postSchema.index({ timestamp: -1 })

// honestly only used by the active users graph but what the hell
postSchema.index({ 'comments.timestamp': -1 })

linkPreviewCacheSchema.index({ retrievalUrl: 1 })
// just retrieve this with mongoose.model('Cached Link Metadata') in the one place in which it is needed
mongoose.model('Cached Link Metadata', linkPreviewCacheSchema)

// create the model for users and expose it to our app
module.exports = mongoose.model('Post', postSchema)
