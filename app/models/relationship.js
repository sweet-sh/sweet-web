const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

// define the schema for our user model
const relationshipSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  fromUser: { type: DBReference, ref: 'User' },
  toUser: { type: DBReference, ref: 'User' },
  value: {
    type: String,
    required: true // currently implemented possible values: follow, trust, flag, mute
  },
  note: {
    type: String
  }
})

relationshipSchema.index({ fromUser: 1, toUser: 1 })
relationshipSchema.index({ value: 1 })

// create the model for users and expose it to our app
module.exports = mongoose.model('Relationship', relationshipSchema)
