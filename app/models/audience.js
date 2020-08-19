const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

const audienceSchema = new mongoose.Schema({
  owner: { type: DBReference, ref: 'User' }, // A user _id
  type: {
    type: String,
    required: true,
    enum: ['public', 'trusted', 'intimate']
  },
  users: [{ type: DBReference, ref: 'User' }], // An array of user _ids
})

audienceSchema.index({ fromUser: 1, toUser: 1 })
audienceSchema.index({ value: 1 })

// create the model for users and expose it to our app
module.exports = mongoose.model('Audience', audienceSchema)

/**
 * Audience-member methods
 * =======================
 * 
 * CREATE - Add a member to an audience
 * REMOVE
 * UPDATE
 * DELETE
 * 
 * Add someone to your public audience - they can read your public posts. This doesn't make sense - the equivalent of 'follow' would be 'add yourself to someone's public audience', i.e. include their posts in the posts you see. 
 */