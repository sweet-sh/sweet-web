const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

const commentSchema = new mongoose.Schema({
  authorEmail: String,
  author: { type: DBReference, ref: 'User' },
  timestamp: Date,
  rawContent: String,
  parsedContent: String,
  mentions: [String],
  tags: [String]
})

const voteSchema = new mongoose.Schema({
  status: String, // 'active' or 'expired'
  type: String, // no longer used, i believe
  community: { type: DBReference, ref: 'Community' },
  reference: String, // what is possibly being changed: description, rules, joinType, visibility, voteLength, image, or name
  parsedReference: String, // a human-readble (non-camelCase) equivalent to one of the above
  proposedValue: String,
  parsedProposedValue: String,
  creatorEmail: String,
  creator: { type: DBReference, ref: 'User' },
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
  voters: [{ type: DBReference, ref: 'User' }],
  voteThreshold: Number,
  expiryTime: Date
})

// create the model for users and expose it to our app
module.exports = mongoose.model('Vote', voteSchema)
