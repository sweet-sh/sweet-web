var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var boostSchema = new mongoose.Schema({
  post: { type: Schema.Types.ObjectId, ref: 'Post' },
  postId: String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
  authorEmail: String,
  privacy: String,
  timestamp: Date,
  lastUpdated: Date
});

// create the model for users and expose it to our app
module.exports = mongoose.model('Boost', boostSchema);
