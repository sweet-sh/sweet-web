const LocalStrategy   = require('passport-local').Strategy;

// load up the user model
const User            = require('../app/models/user');
const Relationship            = require('../app/models/relationship');

const crypto = require('crypto');

var apiConfig = require('./apis.js');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

// expose this function to our app using module.exports
module.exports = function(passport) {

    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
        User.findById(id, function(err, user) {
            done(err, user);
        });
    });

    // =========================================================================
    // LOCAL SIGNUP ============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

passport.use('signup', new LocalStrategy({
  // by default, local strategy uses username and password, we will override with email
  usernameField : 'email',
  passwordField : 'password',
  passReqToCallback : true // allows us to pass back the entire request to the callback
},
function(req, email, password, done) {

  // asynchronous
  // User.findOne wont fire unless data is sent back
  process.nextTick(function() {

    // find a user whose email is the same as the forms email
    // we are checking to see if the user trying to login already exists
    User.findOne({
      'username' : req.body.username
    },
    function(err,user) {
      if (err)
        return done(err);
      if (user) {
        req.session.sessionFlash = {
          type: 'warning',
          message: 'Sorry, this username is taken.',
          username: req.body.username,
          email: req.body.email
        }
        return done(null, false);
      }
      else {
        User.findOne({
          'email' :  email
        },
        function(err, user) {
          // if there are any errors, return the error
          if (err)
            return done(err);

            // check to see if there is already a user with that email
            if (user) {
              req.session.sessionFlash = {
                type: 'warning',
                message: 'An account with this email already exists. Is it yours?',
                username: req.body.username,
                email: req.body.email
              }
              return done(null, false);
            }
            else {
              // if there is no user with that email
              // create the user
              var newUser            = new User();

              // set the user's local credentials
              newUser.email    = email;
              newUser.password = newUser.generateHash(password);
              newUser.username = req.body.username;
              newUser.joined = new Date();
              newUser.verificationToken = crypto.randomBytes(20).toString('hex');
              newUser.verificationTokenExpiry = Date.now() + 3600000; // 1 hour

              // save the user
              newUser.save(function(err) {
                if (err)
                  throw err;
                const msg = {
                  to: email,
                  from: 'support@sweet.sh',
                  subject: 'sweet new user verification',
                  text: 'Hi! You are receiving this because you have created a new account on sweet with this email.\n\n' +
                  'Please click on the following link, or paste it into your browser, to verify your email:\n\n' +
                  'https://sweet.sh/verify-email/' + newUser.verificationToken + '\n\n' +
                  'If you did not create an account on sweet, please ignore and delete this email. The token will expire in an hour.\n'
                };
                sgMail.send(msg)
                .then(user => {
                  var sweetbotFollow = new Relationship();
                  sweetbotFollow.from = email;
                  sweetbotFollow.to = 'support@sweet.sh';
                  sweetbotFollow.value = 'follow'
                  sweetbotFollow.save(function(err) {
                    if (err)
                      throw err;
                    console.log("Saved sweetbot follow!")
                    return done(null, false);
                  })
                })
                .catch(error => {
                  req.session.sessionFlash = {
                    type: 'warning',
                    message: "There has been a problem sending your account verification email. Please try again in a few minutes.",
                    username: req.body.username,
                    email: req.body.email
                  }
                  return done(null, false);
                  console.error(error.toString());
                })
              });
            }
          })
        }
      })
    })
  }))


    // =========================================================================
    // LOCAL LOGIN =============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
    // by default, if there was no name, it would just be called 'local'

    passport.use('login', new LocalStrategy({
        // by default, local strategy uses username and password, we will override with email
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true // allows us to pass back the entire request to the callback
    },
    function(req, email, password, done) { // callback with email and password from our form
        // find a user whose email is the same as the forms email
        // we are checking to see if the user trying to login already exists
        User.findOne({ 'email' :  email },
          function(err, user) {
            // if there are any errors, return the error before anything else
            if (err)
                return done(err);

            // if no user is found, return the message
            if (!user) {
              req.session.sessionFlash = {
                type: 'warning',
                message: 'Please check your email and password.'
              }
              return done(null, false);
            }
            // if the user is found but the password is wrong
            if (!user.validPassword(password)) {
              req.session.sessionFlash = {
                type: 'warning',
                message: 'Please check your email and password.'
              }
              return done(null, false);
            }
            if (!user.isVerified) {
              req.session.sessionFlash = {
                type: 'warning',
                message: 'Your email address has not been verified. <a class="alert-link" href="https://sweet.sh/resend-token">Need a new verification token?</a>'
              }
              return done(null, false);
            }
            // all is well, return successful user
            return done(null, user);
        });

    }));

};
