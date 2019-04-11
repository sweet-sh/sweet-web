var mongoose = require('mongoose');
const Schema = mongoose.Schema;

// var optionSchema = new mongoose.Schema({
//   title: String,
//   votes: Number,
//   voters: [{ type: Schema.Types.ObjectId, ref: 'User' }]
// });

var commentSchema = new mongoose.Schema({
  authorEmail: String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: Date,
  rawContent: String,
  parsedContent: String,
  mentions: [String],
  tags: [String]
});

var voteSchema = new mongoose.Schema({
  status: String,
  type: String,
  community: { type: Schema.Types.ObjectId, ref: 'Community' },
  reference: String,
  parsedReference: String,
  proposedValue: String,
  parsedProposedValue: String,
  creatorEmail: String,
  creator: { type: Schema.Types.ObjectId, ref: 'User' },
  url: String,
  timestamp: Date,
  lastUpdated: Date,
  rawContent: String,
  parsedContent: String,
  comments: [commentSchema],
  numberOfComments: Number,
  mentions: [String],
  tags: [String],
  commentsDisabled: Boolean,
  votes: Number,
  voters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  voteThreshold: Number,
  expiryTime: Date,
});

// create the model for users and expose it to our app
module.exports = mongoose.model('Vote', voteSchema);
