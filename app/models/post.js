var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var embedSchema = new mongoose.Schema({
    type: String,
    linkUrl: String,
    embedUrl: String,
    title: String,
    description: String,
    image: String,
    domain: String,
    position: Number
})

var commentSchema = new mongoose.Schema({
  authorEmail: String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: Date,
  rawContent: String,
  parsedContent: String,
  mentions: [String],
  tags: [String],
  images: [String],
  imageDescriptions: [String],
  imageIsVertical: [String],
  imageIsHorizontal: [String],
  deleted: { type: Boolean, default: false },
  embeds: [embedSchema],
  cachedHTML:{ //each was rendered with either the version of the template indicated by the post's corresponding cachedHTML MTime or the version that was available when the comment was made, whichever is newer
    imageGalleryHTML: String,
    embedsHTML: [String]
  }
});

commentSchema.add({ replies: [commentSchema] });

var boostSchema = new mongoose.Schema({
  booster: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  timestamp: {type: Date, required: true},
  boost: {type: Schema.Types.ObjectId, ref: 'Post'}
})

var postSchema = new mongoose.Schema({
  type: String,
  community: { type: Schema.Types.ObjectId, ref: 'Community' },
  authorEmail: {
    type: String,
    required: true
  },
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  url: {
    type: String,
    required: true
  },
  privacy: {
    type: String,
    required: true
  },
  timestamp: {
		type: Date,
		required: true
	},
  lastUpdated: {
    type: Date
  },
  rawContent: {
    type: String
  },
  parsedContent: {
    type: String
  },
  comments: [commentSchema],
  boostTarget: { type: Schema.Types.ObjectId, ref: 'Post' },
  numberOfComments: {
    type: Number
  },
  mentions: [String],
  tags: [String],
  boostsV2: [{type:boostSchema, required: true}],
  contentWarnings: String,
  commentsDisabled: Boolean,
  imageVersion: Number,
  images: [String],
  imageDescriptions: [String],
  imageIsVertical: [String], //stores either the string "vertical-image" or an empty string atm
  imageIsHorizontal: [String],
  subscribedUsers: [String],
  unsubscribedUsers: [String],
  embeds: [embedSchema],
  cachedHTML:{ //the below MTimes also set a floor for the rendering date of the cached comment html (none will have older cached html, newer comments may have newer cached html, either way it'll all be brought up to date when the post is displayed)
    imageGalleryHTML: String,
    imageGalleryMTime: Date, //the last modified date of the imagegallery template when the html was rendered
    embedsHTML: [String],
    embedsMTime: Date //the last modified date of the embeds template when the html was rendered, also goes for the comment embeds
  }
});

//used to select posts to display in feeds
postSchema.index({author:1});
postSchema.index({community:1});

//used to sort posts in feeds
postSchema.index({lastUpdated:-1});
postSchema.index({timestamp:-1});

//honestly only used by the active users graph but what the hell
postSchema.index({'comments.timestamp':-1});

// create the model for users and expose it to our app
module.exports = mongoose.model('Post', postSchema);
