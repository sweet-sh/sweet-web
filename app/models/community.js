var mongoose = require('mongoose');
const Schema = mongoose.Schema;

// define the schema for our user model
var communitySchema = new mongoose.Schema({
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
  image: String,
  imageEnabled: Boolean,
  settings: {
    visibility: String,
    joinType: String,
    voteThreshold: Number,
    voteLength: Number
  },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  membersCount: Number,
  requestsCount: Number,
  bannedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  mutedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  mutedMembersCount: Number,
  votingMembersCount: Number,
  membershipRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
  votes: [{ type: Schema.Types.ObjectId, ref: 'Vote' }]
});

communitySchema.pre('validate', function (next) {
  if (!this.votingMembersCount)
    this.votingMembersCount = this.members.length;
  this.membersCount = this.members.length
  this.requestsCount = this.membershipRequests.length
  this.mutedMembersCount = this.mutedMembers.length
  membersIds = this.members.map(String)
  mutedMembersIds = this.mutedMembers.map(String)
  mutedUsersWhoAreMembers = mutedMembersIds.filter(id => membersIds.includes(id))
  votingMembers = this.membersCount - mutedUsersWhoAreMembers.length
  this.votingMembersCount = votingMembers;
  if (this.membersCount === 0) {
    this.settings.joinType = "open";
    this.membershipRequests = [];
    this.requestsCount = 0;
  }
  next();
});

// create the model for users and expose it to our app
module.exports = mongoose.model('Community', communitySchema);
