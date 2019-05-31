var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
const Schema = mongoose.Schema;

var notificationSchema = new mongoose.Schema({
  category: String,
  sourceId: String,
  subjectId: String,
  timestamp: { type: Date, default: Date.now() },
  text: String,
  image: String,
  url: String,
  seen: { type: Boolean, default: false },
  clicked: { type: Boolean, default: false }
});


// define the schema for our user model
var userSchema = new mongoose.Schema({
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
  aboutRaw: String,
  aboutParsed: String,
  websiteRaw: String,
  websiteParsed: String,
  location: String,
  settings: {
    profileVisibility: { type: String, default: "invisible" },
    newPostPrivacy: { type: String, default: "public" },
  },
  notifications: [notificationSchema],
  communities: [{ type: Schema.Types.ObjectId, ref: 'Community' }],
  bannedCommunities: [{ type: Schema.Types.ObjectId, ref: 'Community' }],
  mutedCommunities: [{ type: Schema.Types.ObjectId, ref: 'Community' }]
});

// methods ======================
// generating a hash
userSchema.methods.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
userSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.password);
};

userSchema.index({username:1});

// create the model for users and expose it to our app
module.exports = mongoose.model('User', userSchema);
