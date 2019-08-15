var mongoose = require('mongoose');
const Schema = mongoose.Schema;

//this is used by older posts instead of the below inlineElementSchema
var embedSchema = new mongoose.Schema({
    type: String, //"video" always
    linkUrl: String,
    embedUrl: String,
    title: String,
    description: String,
    image: String,
    domain: String,
})

var inlineElementSchema = new mongoose.Schema({
  type: String, //either "link-preview" or "image(s)"

  position: Number, //what number "paragraph" this should be when it's mixed into parsedContent, where a paragraph is a <p>...</p>, <ul>...</ul>, or a <blockquote></blockquote>.
  
  //used if link-preview:
  isEmbeddableVideo: Boolean,
  linkUrl: String,
  embedUrl: String, //only defined if isEmbeddableVideo is true
  title: String,
  image: String,
  description: String,
  domain: String,

  //used if image(s) (yeah, it's the same parallel arrays as the the old post formats):
  images: [String],
  imageDescriptions: [String],
  //it would take a database transform for the old posts, but these fields should probably be combined into imageOrientationType or something. currently, if an image is vertical
  //it has 'vertical-image' stored at the same index as it in the imageIsVertical array and a blank string otherwise, and the same for horizontality. imageOrientationType could just
  //store 'vertical-image', 'horizontal-image', or a blank string.
  imageIsVertical: [String],
  imageIsHorizontal: [String],
});

//this is really similar to the embed schema but i only just realized that and i don't feel like changing this
var linkPreviewCacheSchema = new mongoose.Schema({
    isEmbeddableVideo: Boolean,
    linkUrl: String,
    embedUrl: String, //only used if isEmbeddableVideo is true
    title: String,
    image: String,
    description: String,
    domain: String,
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
  //it would take a database transform for the old posts, but these fields should probably be combined into imageOrientationType or something. currently, if an image is vertical
  //it has 'vertical-image' stored at the same index as it in the imageIsVertical array and a blank string otherwise, and the same for horizontality. imageOrientationType could just
  //store 'vertical-image', 'horizontal-image', or a blank string.
  imageIsVertical: [String],
  imageIsHorizontal: [String],

  inlineElements: [inlineElementSchema], //this is used instead of the image parallel arrays in newer comments. keep in mind you can't check the post's imageVersion to see if this was used, bc comments using this model can still be made on old posts

  deleted: { type: Boolean, default: false },
  cachedHTML:{ //was rendered with either the versions of the templates indicated by the post's corresponding cachedHTML MTimes or the version that was available when the comment was created, whichever is newer
    fullContentHTML: String
  }
});

commentSchema.add({ replies: [commentSchema] });

var boostSchema = new mongoose.Schema({
  booster: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  timestamp: {type: Date, required: true},
  boost: {type: Schema.Types.ObjectId, ref: 'Post'}
})

var postSchema = new mongoose.Schema({
  type: String, //"user" or "community"
  community: { type: Schema.Types.ObjectId, ref: 'Community' }, //hopefully undefined if type=="user"
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
  //boosts of this post will produce seperate post documents in the database that are linked to here. they link back to the original post through the boostTarget field.
  boostsV2: [{type:boostSchema, required: true}],
  contentWarnings: String,
  commentsDisabled: Boolean,

  //1: array of filenames stored in /public/images/uploads/[filename] (and so publicly accessible through the url /images/uploads/[filename]);
  //2=array of filenames stored in /cdn/images/[filename] accessible through /api/image/display/[filename] (which checks the user's permissions and the image's privacy;) and
  //3: image data stored in inlineElements instead and accessible using that second url/path scheme
  //comments may have an older imageVersion if the post was edited or a newer one if the comments are more recent than the post
  imageVersion: Number,

  //image parallel arrays (no positions, images were all put at the end):
  images: [String],
  imageDescriptions: [String],
  //it would take a database transform for the old posts, but these fields should probably be combined into imageOrientationType or something. currently, if an image is vertical
  //it has 'vertical-image' stored at the same index as it in the imageIsVertical array and a blank string otherwise, and the same for horizontality. imageOrientationType could just
  //store 'vertical-image', 'horizontal-image', or a blank string.
  imageIsVertical: [String],
  imageIsHorizontal: [String],

  subscribedUsers: [String],
  unsubscribedUsers: [String],

  embeds: [embedSchema], //this was only used simultanously with imageVersion 2, so you can check for that i guess. embeds are stored in inlineElements under version 3

  inlineElements: [inlineElementSchema], //this is used instead of the image parallel arrays and the embeds in newer posts

  cachedHTML:{ //the below MTimes also set a floor for the rendering date of the cached comment html (none will have older cached html, newer comments may have newer cached html, either way it'll all be brought up to date when the post is displayed)
    fullContentHTML: String,
    imageGalleryMTime: Date, //the last modified date of the imagegallery template when the html was rendered
    embedsMTime: Date //the last modified date of the embeds template when the html was rendered
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

linkPreviewCacheSchema.index({linkUrl:1});
//just retrieve this with mongoose.model('Cached Link Metadata') in the one place in which it is needed
mongoose.model('Cached Link Metadata', linkPreviewCacheSchema);

// create the model for users and expose it to our app
module.exports = mongoose.model('Post', postSchema);
