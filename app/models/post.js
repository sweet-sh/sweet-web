var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var commentSchema = new mongoose.Schema({
  authorEmail: {
    type: String,
    required: true
  },
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: {
		type: Date,
		required: true
	},
  rawContent: {
    type: String,
    required: false
  },
  parsedContent: {
    type: String
  },
  mentions: [String],
  tags: [String],
  images: [String],
  imageDescriptions: [String]
});

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
  boostTarget: { type: Schema.Types.ObjectId, ref: 'Post' }, //deprecated
  numberOfComments: {
    type: Number
  },
  mentions: [String],
  tags: [String],
  boosts: [String], //deprecated
  boostsV2: [{type:boostSchema, required: true}],
  contentWarnings: String,
  commentsDisabled: Boolean,
  imageVersion: Number,
  images: [String],
  imageDescriptions: [String],
  subscribedUsers: [String],
  unsubscribedUsers: [String],
  linkPreview: {
    url: String,
    domain: String,
    title: String,
    description: String,
    image: String
  }
});

postSchema.index({lastUpdated:-1});
postSchema.index({"boostsV2.booster":1});

// create the model for users and expose it to our app
module.exports = mongoose.model('Post', postSchema);
