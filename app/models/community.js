const mongoose = require('mongoose');
const DBReference = mongoose.Schema.Types.ObjectId

// define the schema for our user model
const communitySchema = new mongoose.Schema({
  created: Date,
  lastUpdated: Date,
  name: String,
  url: String,
  slug: String,
  descriptionRaw: String,
  descriptionParsed: String,
  rulesRaw: String,
  rulesParsed: String,
  welcomeMessageRaw: String,
  welcomeMessageParsed: String,
  welcomeMessageAuthor: { type: DBReference, ref: 'User' },
  image: String,
  imageEnabled: Boolean,
  settings: {
    visibility: String,
    joinType: String,
    voteThreshold: Number,
    voteLength: Number
  },
  members: [{ type: DBReference, ref: 'User' }],
  membersCount: Number,
  requestsCount: Number,
  bannedMembers: [{ type: DBReference, ref: 'User' }],
  mutedMembers: [{ type: DBReference, ref: 'User' }],
  mutedMembersCount: Number,
  votingMembersCount: Number,
  membershipRequests: [{ type: DBReference, ref: 'User' }],
  posts: [{ type: DBReference, ref: 'Post' }],
  votes: [{ type: DBReference, ref: 'Vote' }]
})

communitySchema.pre('save', function (next) {
  if (this.members) {
    if (!this.votingMembersCount) { this.votingMembersCount = this.members.length }
    this.membersCount = this.members.length
    this.requestsCount = this.membershipRequests.length
    this.mutedMembersCount = this.mutedMembers.length
    const membersIds = this.members.map(String)
    const mutedMembersIds = this.mutedMembers.map(String)
    const mutedUsersWhoAreMembers = mutedMembersIds.filter(id => membersIds.includes(id))
    const votingMembers = this.membersCount - mutedUsersWhoAreMembers.length
    this.votingMembersCount = votingMembers
    if (this.membersCount === 0) {
      this.settings.joinType = 'open'
      this.membershipRequests = []
      this.requestsCount = 0
    }
  }
  next()
})

communitySchema.index({ slug: 1 })

const communityPlaceholderSchema = new mongoose.Schema({
  name: String,
  slug: String,
  community: { type: DBReference, ref: 'Community' },
  vote: { type: DBReference, ref: 'Vote' }
})

// just retrieve this with mongoose.model('Community Placeholder') in the one place in which it is needed
mongoose.model('Community Placeholder', communityPlaceholderSchema)

// create the model for users and expose it to our app
module.exports = mongoose.model('Community', communitySchema)
