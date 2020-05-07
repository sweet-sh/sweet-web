const bcrypt = require('bcrypt-nodejs')
const mongoose = require('mongoose')
const DBReference = mongoose.Schema.Types.ObjectId

const notificationSchema = new mongoose.Schema({
  category: String,
  sourceId: String,
  subjectId: String,
  timestamp: { type: Date, default: Date.now() },
  text: String,
  image: String,
  url: String,
  seen: { type: Boolean, default: false },
  clicked: { type: Boolean, default: false }
})

// define the schema for our user model
const userSchema = new mongoose.Schema({
  joined: Date,
  lastOnline: Date,
  lastUpdated: { type: Date, required: true, default: Date.now() },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpiry: { type: Date },
  email: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  passwordResetToken: String,
  passwordResetTokenExpiry: Date,
  image: {
    type: String
  },
  imageEnabled: {
    type: Boolean
  },
  displayName: String,
  pronouns: String,
  aboutRaw: String,
  aboutParsed: String,
  websiteRaw: String,
  websiteParsed: String,
  location: String,
  settings: {
    theme: { type: String, default: 'light' },
    timezone: { type: String, default: 'auto' },
    autoDetectedTimeZone: { type: String, default: '' }, // this will get set to moment's guess of their timezone as soon as they next make a settings change, which they'll have to do to start getting emails which is the only thing that brings timezones into play anyway
    profileVisibility: { type: String, default: 'invisible' },
    newPostPrivacy: { type: String, default: 'public' },
    imageQuality: { type: String, default: 'standard' },
    homeTagTimelineSorting: { type: String, default: 'fluid' },
    userTimelineSorting: { type: String, default: 'chronological' },
    communityTimelineSorting: { type: String, default: 'fluid' },
    flashRecentComments: { type: Boolean, default: true },
    digestEmailFrequency: { type: String, default: 'off' },
    emailTime: { type: String, default: '17:00' },
    emailDay: { type: String, default: 'Sunday' },
    showRecommendations: { type: Boolean, default: true },
    showHashtags: { type: Boolean, default: true },
    sendMentionEmails: { type: Boolean, default: true }
  },
  notifications: [notificationSchema],
  pushNotifSubscriptions: [String],
  expoPushTokens: [String],
  communities: [{ type: DBReference, ref: 'Community' }],
  bannedCommunities: [{ type: DBReference, ref: 'Community' }],
  mutedCommunities: [{ type: DBReference, ref: 'Community' }],
  hiddenRecommendedUsers: [String],
  hiddenRecommendedCommunities: [String]
})

// Middleware
userSchema.pre('validate', function (next) {
  if (this.image && this.image.length > 1 && !this.image.startsWith('users/')) {
    this.image = 'users/' + this.image
  }
  next()
});

// methods ======================
// generating a hash
userSchema.methods.generateHash = function (password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null)
}

// checking if password is valid
userSchema.methods.validPassword = function (password) {
  return bcrypt.compareSync(password, this.password)
}

userSchema.index({ username: 1 })

// create the model for users and expose it to our app
module.exports = mongoose.model('User', userSchema)
