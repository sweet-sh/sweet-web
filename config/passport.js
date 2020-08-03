const LocalStrategy   = require('passport-local').Strategy;

// load up the user model
const User            = require('../app/models/user');
const Relationship            = require('../app/models/relationship');

const crypto = require('crypto');

const emailer = require('../app/emailer');

// const sgMail = require('../app/mail');

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
          type: 'alert',
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
                type: 'alert',
                message: 'An account with this email already exists. Is it yours?',
                username: req.body.username,
                email: req.body.email
              }
              return done(null, false);
            }
            else {
              // if there is no user with that email
              // create the user
              const newUser = new User();

              // set the user's local credentials
              newUser.email = email;
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
                  from: '"Sweet" <support@sweet.sh>',
                  subject: 'Sweet - new user verification',
                  text: 'Hi! You are receiving this because you have created a new account on sweet with this email.\n\n' +
                  'Please click on the following link, or paste it into your browser, to verify your email:\n\n' +
                  'https://sweet.sh/verify-email/' + newUser.verificationToken + '\n\n' +
                  'If you did not create an account on sweet, please ignore and delete this email. The token will expire in an hour.\n'
                };
                emailer.transporter.sendMail(msg, (err, info) => {
                  if (err) {
                    req.session.sessionFlash = {
                      type: 'alert',
                      message: 'There has been a problem sending your account verification email. Please get in touch with us at support@sweet.sh and we\'ll sort it out for you.',
                      username: req.body.username,
                      email: req.body.email
                    }
                    res.redirect(301, '/resend-token')
                    console.error(error.toString())
                  } else if (info) {
                    console.log("Message sent: %s", info.messageId);
                    const sweetbotFollow = new Relationship();
                    sweetbotFollow.from = email;
                    sweetbotFollow.to = 'support@sweet.sh';
                    sweetbotFollow.toUser = '5c962bccf0b0d14286e99b68';
                    sweetbotFollow.fromUser = newUser._id;
                    sweetbotFollow.value = 'follow'
                    sweetbotFollow.save(function(err) {
                      if (err)
                        throw err;
                      console.log("Saved sweetbot follow!")
                      return done(null, false);
                    });
                  }
                });
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
                type: 'alert',
                message: 'Please check your email and password.',
                email: req.body.email
              }
              return done(null, false);
            }
            // if the user is found but the password is wrong
            if (!user.validPassword(password)) {
              req.session.sessionFlash = {
                type: 'alert',
                message: 'Please check your email and password.',
                email: req.body.email
              }
              return done(null, false);
            }
            if (!user.isVerified) {
              req.session.sessionFlash = {
                type: 'alert',
                message: 'Your email address has not been verified. <a class="message-link" href="https://sweet.sh/resend-token">Need a new verification token?</a>'
              }
              return done(null, false);
            }
            // all is well, return successful user
            return done(null, user);
        });

    }));

};
