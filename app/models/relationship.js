var mongoose = require('mongoose');
const Schema = mongoose.Schema;

// define the schema for our user model
var relationshipSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  fromUser: { type: Schema.Types.ObjectId, ref: 'User' },
  toUser: { type: Schema.Types.ObjectId, ref: 'User' },
  value: {
		type: String,
		required: true
	},
  note: {
    type: String
  }
});

// create the model for users and expose it to our app
module.exports = mongoose.model('Relationship', relationshipSchema);
