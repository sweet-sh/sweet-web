const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

const imageSchema = new mongoose.Schema({
  filename: { type: String, unique: true },
  post: { type: DBReference, ref: 'Post' },
  description: String,
  height: Number,
  width: Number,
  orientation: { type: String, enum: ['horizontal', 'vertical', 'neutral'] }
})

imageSchema.index({ filename: 1 })

module.exports = mongoose.model('Image', imageSchema)
