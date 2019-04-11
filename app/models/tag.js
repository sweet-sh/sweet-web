var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var tagSchema = new mongoose.Schema({
  name: String,
  posts: [String]
});

module.exports = mongoose.model('Tag', tagSchema);
