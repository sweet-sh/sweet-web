var mongoose = require('mongoose');

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
