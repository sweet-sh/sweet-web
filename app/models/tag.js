const mongoose = require('mongoose')

const tagSchema = new mongoose.Schema({
  name: String,
  posts: [String],
  lastUpdated: Date
})

tagSchema.index({ name: 1 })

module.exports = mongoose.model('Tag', tagSchema)
