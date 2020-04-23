const mongoose = require('mongoose')

const imageSchema = new mongoose.Schema({
  context: String, // either "user" or "community", corresponding to the post schema's type field's values "original" and "community"
  filename: { type: String, unique: true },
  url: { type: String, unique: true },
  privacy: String,
  accessToken: String,
  user: String,
  community: String,
  tags: String,
  description: String,
  height: Number,
  width: Number,
  quality: String
})

imageSchema.index({ filename: 1 })

module.exports = mongoose.model('Image', imageSchema)
