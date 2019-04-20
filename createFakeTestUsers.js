//This file just creates 5 fun test users for testing Sweet with on a test database.
//Do not run more than once


User = require('./app/models/user');
var configDatabase = require('./config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, { useNewUrlParser: true }); // connect to our database


var newUser = new User();
// set the user's local credentials
newUser.email    = 'fakeemail1@email.email';
newUser.password = newUser.generateHash('fakepassword1');
newUser.username = 'smeep-blorpum';
newUser.joined = new Date();
newUser.isVerified = true;
newUser.displayName = 'Smeep Blorpum'

newUser.save();

var newUser2 = new User();
// set the user's local credentials
newUser2.email    = 'fakeemail2@email.email';
newUser2.password = newUser2.generateHash('fakepassword2');
newUser2.username = 'bleep-smorpum';
newUser2.joined = new Date();
newUser2.isVerified = true;
newUser2.displayName = 'Bleep Smorpum'

newUser2.save();

var newUser3 = new User();
// set the user's local credentials
newUser3.email    = 'fakeemail3@email.email';
newUser3.password = newUser3.generateHash('fakepassword3');
newUser3.username = 'johamm';
newUser3.joined = new Date();
newUser3.isVerified = true;
newUser3.displayName = 'Jonn Hamm'

newUser3.save();

var newUser4 = new User();
// set the user's local credentials
newUser4.email    = 'fakeemail4@email.email';
newUser4.password = newUser4.generateHash('fakepassword4');
newUser4.username = 'especially-on-sundays';
newUser4.joined = new Date();
newUser4.isVerified = true;
newUser4.displayName = 'The World Is Quiet Here'

newUser4.save();

var newUser5 = new User();
// set the user's local credentials
newUser5.email    = 'fakeemail5@email.email';
newUser5.password = newUser5.generateHash('fakepassword5');
newUser5.username = 'smeep-smeepum';
newUser5.joined = new Date();
newUser5.isVerified = true;
newUser5.displayName = 'Smeep Smeepum'

newUser5.save().then(() => {
    process.exit();
});