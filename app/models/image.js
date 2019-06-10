var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var imageSchema = new mongoose.Schema({
  context: String,
  filename: {type: String, unique: true},
  privacy: String,
  accessToken: String,
  user: String,
  community: String,
  tags: String,
  description: String,
  height: Number,
  width: Number,
  quality: String,
});

imageSchema.index({filename:1});

module.exports = mongoose.model('Image', imageSchema);
