var mongoose = require('mongoose');
const Schema = mongoose.Schema;

//okay so this schema is used in the embeds field in posts and comments but the name "embed" is misleading, it can also refer to link previews which are only kind of embeds, we just originally used this schema to preview video embeds
var embedSchema = new mongoose.Schema({
    type: String, //"video" or "link-preview"
    linkUrl: String,
    embedUrl: String, //only present if type == "video"
    title: String,
    description: String,
    image: String,
    domain: String,
    position: Number //if this is empty, the embed was just put at the end of the post
})

var commentSchema = new mongoose.Schema({
  authorEmail: String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: Date,
  rawContent: String,
  parsedContent: String,
  mentions: [String],
  tags: [String],

  //image parallel arrays
  images: [String],
  imageDescriptions: [String],
  imageIsVertical: [String],
  imageIsHorizontal: [String],
  imagePositions: [Number], //only present for newer comments, the images used to just all go at the end

  deleted: { type: Boolean, default: false },
  embeds: [embedSchema],
  cachedHTML:{ //was rendered with either the version of the template indicated by the post's corresponding cachedHTML MTime or the version that was available when the comment was made, whichever is newer
    commentHTML: String
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

  imageVersion: Number, //1=array of filenames accessible through /public/images/uploads; 2=array of filenames accessible through /api/images/display/ (which checks the user's permissions and the image's privacy;) and 3 is like the last one but uses the imagePositionsArray (they used to just show up at the end of the post)
  //image parallel arrays:
  images: [String],
  imageDescriptions: [String],
  imageIsVertical: [String],
  imageIsHorizontal: [String],
  imagePositions: [Number], //position within the post's text in characters

  subscribedUsers: [String],
  unsubscribedUsers: [String],
  embeds: [embedSchema],
  cachedHTML:{ //the below MTimes also set a floor for the rendering date of the cached comment html (none will have older cached html, newer comments may have newer cached html, either way it'll all be brought up to date when the post is displayed)
    postHTML: String,
    imageGalleryMTime: Date, //the last modified date of the imagegallery template when the html was rendered
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
