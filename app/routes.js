const User            = require('../app/models/user');
const Relationship    = require('../app/models/relationship');
const Post    = require('../app/models/post');
const Tag    = require('../app/models/tag');
const Community    = require('../app/models/community');
const Vote    = require('../app/models/vote');
const Image    = require('../app/models/image');
var ObjectId = require('mongoose').Types.ObjectId;

const reservedUsernames =  require('../config/reserved-usernames.js')
var bcrypt   = require('bcrypt-nodejs');
var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
const fileType = require('file-type');
const crypto = require('crypto');
var Autolinker = require( 'autolinker' );
var notifier = require('./notifier.js');

sanitizeHtmlOptions = {
  allowedTags: [ 'em', 'strong', 'a', 'p', 'br', 'div', 'span' ],
  allowedAttributes: {
    'a': [ 'href', 'data-*', 'target', 'rel' ]
  }
}

moment.locale('en', {
    relativeTime : {
        future: "in %s",
        past:   "%s ago",
        s  : '1s',
        ss : '%ds',
        m:  "1m",
        mm: "%dm",
        h:  "1h",
        hh: "%dh",
        d:  "1d",
        dd: "%dd",
        M:  "1mon",
        MM: "%dmon",
        y:  "1y",
        yy: "%dy"
    }
});

var sanitize = require('mongo-sanitize');
const sharp = require('sharp');
var shortid = require('shortid');
const fs = require('fs');
const request = require('request');

// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

var imaggaOptions = {
    headers: {
     'Authorization': apiConfig.imagga
   }
};


module.exports = function(app, passport) {

  //Responds to get requests for images on the server. If the image is private, checks to see
  //if the user is trusted/in the community first.
  //Input: URL of an image
  //Output: Responds with either the image file or a redirect response to /404 with 404 status.
  app.get('/api/image/display/:filename', function(req,res){
    Image.findOne({
      filename: req.params.filename
    })
    .then(image => {
      if (image.privacy === "public"){
        res.sendFile(global.appRoot + '/cdn/images/' + req.params.filename);
      }
      else if (image.privacy === "private"){
        if (req.isAuthenticated()){
          if (image.context === "user") {
            Relationship.find({
              toUser: loggedInUserData._id,
              value: "trust"
            })
            .then(trusts => {
              usersWhoTrustMe = trusts.map(a => a.fromUser.toString());
              usersWhoTrustMe.push(req.user._id.toString());
              console.log(usersWhoTrustMe)
              if (usersWhoTrustMe.includes(image.user)){
                res.sendFile(global.appRoot + '/cdn/images/' + req.params.filename);
              }
              else {
                res.status('404')
                res.redirect('/404');
              }
            })
          }
          else if (image.context === "community") {
            Community.find({
              members: loggedInUserData._id
            })
            .then(communities => {
              joinedCommunities = communities.map(a => a._id.toString());
              if (joinedCommunities.includes(image.community)){
                res.sendFile(global.appRoot + '/cdn/images/' + req.params.filename);
              }
              else {
                res.status('404')
                res.redirect('/404');
              }
            })
          }
        }
        else {
          console.log("Not logged in")
          res.redirect('/404');
          res.status('404')
        }
      }
    })
    .catch(error => {
      res.status('404');
    })
  })

  //Responds to get requests for '/'. 
  //Input: none
  //Output: redirect to '/home' if logged in, render of the index page if logged out.
  app.get('/', function(req, res) {
    if (req.isAuthenticated()){
      res.redirect('/home');
    }
    else {
      User.count()
      .then(users => {
        res.render('index', {
          userCount: users
        });
      })
    }
  });

  //Responds to get requests for the login page.
  //Input: flash message
  //Output: rendering of the login page with the flash message included.
  app.get('/login', function(req, res) {
      res.render('login', { sessionFlash: res.locals.sessionFlash });
  });

  //Responds to get requests for the signup page.
  //Input: flash message
  //Output: rendering of the signup page with the flash message included.
  app.get('/signup', function(req, res) {
      res.render('signup', { sessionFlash: res.locals.sessionFlash });
  });

  //Responds to get requests for email verification that don't have the verification token included. Deprecated? When would this happen
  //Input: none
  //Output: redirect to /login with a 301 code and "No token provided" in the flash message.
  app.get('/verify-email', function(req, res){
    req.session.sessionFlash = {
      type: 'warning',
      message: "No token provided."
    }
    res.redirect(301, '/login');
  });

  //Responds to get requests for email verification that include the verification token.
  //Input: the token
  //Output: rendering of verify-email with the token as a hidden input on the page and the email autofilled from sessionFlash.
  app.get('/verify-email/:verificationtoken', function(req, res){
    res.render('verify-email', { sessionFlash: res.locals.sessionFlash, token: req.params.verificationtoken });
  })

  //Responds to post requests for email verification.
  //Input: the email address and the verification token
  //Output: A redirect to /verify-email/... if the email is wrong or there's an error saving the user,
  //redirect to /resend-token if the token is wrong or if there is a database error finding the user, or a
  //redirect to /login and the user's isVerified property being set to true if everything's right.
  app.post('/verify-email', function(req, res){
    req.checkBody('email', 'Please enter a valid email.').isEmail().isLength({max:80});
    req.getValidationResult().then(function (result) {
      if (!result.isEmpty()) {
        console.log("Not an email")
        var errors = result.array().map(function (elem) {
          return elem.msg
        }).join("<hr>");
        req.session.sessionFlash = {
          type: 'warning',
          message: errors,
          email: req.body.email
        }
        res.redirect(301, '/verify-email/' + req.body.verificationToken);
      }
      else {
        User.findOne({
          email: req.body.email,
          verificationToken: req.body.verificationToken,
          verificationTokenExpiry: { $gt: Date.now() }
        })
        .then(user => {
          if (!user){
            console.log("No such user")
            req.session.sessionFlash = {
              type: 'warning',
              message: "Email verification token invalid or has expired. Enter your email below to resend the token."
            }
            res.redirect(301, '/resend-token');
          }
          else {
            user.isVerified = true;
            user.save()
            .then(user => {
              req.session.sessionFlash = {
                type: 'success',
                message: "Your email has been verified successfully. Please log in below."
              }
              res.redirect(301, '/login');
            })
            .catch(err => {
              console.log("Cannot save user")
              console.error(err)
              req.session.sessionFlash = {
                type: 'warning',
                message: "An error occured while verifying your token. Please try again."
              }
              res.redirect(301, '/verify-email/' + req.body.verificationToken);
            })
          }
        })
        .catch(err => {
          console.log("Cannot access database")
          console.error(err)
          req.session.sessionFlash = {
            type: 'warning',
            message: "Email verification token invalid or has expired. Enter your email below to resend the token."
          }
          res.redirect(301, '/resend-token');
        })
      }
    });
  });

  //Responds to get requests for /resend-token
  //Input: flash message
  //Output: renders resend-token with flash message
  app.get('/resend-token', function(req, res){
    res.render('resend-token', { sessionFlash: res.locals.sessionFlash });
  });

  //Responds to post requests from /resend-token
  //Input: email address
  //Output: a redirect to /resend-token with a new flash message. Does not actually send emails??? I can't get it to.
  app.post('/resend-token', function(req, res){
    User.findOne({
      email: req.body.email
    })
    .then(user => {
      if (!user){ // There is no user registered with this email.
        req.session.sessionFlash = {
          type: 'success',
          message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page.",
          email: req.body.email
        }
        res.redirect(301, '/resend-token');
      }
      else if (user.isVerified){ // This email address is aleady verified.
        req.session.sessionFlash = {
          type: 'success',
          message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page.",
          email: req.body.email
        }
        res.redirect(301, '/resend-token');
      }
      else { // Actual success
        user.verificationToken = crypto.randomBytes(20).toString('hex');
        user.verificationTokenExpiry = Date.now() + 43200000; // 12 hours
        user.save()
        .then(user => {
          req.session.sessionFlash = {
            type: 'success',
            message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page."
          }
          res.redirect(301, '/resend-token');
        })
        .catch(err => {
          req.session.sessionFlash = {
            type: 'warning',
            message: "There has been a problem sending your token. Please try again in a few minutes.",
            email: req.body.email
          }
          res.redirect(301, '/resend-token');
        })
      }
    })
    .catch(err => {
      req.session.sessionFlash = {
        type: 'warning',
        message: "There has been a problem sending your token. Please try again in a few minutes.",
        email: req.body.email
      }
      res.redirect(301, '/resend-token');
    })
  });

  //Responds to get requests for /forgot-password without a password reset token
  //Input: flash message
  //Output: renders forgot-password with flash message
  app.get('/forgot-password', function(req, res) {
      res.render('forgot-password', { sessionFlash: res.locals.sessionFlash });
  });

  //Responds to get requests for /forgot-password with a password reset token
  //Input: password reset token
  //Output: a redirect to /forgot-password with flash message if the token is wrong,
  //a redirect to reset-password if the token is right
  app.get('/reset-password/:token', function(req, res) {
    User.findOne({
      passwordResetToken: req.params.token,
      passwordResetTokenExpiry: { $gt: Date.now() }
    })
    .then(user => {
      if (!user){
        console.log("Wrong token on GET")
        req.session.sessionFlash = {
          type: 'warning',
          message: "Password reset token is invalid or has expired."
        }
        res.redirect(301, '/forgot-password');
      }
      else {
        console.log("Correct token")
        res.render('reset-password', { sessionFlash: res.locals.sessionFlash, resetToken: req.params.token });
      }
    })
  });

  //Responds to post requests from /forgot-password by sending a password reset email with a token
  //Input: the user's email
  //Ouput: just a redirect to /forgot-password with an incorrect flash message if the email is wrong,
  //an email with a link to /reset-password with a token if the email is right and the token saved in 
  //the database, or a redirect to /forgot-password with a warning message if the email or database apis return errors.
  app.post('/forgot-password', function(req, res) {
    require('crypto').randomBytes(20, function(err, buffer) {
      token = buffer.toString('hex');
    })
    User.findOne({
      email: req.body.email
    })
    .then(user => {
      if (!user){ // No account with this email address exists.
        req.session.sessionFlash = {
          type: 'warning',
          message: 'An email has been sent to ' + req.body.email + ' with further instructions. Please check your spam or junk folder if it does not arrive in the next few minutes.',
          email: req.body.email
        }
        res.redirect(301, '/forgot-password');
      }
      user.passwordResetToken = token;
      user.passwordResetTokenExpiry = Date.now() + 3600000; // 1 hour
      user.save()
      .then(user => {
        const msg = {
          to: req.body.email,
          from: 'support@sweet.sh',
          subject: 'sweet password reset request',
          text: 'Hi! You are receiving this because someone has requested a reset of the password for your sweet account.\n\n' +
          'Please click on the following link, or paste it into your browser, to reset your password:\n\n' +
          'https://sweet.sh/reset-password/' + token + '\n\n' +
          'If you did not request this email, please ignore this email and your password will remain unchanged. The password reset will expire in 1 hour.\n'
        };
        sgMail.send(msg)
        .then(user => {
          req.session.sessionFlash = {
            type: 'info',
            message: 'An email has been sent to ' + req.body.email + ' with further instructions. Please check your spam or junk folder if it does not arrive in the next few minutes.'
          }
          res.redirect(301, '/forgot-password');
        })
        .catch(error => {
          req.session.sessionFlash = {
            type: 'warning',
            message: "There has been a problem sending your recovery email. Please try again in a few minutes.",
            email: req.body.email
          }
          res.redirect(301, '/forgot-password');
          console.error(error.toString());
        })
      })
      .catch(error => {
        req.session.sessionFlash = {
          type: 'warning',
          message: "There has been a problem sending your recovery email. Please try again in a few minutes.",
          email: req.body.email
        }
        res.redirect(301, '/forgot-password');
        console.error(error.toString());
      })
    });
  });

  //Responds to post requests with new passwords from the passport reset page.
  //Input: the new password, the reset token, the username, and the email
  //Output: a redirect to /forgot-password with a flash message if the token is wrong, a redirect to /reset-password
  //with the token and a warning message if the new password is invalid, a new password for the user and an email
  //telling the user they've reset the passport and a redirect to /login if everything is right, or a redirect to /reset-password
  //with the token if there was a database error saving the user's new password.
  app.post('/reset-password/:token', function(req, res) {
    console.log(req.params.token)
    User.findOne({
      passwordResetToken: req.params.token,
      passwordResetTokenExpiry: { $gt: Date.now() }
    })
    .then(user => {
      console.log(user)
      if (!user) {
        console.log("Wrong token (apparently)")
        req.session.sessionFlash = {
          type: 'warning',
          message: "Password reset token is invalid or has expired."
        }
        res.redirect(301, '/forgot-password');
      }
      else {
        console.log("Checking body")
        req.checkBody('password', 'Password must be at least 8 characters long.').isLength({min: 8});
        req.checkBody('password', 'Passwords do not match.').equals(req.body.passwordrepeat)
        req.getValidationResult().then(function (result) {
          if (!result.isEmpty()) {
            var errors = result.array().map(function (elem) {
              return elem.msg
            }).join("<hr>");
            req.session.sessionFlash = {
              type: 'warning',
              message: errors,
              username: req.body.username,
              email: req.body.email
            }
            res.redirect(301, '/reset-password/' + req.params.token);
          }
          else {
            console.log("Body is fine, changing password")
            user.password = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(8), null);
            user.passwordResetToken = "";
            user.passwordResetTokenExpiry = "";
            user.save()
            .then(user => {
              const msg = {
                to: user.email,
                from: 'support@sweet.sh',
                subject: 'sweet password sucessfully reset',
                text: 'Hi! The password on your sweet account ' + user.email + ' has just been changed.\n\n' +
                'If you did not do this, please get in touch with sweet support at support@sweet.sh immediately.\n'
              };
              sgMail.send(msg)
              .then(user => {
                req.session.sessionFlash = {
                  type: 'info',
                  message: 'Your password has been successfully changed. You can now log in with your email and new password.'
                }
                res.redirect(301, '/login');
              })
            })
            .catch(error => {
              req.session.sessionFlash = {
                type: 'warning',
                message: "There has been a problem updating your password. Please try again in a few minutes."
              }
              res.redirect(301, '/reset-password/' + req.body.token);
              console.error(error.toString());
            })
          }
        });
      }
    });
  });

  //Responds to get requests for the profile of someone with a certain email. Deprecated? Is this used?
  //Input: the email
  //Output: redirect to /the username of the person with that email, unless isLoggedInOrRedirect redirects you
  app.get('/getprofile/:email', isLoggedInOrRedirect, function(req, res) {
      User.findOne({
        email: req.params.email
      }).then((user) => {
        res.redirect('/'+user.username);
      })
  });

  //Responds to get requests for /logout.
  //Input: none
  //Output: user is logged out and redirected to the referring page or / if no referrer.
  app.get('/logout', function(req, res) {
      req.logout();
      res.redirect('back');
  });

  //Responds to get requests for the home page.
  //Input: none
  //Output: the home page, if isLoggedInOrRedirect doesn't redirect you.
  app.get('/home', isLoggedInOrRedirect, function(req, res) {
    res.render('home', {
      loggedIn: true,
      loggedInUserData: loggedInUserData,
      activePage: 'home'
    });
  });

  //Responds to get requests for the 404 page.
  //Input: user data from req.user
  //Output: the 404 page, which at the moment doesn't actually use the user data this function passes it
  app.get('/404', function(req, res) {
    if (req.isAuthenticated()){
      let loggedInUserData = req.user;
      res.render('404', {loggedIn: true, loggedInUserData: loggedInUserData});
    }
    else {
      res.render('404', {loggedIn: false});
    }
  });

  //Responds to get requests for tag pages.
  //Input: the name of the tag from the url
  //Output: the tag page rendered if it exists, redirect to the 404 page otherwise, unless isLoggedInOrRedirect redirects you
  app.get('/tag/:name', isLoggedInOrRedirect, function(req, res) {
    Tag.findOne({
      name: req.params.name
    })
    .then((tag) => {
      if (tag){
        res.render('tag', {
          name: req.params.name,
          loggedIn: true,
          loggedInUserData: loggedInUserData
        })
      }
      else {
        res.redirect('/404');
      }
    })
  })

  //Responds to get requests for /notifications. I think this is only used on mobile?
  //Input: none
  //Output: renders notifications page, which renders as "you're not logged in" if you're not logged in
  app.get('/notifications', function(req, res){
    if (req.isAuthenticated()){
      let loggedInUserData = req.user;
      User.findOne({
        _id: loggedInUserData._id
      }, 'notifications')
      .then(user => {
        user.notifications.reverse();
        res.render('notifications', {
          loggedIn: true,
          loggedInUserData: loggedInUserData,
          notifications: user.notifications,
          activePage: 'notifications'
        });
      })
    }
    else {
      res.render('notifications', {
        loggedIn: false,
        activePage: 'notifications'
      });
    }
  })

  //Responds to get request for /settings
  //Input: none
  //Output: the settings page is rendered, unless isLoggedInOrRedirect redirects you first.
  app.get('/settings', isLoggedInOrRedirect, function(req, res) {
    res.render('settings', {
      loggedIn: true,
      loggedInUserData: loggedInUserData,
      activePage: 'settings'
    })
  })

  //Responds to post request that's updating settings
  //Input: the settings; pretty much just profileVisiblity right now
  //Output: settings are saved for the user in the database, we're redirected back to the user's page.
  //database error will do... something? again, all unless isLoggedInOrRedirect redirects you first.
  app.post('/updatesettings', isLoggedInOrRedirect, function(req, res) {
    let updatedSettings = req.body;
    User.update({
      _id: loggedInUserData._id
    },
    {
      $set: {
        'settings.profileVisibility': updatedSettings.profileVisibility
      }
    })
    .then(user => {
      res.redirect('/' + loggedInUserData.username)
    })
    .catch(error => {
      console.log("Error updating settings!")
      console.log(error)
    })
  })

  //Responds to get requests for /search.
  //Input: none
  //Output: renders search page unless isLoggedInOrRedirect redirects you
  app.get('/search', isLoggedInOrRedirect, function(req, res) {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: loggedInUserData,
      activePage: 'search'
    })
  })

  //Responds to get requests for /search that include a query.
  //Input: the query
  //Output: the rendered search page, unless isLoggedInOrRedirect redirects you
  app.get('/search/:query', isLoggedInOrRedirect, function(req, res) {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: loggedInUserData,
      activePage: 'search',
      query: sanitize(sanitizeHtml(req.params.query, sanitizeHtmlOptions))
    })
  })

  //Responds to post requests (?) for the users that follow the logged in user
  //Input: none
  //Output: JSON data describing the users that follow the logged in user or a redirect from isLoggedInOrRedirect.
  //Should be isLoggedInOrErrorResponse?
  app.post('/api/user/followers', isLoggedInOrRedirect, function(req, res) {
    followedUserData = []
    Relationship.find({
      fromUser: loggedInUserData._id,
      value: "follow"
    })
    .populate("toUser")
    .then((followedUsers) => {
      followedUsers.forEach(relationship => {
        var follower = {
          key: (relationship.toUser.displayName ? relationship.toUser.displayName + ' (' + '@' + relationship.toUser.username + ')' : '@' + relationship.toUser.username),
          value: relationship.toUser.username,
          image: (relationship.toUser.imageEnabled ? relationship.toUser.image : 'cake.svg')
        }
        followedUserData.push(follower)
      })
      console.log(followedUserData)
      res.setHeader('content-type', 'text/plain');
      res.end(JSON.stringify({followers: followedUserData}));
    })
    .catch((err) => {
      console.log("Error in profileData.")
      console.log(err);
    });
  })

  app.get('/showsearch/:query/:page', isLoggedInOrRedirect, function(req, res) {

    let postsPerPage = 10;
    let page = req.params.page-1;

    let query = req.params.query.trim();
    if (!query.length){
      res.status(404)
      .send('Not found');
    }
    else {
      Tag.find({
        name: { '$regex': query, '$options': 'i' }
      })
      .then(tagResults => {
        User.find({
          "$or": [
            { username: { '$regex': query, '$options': 'i' } },
            { displayName: { '$regex': query, '$options': 'i' } },
            { aboutParsed: { '$regex': query, '$options': 'i' } }
          ]
        })
        // User.find(
        //     { $text : { $search : query } },
        //     { score : { $meta: "textScore" } }
        // )
        // .sort({ score : { $meta : 'textScore' } })
        // .sort('username')
        // .skip(postsPerPage * page)
        // .limit(postsPerPage)
        .then((userResults) => {
          Community.find({
            "$or": [
              { name: { '$regex': query, '$options': 'i' } },
              { descriptionParsed: { '$regex': query, '$options': 'i' } }
            ]
          })
          // .sort('name')
          // .skip(postsPerPage * page)
          // .limit(postsPerPage)
          .then(communityResults => {
            var combinedResults = userResults.concat(communityResults, tagResults);
            var paginatedResults = combinedResults.slice(postsPerPage * page, (postsPerPage * page)+postsPerPage);
            if (!paginatedResults.length){
              if (page == 0){
                res.render('partials/searchresults', {
                  layout: false,
                  loggedIn: true,
                  loggedInUserData: loggedInUserData,
                  noResults: true
                });
              }
              else {
                res.status(404)
                .send('Not found');
              }
            }
            else {
              var parsedResults = [];
              paginatedResults.forEach(result => {
                constructedResult = {};
                if (result.username){
                  // It's a user
                  constructedResult.type = '<i class="fas fa-user"></i> User'
                  constructedResult.sort = result.lastUpdated
                  constructedResult.email = result.email
                  if (result.displayName){
                    constructedResult.title = '<strong><a class="authorLink" href="/' + result.username + '">' + result.displayName + '</a></strong> &middot; <span class="text-muted">@' + result.username + '</span>';
                  }
                  else {
                    constructedResult.title = '<strong><a class="authorLink" href="/' + result.username + '">@' + result.username + '</a></strong>';
                  }
                  constructedResult.url = '/' + result.username
                  if (result.imageEnabled)
                    constructedResult.image = '/images/' + result.image
                  else
                    constructedResult.image = '/images/cake.svg'
                  constructedResult.description = result.aboutParsed
                }
                else if (result.members){
                  // It's a community
                  constructedResult.type = '<i class="fas fa-leaf"></i> Community'
                  constructedResult.sort = result.lastUpdated
                  constructedResult.title = '<strong><a class="authorLink" href="/community/' + result.slug + '">' + result.name + '</a></strong> &middot; <span class="text-muted">' + result.membersCount + ' member' + (result.membersCount == 1 ? '' : 's') + '</span>';
                  constructedResult.url = '/community/' + result.slug
                  if (result.imageEnabled)
                    constructedResult.image = '/images/communities/' + result.image
                  else
                    constructedResult.image = '/images/communities/cake.svg'
                  constructedResult.description = result.descriptionParsed
                }
                else {
                  // It's a tag
                  constructedResult.type = '<i class="fas fa-hashtag"></i> Tag'
                  constructedResult.sort = result.lastUpdated
                  constructedResult.title = '<strong><a class="authorLink" href="/tag/' + result.name + '">#' + result.name + '</a></strong>';
                  constructedResult.url = '/tag/' + result.name
                  constructedResult.description = '<p>' + result.posts.length + ' post' + (result.posts.length == 1 ? '' : 's') + '</p>'
                  constructedResult.image = '/images/biscuit.svg'
                }
                parsedResults.push(constructedResult)
              })
              parsedResults.sort(function(a, b){
               var timestampA=a.sort, timestampB=b.sort;
               if (timestampA > timestampB) //sort timestamp descending
                return -1;
               if (timestampA < timestampB)
                return 1;
               return 0; //default return value (no sorting)
              });
              res.render('partials/searchresults', {
                layout: false,
                loggedIn: true,
                loggedInUserData: loggedInUserData,
                results: parsedResults
              });
            }
          })
        })
      })
    }
  })

  app.get('/showposts/:context/:identifier/:page', function(req, res){
    var loggedInUserData = {}
    if (req.isAuthenticated()){
      isLoggedInOrRedirect = true;
      loggedInUserData = req.user;
    }
    else {
      isLoggedInOrRedirect = false;
    }

    let postsPerPage = 10;
    let page = req.params.page-1;

    let myFollowedUserEmails = () => {
        myFollowedUserEmails = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "follow"
          })
          .then((follows) => {
            for (var key in follows) {
              var follow = follows[key];
              myFollowedUserEmails.push(follow.to);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let myFlaggedUserEmails = () => {
        myFlaggedUserEmails = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "flag"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let usersFlaggedByMyTrustedUsers = () => {
        myTrustedUserEmails = []
        usersFlaggedByMyTrustedUsers = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              myTrustedUserEmails.push(trust.to);
            }
            return Relationship.find({
              value: "flag",
              from: { $in: myTrustedUserEmails }
            })
            .then((users) => {
              usersFlaggedByMyTrustedUsers = users.map(a => a.to);
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let usersWhoTrustMe = () => {
        usersWhoTrustMeEmails = []
        return Relationship.find({
            to: loggedInUserData.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              usersWhoTrustMeEmails.push(trust.from);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let myCommunitites = () => {
      myCommunities = [];
      myMutedUsers = [];
      return Community.find({
          members: loggedInUserData._id
        })
        .then((communities) => {
          for (var key in communities) {
            var community = communities[key];
            myCommunities.push(community._id);
            myMutedUsers.push.apply(myMutedUsers, community.mutedMembers.map(String));
          }
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let isMuted = () => {
      isMuted = false;
      if (req.params.context == "community" && isLoggedInOrRedirect) {
        return Community.findOne({
          _id: req.params.identifier
        })
        .then(community => {
          mutedMemberIds = community.mutedMembers.map(a => a.toString());
          if (mutedMemberIds.includes(loggedInUserData._id.toString()))
            isMuted = true;
          console.log(isMuted)
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
      }
    }

    myFollowedUserEmails().then(usersWhoTrustMe).then(myFlaggedUserEmails).then(usersFlaggedByMyTrustedUsers).then(myCommunitites).then(isMuted).then(() => {

      const today = moment().clone().startOf('day');
      const thisyear = moment().clone().startOf('year');

      if (req.isAuthenticated()){
        myFollowedUserEmails.push(loggedInUserData.email)
        usersWhoTrustMeEmails.push(loggedInUserData.email)
        var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
        if (req.params.context == "home") {
          var postDisplayContext = {
            "$or": [
              { authorEmail: { $in: myFollowedUserEmails } },
              {
                type: 'community',
                community: { $in: myCommunities }
              }
            ]
          }
        }
        else if (req.params.context == "user"){
          var postDisplayContext = {
            author: req.params.identifier
          }
        }
        else if (req.params.context == "single"){
          var postDisplayContext = {
            _id: req.params.identifier
          }
        }
        else if (req.params.context == "community"){
          var postDisplayContext = {
            type: 'community',
            community: req.params.identifier
          }
        }
      }
      else {
        if (req.params.context == "single"){
          var postDisplayContext = {
            _id: req.params.identifier,
            privacy: 'public'
          }
        }
        else if (req.params.context == "community"){
          var postDisplayContext = {
            type: 'community',
            community: req.params.identifier
          }
        }
        else {
          var postDisplayContext = {
            author: req.params.identifier,
            privacy: 'public'
          }
        }
      }
      Post.find(
        postDisplayContext
      )
      .sort('-lastUpdated')
      .skip(postsPerPage * page)
      .limit(postsPerPage)
      .populate('author', '-password')
      .populate('community')
      .populate('comments.author', '-password')
      .populate({path: 'boosts', populate: {path : 'author'}})
      .populate({path: 'boostTarget', populate: {path : 'author comments.author'}})
      .then((posts) => {
        if (!posts.length){
          res.status(404)
          .send('Not found');
        }
        else {
          displayedPosts = [];
          if (req.isAuthenticated()){
            posts.forEach(function(post, i) {
              let canDisplay = false;
              if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
                canDisplay = true;
              }
              if (post.type == "community"){
                // Hide muted community members
                let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                if (mutedMemberIds.includes(post.author._id.toString())){
                  canDisplay = false;
                }
              }
              if (post.type == "boost") {
                displayContext = post.boostTarget;
              }
              else {
                displayContext = post;
              }
              if (moment(displayContext.timestamp).isSame(today, 'd')) {
                parsedTimestamp = moment(displayContext.timestamp).fromNow();
              }
              else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
                parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
              }
              else {
                parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
              }
              if (displayContext.comments != "") {
                if (moment(displayContext.comments.slice(-1)[0].timestamp).isAfter(moment(new Date()).subtract(6, 'hours'))){
                  recentlyCommented = true;
                  lastCommentAuthor = displayContext.comments.slice(-1)[0].author
                }
                else {
                  recentlyCommented = false;
                  lastCommentAuthor = "";
                }
              }
              else {
                recentlyCommented = false;
                lastCommentAuthor = "";
              }

              imageUrlsArray = []
              if (displayContext.imageVersion === 2){
                displayContext.images.forEach(image => {
                  imageUrlsArray.push('/api/image/display/' + image)
                })
              }
              else {
                displayContext.images.forEach(image => {
                  imageUrlsArray.push('/images/uploads/' + image)
                })
              }

              displayedPost = {
                canDisplay: canDisplay,
                _id: displayContext._id,
                deleteid: post._id,
                type: post.type,
                owner: post.author.username,
                author: {
                  email: displayContext.author.email,
                  _id: displayContext.author._id,
                  username: displayContext.author.username,
                  displayName: displayContext.author.displayName,
                  imageEnabled: displayContext.author.imageEnabled,
                  image: displayContext.author.image,
                },
                url: displayContext.url,
                privacy: displayContext.privacy,
                parsedTimestamp: parsedTimestamp,
                lastUpdated: post.lastUpdated, // For sorting, get the timestamp of the actual post, not the boosted original
                rawContent: displayContext.rawContent,
                parsedContent: displayContext.parsedContent,
                commentsDisabled: displayContext.commentsDisabled,
                comments: displayContext.comments,
                numberOfComments: displayContext.numberOfComments,
                contentWarnings: displayContext.contentWarnings,
                images: imageUrlsArray,
                imageTags: displayContext.imageTags,
                imageDescriptions: displayContext.imageDescriptions,
                community: displayContext.community,
                boosts: displayContext.boosts,
                boostTarget: post.boostTarget,
                recentlyCommented: recentlyCommented,
                lastCommentAuthor: lastCommentAuthor,
                subscribedUsers: displayContext.subscribedUsers,
                unsubscribedUsers: displayContext.unsubscribedUsers
              }
              displayedPost.comments.forEach(function(comment) {
                comment.parsedTimestamp = moment(comment.timestamp).fromNow();
                // If the comment's author is logged in, or the post's author is logged in
                if ((comment.author._id.toString() == loggedInUserData._id) || (displayContext.author._id.toString() == loggedInUserData._id)){
                  comment.canDelete = true;
                }
              });
              displayedPosts.push(displayedPost);
            });

            // console.log(displayedPosts.map(a => a._id.toString()));
            //
            // Remove boosts with same ids as original post from displayedPosts array
            // if (req.params.context == "home"){
            //   displayedPosts = displayedPosts.filter((post, index, self) =>
            //     index === self.findIndex((t) => (
            //       t._id.equals(post._id)
            //     ))
            //   )
            // }

          }
          else {
            posts.forEach(function(post, i) {
              let canDisplay = false;
              if (post.author.settings.profileVisibility == "profileAndPosts") {
                // User has allowed non-logged-in users to see their posts
                if (post.community) {
                  if (post.community.settings.visibility == "public") {
                    // Public community, can display post
                    let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                    if (mutedMemberIds.includes(post.author._id.toString())){
                      canDisplay = false;
                    }
                    else {
                      canDisplay = true;
                    }
                  }
                }
                else {
                  // Not a community post, can display
                  canDisplay = true;
                }
              }
              if (post.type == "boost") {
                displayContext = post.boostTarget;
              }
              else {
                displayContext = post;
              }
              if (moment(displayContext.timestamp).isSame(today, 'd')) {
                parsedTimestamp = moment(displayContext.timestamp).fromNow();
              }
              else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
                parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
              }
              else {
                parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
              }
              if (displayContext.comments != "") {
                if (moment(displayContext.comments.slice(-1)[0].timestamp).isAfter(moment(new Date()).subtract(6, 'hours'))){
                  recentlyCommented = true;
                  lastCommentAuthor = displayContext.comments.slice(-1)[0].author
                }
                else {
                  recentlyCommented = false;
                  lastCommentAuthor = "";
                }
              }
              else {
                recentlyCommented = false;
                lastCommentAuthor = "";
              }
              displayedPost = {
                canDisplay: canDisplay,
                _id: displayContext._id,
                deleteid: post._id,
                type: post.type,
                owner: post.author.username,
                author: {
                  email: displayContext.author.email,
                  _id: displayContext.author._id,
                  username: displayContext.author.username,
                  displayName: displayContext.author.displayName,
                  imageEnabled: displayContext.author.imageEnabled,
                  image: displayContext.author.image,
                },
                url: displayContext.url,
                privacy: displayContext.privacy,
                parsedTimestamp: parsedTimestamp,
                lastUpdated: post.lastUpdated, // For sorting, get the timestamp of the actual post, not the boosted original
                rawContent: displayContext.rawContent,
                parsedContent: displayContext.parsedContent,
                commentsDisabled: displayContext.commentsDisabled,
                comments: displayContext.comments,
                numberOfComments: displayContext.numberOfComments,
                contentWarnings: displayContext.contentWarnings,
                images: displayContext.images,
                imageTags: displayContext.imageTags,
                imageDescriptions: displayContext.imageDescriptions,
                community: displayContext.community,
                boosts: displayContext.boosts,
                boostTarget: post.boostTarget,
                recentlyCommented: recentlyCommented,
                lastCommentAuthor: lastCommentAuthor,
                subscribedUsers: displayContext.subscribedUsers,
                unsubscribedUsers: displayContext.unsubscribedUsers
              }
              displayedPost.comments.forEach(function(comment) {
                comment.parsedTimestamp = moment(comment.timestamp).fromNow();
              });
              displayedPosts.push(displayedPost);
            })
          }
          metadata = {};
          if (req.params.context == "single"){
            metadata = {
              title: "sweet",
              description: displayedPosts[0].rawContent.split('.')[0],
              image: "https://sweet.sh/images/uploads/" + displayedPosts[0].image
            }
          }
          res.render('partials/posts', {
            layout: false,
            loggedIn: isLoggedInOrRedirect,
            isMuted: isMuted,
            loggedInUserData: loggedInUserData,
            posts: displayedPosts,
            flaggedUsers: flagged,
            context: req.params.context,
            metadata: metadata
          });
        }
      })
    })
  })

  app.get('/showtag/:name/:page', isLoggedInOrRedirect, function(req, res){
    let postsPerPage = 10;
    let page = req.params.page-1;

    let myFlaggedUserEmails = () => {
      myFlaggedUserEmails = []
      return Relationship.find({
          from: loggedInUserData.email,
          value: "flag"
        })
        .then((flags) => {
          for (var key in flags) {
            var flag = flags[key];
            myFlaggedUserEmails.push(flag.to);
          }
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let usersFlaggedByMyTrustedUsers = () => {
      myTrustedUserEmails = []
      usersFlaggedByMyTrustedUsers = []
      return Relationship.find({
          from: loggedInUserData.email,
          value: "trust"
        })
        .then((trusts) => {
          for (var key in trusts) {
            var trust = trusts[key];
            myTrustedUserEmails.push(trust.to);
          }
          return Relationship.find({
            value: "flag",
            from: { $in: myTrustedUserEmails }
          })
          .then((users) => {
            usersFlaggedByMyTrustedUsers = users.map(a => a.to);
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let usersWhoTrustMe = () => {
      usersWhoTrustMeEmails = []
      return Relationship.find({
          to: loggedInUserData.email,
          value: "trust"
        })
        .then((trusts) => {
          for (var key in trusts) {
            var trust = trusts[key];
            usersWhoTrustMeEmails.push(trust.from);
          }
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    usersWhoTrustMe().then(myFlaggedUserEmails).then(usersFlaggedByMyTrustedUsers).then((data) => {

      const today = moment().clone().startOf('day');
      const thisyear = moment().clone().startOf('year');

      // myFollowedUserEmails.push(loggedInUserData.email)
      usersWhoTrustMeEmails.push(loggedInUserData.email)
      var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
      Tag.findOne({
        name: req.params.name
      })
      .then((tag) => {
        Post.find({
          _id: { $in: tag.posts }
        })
        .sort('-lastUpdated')
        .skip(postsPerPage * page)
        .limit(postsPerPage)
        .populate('author', '-password')
        .populate('comments.author', '-password')
        .populate({path: 'boostTarget', populate: {path : 'author comments.author'}})
        .then((posts) => {
          if (!posts.length){
            res.status(404)
            .send('Not found');
          }
          else {
            displayedPosts = [];
            posts.forEach(function(post, i){
              if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public"){
                let canDisplay = true;
                if (post.type == "boost") {
                  displayContext = post.boostTarget;
                }
                else {
                  displayContext = post;
                }
                if (moment(displayContext.timestamp).isSame(today, 'd')) {
                  parsedTimestamp = moment(displayContext.timestamp).fromNow();
                }
                else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
                  parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
                }
                else {
                  parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
                }

                imageUrlsArray = []
                if (displayContext.imageVersion === 2){
                  displayContext.images.forEach(image => {
                    imageUrlsArray.push('/api/image/display/' + image)
                  })
                }
                else {
                  displayContext.images.forEach(image => {
                    imageUrlsArray.push('/images/uploads/' + image)
                  })
                }

                displayedPost = {
                  canDisplay: canDisplay,
                  _id: displayContext._id,
                  deleteid: post._id,
                  type: post.type,
                  owner: post.author.username,
                  author: {
                    email: displayContext.author.email,
                    _id: displayContext.author._id,
                    username: displayContext.author.username,
                    displayName: displayContext.author.displayName,
                    imageEnabled: displayContext.author.imageEnabled,
                    image: displayContext.author.image,
                  },
                  url: displayContext.url,
                  privacy: displayContext.privacy,
                  parsedTimestamp: parsedTimestamp,
                  lastUpdated: post.lastUpdated, // For sorting, get the timestamp of the actual post, not the boosted original
                  rawContent: displayContext.rawContent,
                  parsedContent: displayContext.parsedContent,
                  commentsDisabled: displayContext.commentsDisabled,
                  comments: displayContext.comments,
                  numberOfComments: displayContext.numberOfComments,
                  contentWarnings: displayContext.contentWarnings,
                  images: imageUrlsArray,
                  imageTags: displayContext.imageTags,
                  imageDescriptions: displayContext.imageDescriptions,
                  community: displayContext.community,
                  boosts: displayContext.boosts,
                  boostTarget: post.boostTarget,
                  recentlyCommented: recentlyCommented,
                  lastCommentAuthor: lastCommentAuthor,
                  subscribedUsers: displayContext.subscribedUsers,
                  unsubscribedUsers: displayContext.unsubscribedUsers
                }
                displayedPost.comments.forEach(function(comment) {
                  comment.parsedTimestamp = moment(comment.timestamp).fromNow();
                });
                displayedPosts.push(displayedPost);
              }
            })
            res.render('partials/posts', {
              layout: false,
              loggedIn: true,
              loggedInUserData: loggedInUserData,
              posts: displayedPosts,
              flaggedUsers: flagged,
              context: req.params.context
            });
          }
        })
      })
    })
  })

  app.get('/:username', function(req, res) {
    var loggedInUserData = {}
    if (req.isAuthenticated()){
      isLoggedInOrRedirect = true;
      loggedInUserData = req.user;
    }
    else {
      isLoggedInOrRedirect = false;
    }

    let results = {};

    let profileData = () => {
      return User.findOne({
          username: req.params.username
        })
        .then((user) => {
          if (!user){
            console.log("no such user!");
            res.status(404).redirect('/404');
          }
          else {
            results.profileData = user
            return user;
          }
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let communitiesData = (user) => {
      return Community.find({
        members: results.profileData._id
      })
      .then((communities) => {
        results.communitiesData = communities
      })
      .catch((err) => {
        console.log("Error in profileData.")
        console.log(err);
      });
      // }
      // return User.findOne({
      //     username: req.params.username
      //   })
      //   .populate('communities')
      //   .then((user) => {
      //     results.communitiesData = user.communities
      //   })
      //   .catch((err) => {
      //     console.log("Error in profileData.")
      //     console.log(err);
      //   });
    }

    let flagsOnUser = (user) => {
      if (req.isAuthenticated()){
        return Relationship.find({
            to: user.email,
            value: "flag"
          })
          .then((flags) => {
            results.flagsOnUser = flags
            return flags;
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
        }
    }

    let myTrustedUsers = () => {
      if (req.isAuthenticated()){
        myTrustedUserEmails = []
        myTrustedUserData = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              myTrustedUserEmails.push(trust.to);
            }
            return User.find({
              email: { $in: myTrustedUserEmails }
            })
            .then((users) => {
              results.myTrustedUserData = users
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
      }
    }

    let theirTrustedUsers = () => {
      theirTrustedUserEmails = []
      theirTrustedUserData = []
      return Relationship.find({
          from: results.profileData.email,
          value: "trust"
        })
        .then((trusts) => {
          for (var key in trusts) {
            var trust = trusts[key];
            theirTrustedUserEmails.push(trust.to);
          }
          return User.find({
            email: { $in: theirTrustedUserEmails }
          })
          .then((users) => {
            results.theirTrustedUserData = users
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let myFlaggedUsers = () => {
      if (req.isAuthenticated()){
        myFlaggedUserEmails = []
        myFlaggedUserData = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "flag"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
            return User.find({
              email: { $in: myFlaggedUserEmails }
            })
            .then((users) => {
              results.myFlaggedUserData = users
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
        }
    }

    let myBlockedUsers = () => {
      if (req.isAuthenticated()){
        myBlockedUserEmails = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "block"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
            return User.find({
              email: { $in: myFlaggedUserEmails }
            })
            .then((users) => {
              results.myFlaggedUserData = users
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
        }
    }

    let myFollowedUsers = () => {
      if (req.isAuthenticated()){
        myFollowedUserEmails = []
        myFollowedUserData = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "follow"
          })
          .then((follows) => {
            for (var key in follows) {
              var follow = follows[key];
              myFollowedUserEmails.push(follow.to);
            }
            return User.find({
              email: { $in: myFollowedUserEmails }
            })
            .then((users) => {
              results.myFollowedUserData = users
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
        }
    }

    let followers = () => {
      followersArray = [];
      return Relationship.find({
          to: results.profileData.email,
          value: "follow"
        }, {'from':1})
        .then((followers) => {
          let followersArray = followers.map(({ from }) => from)
          return User.find({
            email: { $in: followersArray }
          })
          .then((users) => {
            results.followers = users
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let theirFollowedUsers = () => {
      theirFollowedUserEmails = []
      theirFollowedUserData = []
      return Relationship.find({
          from: results.profileData.email,
          value: "follow"
        })
        .then((follows) => {
          for (var key in follows) {
            var follow = follows[key];
            theirFollowedUserEmails.push(follow.to);
          }
          return User.find({
            email: { $in: theirFollowedUserEmails }
          })
          .then((users) => {
            results.theirFollowedUserData = users
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let usersWhoTrustThem = () => {
      usersWhoTrustThemArray = [];
      return Relationship.find({
          to: results.profileData.email,
          value: "trust"
        }, {'from':1})
        .then((usersWhoTrustThem) => {
          let usersWhoTrustThemArray = usersWhoTrustThem.map(({ from }) => from)
          return User.find({
            email: { $in: usersWhoTrustThemArray }
          })
          .then((users) => {
            results.usersWhoTrustThem = users
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    profileData().then(flagsOnUser).then(myTrustedUsers).then(theirTrustedUsers).then(myFlaggedUsers).then(myFollowedUsers).then(theirFollowedUsers).then(followers).then(usersWhoTrustThem).then(communitiesData).then((data) => {
      var userTrustsYou = false;
      var userFollowsYou = false;
      if (req.isAuthenticated()){
        // Is this the logged in user's own profile?
        if (results.profileData.email == loggedInUserData.email) {
          isOwnProfile = true;
          trustedUserData = results.myTrustedUserData
          followedUserData = results.myFollowedUserData
        }
        else {
          isOwnProfile = false;
          trustedUserData = results.theirTrustedUserData
          followedUserData = results.theirFollowedUserData
          // Check if profile user trusts logged in user
          if (theirTrustedUserEmails.includes(loggedInUserData.email)){
            userTrustsYou = true;
          }
          // Check if profile user follows logged in user
          if (theirFollowedUserEmails.includes(loggedInUserData.email)){
            userFollowsYou = true;
          }
        }
        flagsFromTrustedUsers = [];
        var trusted = false;
        myTrustedUserEmails.forEach(function(email) {
          // Check if logged in user trusts profile user
          if (email == results.profileData.email){
            trusted = true;
          }
        })
        var followed = false;
        myFollowedUserEmails.forEach(function(email) {
          // Check if logged in user follows profile user
          if (email == results.profileData.email){
            followed = true;
          }
        })
        for (var key in results.flagsOnUser) {
          var flag = results.flagsOnUser[key];
          // Check if logged in user has flagged profile user
          if (flag.from == loggedInUserData.email){
            var flagged = true;
          }
          // Check if any of the logged in user's trusted users have flagged profile user
          if (myTrustedUserEmails.includes(flag.from)){
            flagsFromTrustedUsers.push(flag.from)
          }
        }
        numberOfFlagsFromTrustedUsers = flagsFromTrustedUsers.length;
      }
      else {
        isOwnProfile = false;
        trustedUserData = results.theirTrustedUserData
        followedUserData = results.theirFollowedUserData
        flagsFromTrustedUsers = [];
        var trusted = false;
        var followed = false;
        var flagged = false;
        numberOfFlagsFromTrustedUsers = 0;
      }

      res.render('user', {
        loggedIn: isLoggedInOrRedirect,
        isOwnProfile: isOwnProfile,
        loggedInUserData: loggedInUserData,
        profileData: results.profileData,
        trusted: trusted,
        flagged: flagged,
        followed: followed,
        followersData: results.followers,
        usersWhoTrustThemData: results.usersWhoTrustThem,
        userFollowsYou: userFollowsYou,
        userTrustsYou: userTrustsYou,
        trustedUserData: trustedUserData,
        followedUserData: followedUserData,
        communitiesData: results.communitiesData,
        flaggedUserData: results.myFlaggedUserData,
        numberOfFlagsFromTrustedUsers: numberOfFlagsFromTrustedUsers,
        activePage: results.profileData.username,
        visibleSidebarArray: ['profileOnly', 'profileAndPosts']
      });
    }).catch((err) => {
      console.log("Error in chain.")
      console.log(err)
    })
  });

  app.get('/:username/:posturl', function(req,res){

    var loggedInUserData = {}
    if (req.isAuthenticated()){
      isLoggedInOrRedirect = true;
      loggedInUserData = req.user;
    }
    else {
      isLoggedInOrRedirect = false;
    }

    let myFollowedUserEmails = () => {
        myFollowedUserEmails = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "follow"
          })
          .then((follows) => {
            for (var key in follows) {
              var follow = follows[key];
              myFollowedUserEmails.push(follow.to);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let myFlaggedUserEmails = () => {
        myFlaggedUserEmails = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "flag"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let usersFlaggedByMyTrustedUsers = () => {
        myTrustedUserEmails = []
        usersFlaggedByMyTrustedUsers = []
        return Relationship.find({
            from: loggedInUserData.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              myTrustedUserEmails.push(trust.to);
            }
            return Relationship.find({
              value: "flag",
              from: { $in: myTrustedUserEmails }
            })
            .then((users) => {
              usersFlaggedByMyTrustedUsers = users.map(a => a.to);
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let usersWhoTrustMe = () => {
        usersWhoTrustMeEmails = []
        return Relationship.find({
            to: loggedInUserData.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              usersWhoTrustMeEmails.push(trust.from);
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
    }

    let myCommunitites = () => {
      myCommunities = [];
      myMutedUsers = [];
      return Community.find({
          members: loggedInUserData._id
        })
        .then((communities) => {
          for (var key in communities) {
            var community = communities[key];
            myCommunities.push(community._id);
            myMutedUsers.push.apply(myMutedUsers, community.mutedMembers.map(String));
          }
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
    }

    let isMuted = () => {
      isMuted = false;
      isMember = false;
      if (isLoggedInOrRedirect) {
        return Post.findOne({url: req.params.posturl})
        .then(post => {
          if (post){
            if (post.type == "community"){
              return Community.findOne({
                _id: post.community
              })
              .then(community => {
                mutedMemberIds = community.mutedMembers.map(a => a.toString());
                if (mutedMemberIds.includes(loggedInUserData._id.toString()))
                  isMuted = true;
                communityMemberIds = community.members.map(a => a.toString());
                if (communityMemberIds.includes(loggedInUserData._id.toString()))
                  isMember = true;
              })
              .catch((err) => {
                console.log("Error in profileData.")
                console.log(err);
              });
            }
          }
        })
      }
    }


    myFollowedUserEmails().then(usersWhoTrustMe).then(myFlaggedUserEmails).then(usersFlaggedByMyTrustedUsers).then(myCommunitites).then(isMuted).then(() => {

      const today = moment().clone().startOf('day');
      const thisyear = moment().clone().startOf('year');
      if (req.isAuthenticated()){
        myFollowedUserEmails.push(loggedInUserData.email)
        usersWhoTrustMeEmails.push(loggedInUserData.email)
        var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
      }
      Post.findOne({url: req.params.posturl})
      .populate('author', '-password')
      .populate('community')
      .populate('comments.author', '-password')
      .populate({path: 'boostTarget', populate: {path : 'author comments.author'}})
      .then((post) => {
        if (!post){
          res.render('singlepost', {
            canDisplay: false,
            loggedIn: isLoggedInOrRedirect,
            loggedInUserData: loggedInUserData
          })
        }
        else {
          displayedPost = [];
          metadata = {};
          let canDisplay = false;
          if (req.isAuthenticated()){
            if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
              if (post.community){
                isInCommunity = (loggedInUserData.communities.indexOf(post.community._id.toString()) > -1);
                if (isInCommunity){
                  let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                  if (mutedMemberIds.includes(post.author._id.toString())){
                    canDisplay = false;
                  }
                  else {
                    canDisplay = true;
                  }
                }
                else if (post.community.settings.visibility == "public"){
                  canDisplay = true;
                }
              }
              else {
                canDisplay = true;
              }
            }
          }
          else {
            if (post.privacy == "public" && post.author.settings.profileVisibility == "profileAndPosts") {
              // User has allowed non-logged-in users to see their posts
              if (post.community) {
                if (post.community.settings.visibility == "public") {
                  // Public community, can display post
                  let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                  if (mutedMemberIds.includes(post.author._id.toString())){
                    canDisplay = false;
                  }
                  else {
                    canDisplay = true;
                  }
                }
              }
              else {
                // Not a community post, can display
                canDisplay = true;
              }
            }
          }
          if (post.type == "boost") {
            console.log("It's a boosted post!")
            displayContext = post.boostTarget;
          }
          else {
            displayContext = post;
          }
          if (moment(displayContext.timestamp).isSame(today, 'd')) {
            parsedTimestamp = moment(displayContext.timestamp).fromNow();
          }
          else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
            parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
          }
          else {
            parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
          }
          if (displayContext.comments != "") {
            if (moment(displayContext.comments.slice(-1)[0].timestamp).isAfter(moment(new Date()).subtract(6, 'hours'))){
              recentlyCommented = true;
              lastCommentAuthor = displayContext.comments.slice(-1)[0].author
            }
            else {
              recentlyCommented = false;
              lastCommentAuthor = "";
            }
          }
          else {
            recentlyCommented = false;
            lastCommentAuthor = "";
          }

          imageUrlsArray = []
          if (displayContext.imageVersion === 2){
            displayContext.images.forEach(image => {
              imageUrlsArray.push('/api/image/display/' + image)
            })
          }
          else {
            displayContext.images.forEach(image => {
              imageUrlsArray.push('/images/uploads/' + image)
            })
          }

          displayedPost = {
            canDisplay: canDisplay,
            _id: displayContext._id,
            deleteid: post._id,
            type: post.type,
            owner: post.author.username,
            author: {
              email: displayContext.author.email,
              _id: displayContext.author._id,
              username: displayContext.author.username,
              displayName: displayContext.author.displayName,
              imageEnabled: displayContext.author.imageEnabled,
              image: displayContext.author.image,
            },
            url: displayContext.url,
            privacy: displayContext.privacy,
            parsedTimestamp: parsedTimestamp,
            lastUpdated: post.lastUpdated, // For sorting, get the timestamp of the actual post, not the boosted original
            rawContent: displayContext.rawContent,
            parsedContent: displayContext.parsedContent,
            commentsDisabled: displayContext.commentsDisabled,
            comments: displayContext.comments,
            numberOfComments: displayContext.numberOfComments,
            contentWarnings: displayContext.contentWarnings,
            images: imageUrlsArray,
            imageTags: displayContext.imageTags,
            imageDescriptions: displayContext.imageDescriptions,
            community: displayContext.community,
            recentlyCommented: recentlyCommented,
            lastCommentAuthor: lastCommentAuthor,
            subscribedUsers: displayContext.subscribedUsers,
            unsubscribedUsers: displayContext.unsubscribedUsers
          }
          displayedPost.comments.forEach(function(comment) {
            comment.parsedTimestamp = moment(comment.timestamp).fromNow();
            // If the comment's author is logged in, or the post's author is logged in
            if ((comment.author._id.toString() == loggedInUserData._id) || (displayContext.author._id.toString() == loggedInUserData._id)){
              comment.canDelete = true;
            }
          });
          if (canDisplay){
            // Mark associated notifications read if post is visible
            if (req.isAuthenticated())
              notifier.markRead(loggedInUserData._id, displayContext._id);

            // Show metadata
            if (displayedPost.images != ""){
              console.log("Post has an image!")
              metadataImage = "https://sweet.sh/images/uploads/" + displayedPost.images[0]
            }
            else {
              if (displayedPost.author.imageEnabled){
                console.log("Post has no image, but author has an image!")
                metadataImage = "https://sweet.sh/images/" + displayedPost.author.image
              }
              else {
                console.log("Neither post nor author have an image!")
                metadataImage = "https://sweet.sh/images/cake.svg";
              }
            }
            metadata = {
              title: "@" + displayedPost.author.username + " on sweet",
              description: displayedPost.rawContent.split('\n')[0],
              image: metadataImage,
              url: 'https://sweet.sh/' + displayedPost.author.username + '/' + displayedPost.url
            }
          }
          res.render('singlepost', {
            canDisplay: canDisplay,
            loggedIn: isLoggedInOrRedirect,
            loggedInUserData: loggedInUserData,
            post: displayedPost,
            flaggedUsers: flagged,
            metadata: metadata,
            isMuted: isMuted,
            isMember: isMember
          })
        }
      })
    })
  })

  app.post('/signup', function(req,res) {

    if (reservedUsernames.includes(req.body.username)){
      req.session.sessionFlash = {
        type: 'warning',
        message: "This username is unavailable.",
        username: req.body.username,
        email: req.body.email
      }
      res.redirect(301, '/signup');
    }
    else {
      req.checkBody('email', 'Please enter a valid email.').isEmail().isLength({max:80});
      req.checkBody('username', 'Username can contain only lowercase letters, numbers, - (dash) and _ (underscore).').matches(/^[a-z0-9-_]+$/);
      req.checkBody('username', 'Username must be between 2 and 20 characters long.').isLength({min: 2, max: 20})
      req.checkBody('password', 'Password must be at least 8 characters long.').isLength({min: 8});
      req.checkBody('password', 'Passwords do not match.').equals(req.body.passwordrepeat)

      req.getValidationResult().then(function (result) {
        if (!result.isEmpty()) {
            var errors = result.array().map(function (elem) {
              return elem.msg
            }).join("<hr>");
            req.session.sessionFlash = {
              type: 'warning',
              message: errors,
              username: req.body.username,
              email: req.body.email
            }
            res.redirect(301, '/signup');
        }
        else {
          req.session.sessionFlash = {
            type: 'info',
            message: 'An email has been sent to ' + req.body.email + ' with further instructions. Please check your spam or junk folder if it does not arrive in the next few minutes.'
          }
          passport.authenticate('signup', {
            successRedirect : '/login',
            failureRedirect : '/signup',
            failureFlash : true
          })(req,res);
        }
      });
    }
  });


  app.post('/login', function(req,res) {
    req.checkBody('email', 'Please check your email and password.').isEmail().notEmpty();
    // req.checkBody('password', 'Please enter a password.').notEmpty();

    req.getValidationResult().then(function (result) {
      if (!result.isEmpty()) {
          var errors = result.array().map(function (elem) {
            return elem.msg
          }).join("<hr>");
          req.session.sessionFlash = {
            type: 'warning',
            message: errors
          }
          res.redirect(301, '/login');
      }
      else {
        passport.authenticate('login', {
          successRedirect : '/home',
          failureRedirect : '/login',
          failureFlash : true
        })(req,res);
      }
    });
  });

  app.post("/useraction/:type/:action/:from/:to/:fromid/:toid/:fromusername", function(req, res) {
    User.findOne({
      _id: req.params.from
    })
    .then(fromUser => {
      from = fromUser;
      console.log(from)
    })
    .then(() => {
      User.findOne({
        _id: req.params.to
      })
      .then(toUser => {
        to = toUser;
        console.log(to)
      })
      .then(() => {
        if (req.params.action == "add"){
          const flag = new Relationship({
            from: from.email,
            to: to.email,
            fromUser: req.params.from,
            toUser: req.params.to,
            value: req.params.type
          });
          flag.save()
          .then(() => {
            // Do not notify when users are flagged, muted, or blocked (blocking and muting not currently implemented)
            if (req.params.type != 'block' && req.params.type != 'flag' && req.params.type != 'mute'){
              notifier.notify('user', 'relationship', to._id, from._id, from._id, '/' + from.username, req.params.type)
            }
          })
          .then(() => {
            res.end('{"success" : "Updated Successfully", "status" : 200}');
          })
          .catch((err) => {
            console.log("Database error.")
            console.log(err)
          });
        }
        else if (req.params.action = "delete"){
          Relationship.findOneAndRemove({
            from:  from.email,
            to: to.email,
            fromUser: from._id,
            toUser: to._id,
            value: req.params.type
          }).then(() => {
            res.end('{"success" : "Updated Successfully", "status" : 200}');
          })
          .catch((err) => {
            console.log("Database error.")
          });
        }
      })
    })
  });

  app.post("/updateprofile", isLoggedInOrRedirect, function(req, res) {
    let imageEnabled = loggedInUserData.imageEnabled;
    let imageFilename = loggedInUserData.image;
		if (Object.keys(req.files).length != 0) {
      console.log(req.files.imageUpload.data.length)
      if (req.files.imageUpload.data.length > 3145728){
        req.session.sessionFlash = {
          type: 'warning',
          message: 'File too large. The file size limit is 3MB.'
        }
        return res.redirect('back');
      }
      else {
        imageEnabled = true;
				let eventImageBuffer = req.files.imageUpload.data;
        sharp(eventImageBuffer)
          .resize({
            width: 600,
            height: 600
          })
          .jpeg({
            quality: 70
          })
          .toFile('./public/images/' + loggedInUserData._id + '.jpg')
          .catch(err => {
            console.error(err);
          });
				imageFilename = loggedInUserData._id + '.jpg';
      }
    }
    User.findOne({
      _id: loggedInUserData._id
    })
    .then((user) => {
      let parsedAbout = loggedInUserData.aboutParsed;
      if (req.body.about != loggedInUserData.aboutRaw){
        // Parse about section
        let splitAbout = req.body.about.split(/\r\n|\r|\n/gi);
        let parsedAboutArray = [];
        splitAbout.forEach(function (line) {
          if (line != ""){
            line = "<p>" + line + "</p>";
            line = Autolinker.link( line );
            var mentionRegex   = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
            var mentionReplace = '$1<a href="/$2">@$2</a>';
            var hashtagRegex   = /(^|[^#\w])#(\w{1,60})\b/g
            var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
            line = line.replace( mentionRegex, mentionReplace ).replace( hashtagRegex, hashtagReplace );
            parsedAboutArray.push(line);
          }
        })
        parsedAbout = parsedAboutArray.join('');
      }
      user.displayName = sanitize(sanitizeHtml(req.body.displayName, sanitizeHtmlOptions));
      user.aboutRaw = sanitize(req.body.about);
      user.aboutParsed = sanitize(sanitizeHtml(parsedAbout, sanitizeHtmlOptions));
      user.location = sanitize(sanitizeHtml(req.body.location, sanitizeHtmlOptions));
      user.websiteRaw = sanitize(req.body.website);
      user.websiteParsed = sanitize(sanitizeHtml(Autolinker.link(req.body.website), sanitizeHtmlOptions));
      user.image = imageFilename;
      user.imageEnabled = imageEnabled;
      user.save().then(() => {
        res.redirect('back');
      })
      .catch((err) => {
        console.log("Database error: " + err)
      });
    })
  });

  app.post("/api/image", isLoggedInOrRedirect, function(req, res) {
    if (req.files.image) {
      if (req.files.image.size <= 10485760){
        let imageFormat = fileType(req.files.image.data);
        let imageUrl = shortid.generate();
        if (imageFormat.mime == "image/gif") {
          if (req.files.image.size <= 5242880){
            var imageData = req.files.image.data;
            console.log(imageUrl + '.gif');
            fs.writeFile('./public/images/uploads/' + imageUrl + '.gif', imageData, 'base64', function(err) {
              if(err) {
                return console.log(err);
              }
              getTags('https://sweet.sh/images/uploads/' + imageUrl + '.gif')
              .then((tags) => {
                if (tags.auto){
                  imageTags = tags.auto.join(", ");
                }
                else {
                  imageTags = ""
                }
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
              })
              .catch(err => {
                console.error(err);
                imageTags = ""
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
              })
            })
          }
          else {
            res.setHeader('content-type', 'text/plain');
            res.end(JSON.stringify({error: "filesize"}));
          }
        }
        else if (imageFormat.mime == "image/jpeg" || imageFormat.mime == "image/png") {
          sharp(req.files.image.data)
            .resize({
              width: 1200,
              withoutEnlargement: true
            })
            .jpeg({
              quality: 70
            })
            .toFile('./public/images/uploads/' + imageUrl + '.jpg')
            .then(image => {
              getTags('https://sweet.sh/images/uploads/' + imageUrl + '.jpg')
              .then((tags) => {
                if (tags.auto){
                  imageTags = tags.auto.join(", ");
                }
                else {
                  imageTags = ""
                }
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.jpg', tags: imageTags}));
              })
              .catch(err => {
                console.error(err);
                imageTags = ""
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.jpg', tags: imageTags}));
              })
            })
            .catch(err => {
              console.error(err);
            });
        }
      }
      else {
        res.setHeader('content-type', 'text/plain');
        res.end(JSON.stringify({error: "filesize"}));
      }
    }
  })

  app.post("/api/image/v2", isLoggedInOrRedirect, function(req, res) {
    if (req.files.image) {
      if (req.files.image.size <= 10485760){
        let imageFormat = fileType(req.files.image.data);
        let imageUrl = shortid.generate();
        if (imageFormat.mime == "image/gif") {
          if (req.files.image.size <= 5242880){
            var imageData = req.files.image.data;
            console.log(imageUrl + '.gif');
            fs.writeFile('./cdn/images/' + imageUrl + '.gif', imageData, 'base64', function(err) {
              if(err) {
                return console.log(err);
              }
              // getTags('https://sweet.sh/images/uploads/' + imageUrl + '.gif')
              // .then((tags) => {
              //   if (tags.auto){
              //     imageTags = tags.auto.join(", ");
              //   }
              //   else {
              //     imageTags = ""
              //   }
                imageTags = ""
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
              // })
              // .catch(err => {
              //   console.error(err);
              //   imageTags = ""
              //   res.setHeader('content-type', 'text/plain');
              //   res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
              // })
            })
          }
          else {
            res.setHeader('content-type', 'text/plain');
            res.end(JSON.stringify({error: "filesize"}));
          }
        }
        else if (imageFormat.mime == "image/jpeg" || imageFormat.mime == "image/png") {
          sharp(req.files.image.data)
            .resize({
              width: 1200,
              withoutEnlargement: true
            })
            .rotate()
            .jpeg({
              quality: 70
            })
            .toFile('./cdn/images/' + imageUrl + '.jpg')
            .then(image => {
              // getTags('https://sweet.sh/images/uploads/' + imageUrl + '.jpg')
              // .then((tags) => {
              //   if (tags.auto){
              //     imageTags = tags.auto.join(", ");
              //   }
              //   else {
              //     imageTags = ""
              //   }
              imageTags = ""
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({url: imageUrl + '.jpg', tags: imageTags}));
              // })
              // .catch(err => {
              //   console.error(err);
              //   imageTags = ""
              //   res.setHeader('content-type', 'text/plain');
              //   res.end(JSON.stringify({url: imageUrl + '.jpg', tags: imageTags}));
              // })
            })
            .catch(err => {
              console.error(err);
            });
        }
      }
      else {
        res.setHeader('content-type', 'text/plain');
        res.end(JSON.stringify({error: "filesize"}));
      }
    }
  })

  app.post("/createpost", isLoggedInOrRedirect, function(req, res) {

    function wordCount(str) {
         return str.split(' ')
                .filter(function(n) { return n != '' })
                .length;
    }

    newPostUrl = shortid.generate();
    let postCreationTime = new Date();
    var postPrivacy = req.body.postPrivacy;
    var postImage = req.body.postImageUrl != "" ? [req.body.postImageUrl] : [];
    var postImageTags = req.body.postImageTags != "" ? [req.body.postImageTags] : [];
    var postImageDescription = req.body.postImageDescription != "" ? [req.body.postImageDescription] : [];
    let formattingEnabled = req.body.postFormattingEnabled ? true : false;

    // Parse post content
    let rawContent = req.body.postContent;
    let splitContent = rawContent.split(/\r\n|\r|\n/gi);
    let parsedContent = [];
    var mentionRegex   = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
    var mentionReplace = '$1<a href="/$2">@$2</a>';
    var hashtagRegex   = /(^|[^#\w])#(\w{1,60})\b/g
    var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
    var boldRegex = /(^|[^\*\w\d])\*(?!\*)((?:[^]*?[^\*])?)\*($|[^\*\w\d])(?!\*)/g
    var italicsRegex = /(^|[^_\w\d])_(?!_)((?:[^]*?[^_])?)_($|[^_\w\d])(?!_)/g
    var boldReplace = '$1<strong>$2</strong>$3';
    var italicsReplace = '$1<em>$2</em>$3';
    splitContent.forEach(function (line) {
      if (line != ""){
        line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        line = "<p>" + line + "</p>";
        line = Autolinker.link( line );
        line = line.replace( mentionRegex, mentionReplace ).replace( hashtagRegex, hashtagReplace );
        if (formattingEnabled){
          line = line.replace( boldRegex, boldReplace ).replace( italicsRegex, italicsReplace );
        }
        parsedContent.push(line);
      }
    })
    parsedContent = parsedContent.join('');

    if (!req.body.postContentWarnings){
      let contentWordCount = wordCount(parsedContent);
      if (contentWordCount > 160){
        parsedContent = '<div class="abbreviated-content">' + parsedContent + '</div><a class="show-more" data-state="contracted">Show more</a>';
      }
    }

    let postMentions = Array.from(new Set(req.body.postContent.match( mentionRegex )))
    let postTags = Array.from(new Set(req.body.postContent.match( hashtagRegex )))
    let trimmedPostMentions = []
    let trimmedPostTags = []
    if (postMentions){
      postMentions.forEach((el) => {
        trimmedPostMentions.push(el.replace(/(@|\s)*/i, ''));
      })
    }
    if (postTags){
      postTags.forEach((el) => {
        trimmedPostTags.push(el.replace(/(#|\s)*/i, ''));
      })
    }
    const post = new Post({
      type: 'original',
      authorEmail:  loggedInUserData.email,
      author: loggedInUserData._id,
      url: newPostUrl,
      privacy: postPrivacy,
      timestamp: postCreationTime,
      lastUpdated: postCreationTime,
      rawContent: sanitize(req.body.postContent),
      parsedContent: sanitize(parsedContent),
      numberOfComments: 0,
      mentions: trimmedPostMentions,
      tags: trimmedPostTags,
      contentWarnings: sanitize(sanitizeHtml(req.body.postContentWarnings, sanitizeHtmlOptions)),
      imageVersion: 2,
      images: postImage,
      imageTags: postImageTags,
      imageDescriptions: postImageDescription,
      subscribedUsers: [loggedInUserData._id]
    });
    let newPostId = post._id;

    // Parse images
    if (req.body.postImageUrl){
      image = new Image({
        context: "user",
        filename: postImage,
        privacy: postPrivacy,
        user: loggedInUserData._id
      })
      image.save();
    }

    post.save()
    .then(() => {
      trimmedPostTags.forEach((tag) => {
        Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": newPostId }, "$set": { "lastUpdated": postCreationTime} }, { upsert: true, new: true }, function(error, result) {
          if (error) return
        });
      });
      if (postPrivacy == "private"){
        console.log("This post is private!")
        // Make sure to only notify mentioned people if they are trusted
        Relationship.find({
          from: loggedInUserData.email,
          value: "trust"
        }, {'to':1})
        .then((emails) => {
          let emailsArray = emails.map(({ to }) => to)
          trimmedPostMentions.forEach(function(mention){
            User.findOne({
              username: mention
            })
            .then((user) => {
              if (emailsArray.includes(user.email)) {
                notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
              }
            })
          })
        })
        .catch((err) => {
          console.log("Error in profileData.")
          console.log(err);
        });
      }
      else if (postPrivacy == "public"){
        console.log("This post is public!")
        // This is a public post, notify everyone
        trimmedPostMentions.forEach(function(mention){
          User.findOne({
            username: mention
          })
          .then((user) => {
            notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
          })
        });
      }
      res.redirect('back');
      })
      .catch((err) => {
        console.log("Database error: " + err)
      });
  })

  app.post("/deletepost/:postid", isLoggedInOrRedirect, function(req, res) {
    Post.findOne({"_id": req.params.postid})
    .then((post) => {

      // Delete images
      post.images.forEach((image) => {
        if (post.imageVersion === 2){
          fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {console.log("Image deletion error " + err)})
        }
        else {
          fs.unlink(global.appRoot + '/public/images/uploads/' + image, (err) => {console.log("Image deletion error " + err)})
        }
        Image.deleteOne({"filename": image})
      })

      // Delete tags (does not currently fix tag last updated time)
      post.tags.forEach((tag) => {
        Tag.findOneAndUpdate({ name: tag }, { $pull: { posts: req.params.postid } })
        .then((tag) => {
          console.log("Deleted tag: " + tag)
        })
        .catch((err) => {
          console.log("Database error: " + err)
        })
      })

      // Delete boosts
      if (post.type == "original") {
        post.boosts.forEach((boost) => {
          Post.deleteOne({"_id": boost})
          .then((boost) => {
            console.log("Deleted boost: " + boost)
          })
          .catch((err) => {
            console.log("Database error: " + err)
          })
        })
      }

      // Delete notifications
      User.update(
        { },
        { $pull: { notifications: { subjectId: post._id } } },
        { multi: true }
      )
      .then(response => {
        console.log(response)
      })
    })
    .catch((err) => {
      console.log("Database error: " + err)
    })
    .then(() => {
      Post.deleteOne({"_id": req.params.postid})
			.then(() => {
        res.sendStatus(200);
      })
      .catch((err) => {
        console.log("Database error: " + err)
      });
    });
  });

  app.post("/createcomment/:postid", isLoggedInOrErrorResponse, function(req, res) {
    // Parse comment content
    let splitContent = req.body.commentContent.split(/\r\n|\r|\n/gi);
    let parsedContent = [];
    var mentionRegex   = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
    var mentionReplace = '$1<a href="/$2">@$2</a>';
    var hashtagRegex   = /(^|[^#\w])#(\w{1,60})\b/g
    var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
    splitContent.forEach(function (line) {
      if (line != ""){
        line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        line = "<p>" + line + "</p>";
        line = Autolinker.link( line );
        line = line.replace( mentionRegex, mentionReplace ).replace( hashtagRegex, hashtagReplace );
        parsedContent.push(line);
      }
    })
    parsedContent = parsedContent.join('');
    let commentMentions = Array.from(new Set(req.body.commentContent.match( mentionRegex )))
    let commentTags = Array.from(new Set(req.body.commentContent.match( hashtagRegex )))
    let trimmedCommentMentions = []
    let trimmedCommentTags = []
    if (commentMentions){
      commentMentions.forEach((el) => {
        trimmedCommentMentions.push(el.replace(/(@|\s)*/i, ''));
      })
    }
    if (commentTags){
      commentTags.forEach((el) => {
        trimmedCommentTags.push(el.replace(/(#|\s)*/i, ''));
      })
    }
    commentTimestamp = new Date();
    const comment = {
      authorEmail:  loggedInUserData.email,
      author:  loggedInUserData._id,
      timestamp: commentTimestamp,
      rawContent: sanitize(req.body.commentContent),
      parsedContent: sanitize(parsedContent),
      mentions: trimmedCommentMentions,
      tags: trimmedCommentTags
    };
    Post.findOne({
      "_id": req.params.postid
    })
    .populate('author')
    .then((post) => {
      postPrivacy = post.privacy;
			post.comments.push(comment);
      post.numberOfComments = post.comments.length;
      post.lastUpdated = new Date();
      // Add user to subscribed users for post
      if ((post.author._id.toString() != loggedInUserData._id.toString() || post.subscribedUsers.includes(loggedInUserData._id.toString()) === false)){ // Don't subscribe to your own post, or to a post you're already subscribed to
        post.subscribedUsers.push(loggedInUserData._id.toString());
      }
			post.save()
      .then(() => {
        User.findOne({
          "_id": post.author._id
        })
        .then((user) => {
          subscribedUsers = post.subscribedUsers.filter((v, i, a) => a.indexOf(v) === i);
          unsubscribedUsers = post.unsubscribedUsers.filter((v, i, a) => a.indexOf(v) === i);

          // REPLY NOTIFICATION (X REPLIED TO YOUR POST)

          if (post.author._id.toString() != loggedInUserData._id.toString() && (post.unsubscribedUsers.includes(post.author._id.toString()) === false)){ // You don't need to know about your own comments, and about replies on your posts you're not subscribed to
            console.log ("Notifying post author of a reply")
            notifier.notify('user', 'reply', user._id, req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'post')
          }

          // SUBSCRIBED NOTIFICATION (X REPLIED TO POST YOU ALSO REPLIED TO)

          function notifySubscribedUsers() {
            if (postPrivacy == "private"){
              checkTrust = true;
            }
            else {
              checkTrust = false;
            }
            subscribedUsers.forEach(user => {
              // console.log("Checking if trustedUserIds contains " + user)
              // console.log(trustedUserIds.includes(user) === checkTrust);
              if ( (user.toString() != loggedInUserData._id.toString()) // Do not notify yourself
              && (user.toString() != post.author._id.toString()) //don't notify the post author (because they get a different notification, above)
              && (post.unsubscribedUsers.includes(user.toString()) === false) //don't notify undubscribed users
              && (trustedUserIds.includes(user.toString()) === checkTrust)){ //don't notify people who you don't trust if it's a private post
                console.log("Notifying subscribed users")
                User.findById(user).then((thisuser) => {
                  if(!trimmedCommentMentions.includes(thisuser.username)){ //don't notify people who are going to be notified anyway bc they're mentioned. this would be cleaner if user (and subscribedUsers) stored usernames instead of ids.
                    notifier.notify('user', 'subscribedReply', user.toString(), req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'post')
                  }
                })
              }
            })
          }

          // Stopgap code to check if people being notified of replies on a private post can actually view it (are trusted by the post's author)
          if (postPrivacy == "private"){
            Relationship.find({
              from: post.author.email,
              value: "trust"
            }, {'to':1})
            .then((emails) => {
              trustedUserEmails = emails.map(({ to }) => to)
              User.find({
                email: { $in: trustedUserEmails }
              }, "_id")
              .then(users => {
                trustedUserIds = users.map(({ _id }) => _id.toString())
                notifySubscribedUsers();
              })
            });
          }
          else {
            trustedUserIds = []
            notifySubscribedUsers();
          }
        })

        // MENTIONS NOTIFICATION (X MENTIONED YOU IN A REPLY)

        if (postPrivacy == "private"){
          console.log("This comment is private!")
          // Make sure to only notify mentioned people if they are trusted by the post's author (and can therefore see the post)
          Relationship.find({
            from: post.author.email,
            value: "trust"
          }, {'to':1})
          .then((emails) => {
            let emailsArray = emails.map(({ to }) => to)
            trimmedCommentMentions.forEach(function(mention){
              User.findOne({
                username: mention
              })
              .then((user) => {
                if (emailsArray.includes(user.email) && user.email != post.author.email && user.email != loggedInUserData.email) { // Don't send the post's author a second notification if they're also being mentioned, and don't notify yourself
                  notifier.notify('user', 'mention', user._id, req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'reply')
                }
              })
            })
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
        }
        else if (postPrivacy == "public"){
          console.log("This comment is public!")
          // This is a public post, notify everyone
          trimmedCommentMentions.forEach(function(mention){
            User.findOne({
              username: mention
            })
            .then((user) => {
              if (user.email != post.author.email && user.email != loggedInUserData.email) { // Don't send the post's author a second notification if they're also being mentioned, and don't notify yourself
                notifier.notify('user', 'mention', user._id, req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'reply')
              }
            })
          });
        }
        if (loggedInUserData.imageEnabled){
          image = loggedInUserData.image
        }
        else {
          image = 'cake.svg'
        }
        if (loggedInUserData.displayName){
          name = '<div class="author-display-name"><strong><a class="authorLink" href="/' + loggedInUserData.username + '">' + loggedInUserData.displayName + '</a></strong></div><div class="author-username"><span class="text-muted">@' + loggedInUserData.username + '</span></div>';
        }
        else {
          name = '<div class="author-username"><strong><a class="authorLink" href="/' + loggedInUserData.username + '">@' + loggedInUserData.username + '</a></strong></div>';
        }

        result = {
          image: image,
          name: name,
          username: loggedInUserData.username,
          timestamp: moment(commentTimestamp).fromNow(),
          content: parsedContent,
          comment_id: post.comments[post.numberOfComments-1]._id.toString(),
          post_id: post._id.toString()
        }
        console.log(result);
        res.contentType('json');
        res.send(JSON.stringify(result));
      })
      .catch((err) => {
        console.log("Database error: " + err)
      });
    })
  });

  app.post("/deletecomment/:postid/:commentid", isLoggedInOrRedirect, function(req, res) {
    Post.findOne({"_id": req.params.postid})
    .then((post) => {
      var commentRemove = post.comments.id(req.params.commentid).remove();
      post.numberOfComments = post.comments.length;
      post.save()
      .then((comment) => {
        res.sendStatus(200);
      })
      .catch((error) => {
        console.error(error)
      })
    })
    .catch((err) => {
      console.log("Database error: " + err)
    })
  });

  app.post('/createboost/:postid', isLoggedInOrRedirect, function(req, res) {
    newPostUrl = shortid.generate();
    boostedTimestamp = new Date();
    Post.findOne({
      '_id': req.params.postid
    })
    .populate('author')
    .then((boostedPost) => {
      const boost = new Post({
        type: 'boost',
        boostTarget: boostedPost._id,
        authorEmail:  loggedInUserData.email,
        author: loggedInUserData._id,
        url: newPostUrl,
        privacy: 'public',
        timestamp: boostedTimestamp,
        lastUpdated: boostedTimestamp
      });
      let newPostId = boostedPost._id;
      boostedPost.boosts.push(boost._id);
      // boostedPost.lastUpdated = boostedTimestamp;
      boostedPost.save();
      boost.save().then(() => {
        notifier.notify('user', 'boost', boostedPost.author._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
        res.redirect("back");
      })
    })
  })

  app.post('/api/post/unsubscribe/:postid', isLoggedInOrRedirect, function(req,res) {
    Post.findOne({
      _id: req.params.postid
    })
    .then(post => {
      post.subscribedUsers.pull(loggedInUserData._id)
      post.unsubscribedUsers.push(loggedInUserData._id)
      post.save()
      .then(response => {
        res.sendStatus(200);
      })
      .catch(error => {
        console.error(error);
      })
    })
  })

  app.post('/api/post/subscribe/:postid', isLoggedInOrRedirect, function(req,res) {
    Post.findOne({
      _id: req.params.postid
    })
    .then(post => {
      post.unsubscribedUsers.pull(loggedInUserData._id)
      post.subscribedUsers.push(loggedInUserData._id)
      post.save()
      .then(response => {
        res.sendStatus(200);
      })
      .catch(error => {
        console.error(error);
      })
    })
  })

  app.post("/api/notification/update/:id", isLoggedInOrRedirect, function(req,res) {
    User.findOneAndUpdate(
      { "_id": req.user._id, "notifications._id": req.params.id },
      {
          "$set": {
              "notifications.$.seen": true
          }
      },
      function(err,doc) {
        res.sendStatus(200)
      }
    );
  })

  app.post("/api/notification/update-by-subject/:subjectid", isLoggedInOrRedirect, function(req,res) {
    User.findOne({
      _id: req.user._id
    })
    .then(user => {
      user.notifications.forEach(notification => {
        if (notification.subjectId == req.params.subjectid) {
          notification.seen = true;
        }
      })
      user.save()
      .then(response => {
        res.sendStatus(200);
      })
    })
  })


  app.get('/api/notification/display', function(req, res){
    if (req.isAuthenticated()){
      let loggedInUserData = req.user;
      User.findOne({
        _id: loggedInUserData._id
      }, 'notifications')
      .then(user => {
        user.notifications.reverse();
        res.render('partials/notifications', {
          layout: false,
          loggedIn: true,
          loggedInUserData: loggedInUserData,
          notifications: user.notifications
        });
      })
    }
    else {
      res.render('partials/notifications', {
        layout: false,
        loggedIn: false
      });
    }
  })
};

//For post and get requests where the browser will handle the response automatically and so redirects will work
function isLoggedInOrRedirect(req, res, next) {
  if (req.isAuthenticated()){
    loggedInUserData = req.user;
    // A potentially expensive way to update a user's last logged in timestamp (currently only relevant to sorting search results)
    currentTime = new Date();
    if ((currentTime - loggedInUserData.lastUpdated) > 3600000){ // If the timestamp is older than an hour
      User.findOne({
        _id: loggedInUserData._id
      })
      .then(user => {
        user.lastUpdated = currentTime;
        user.save()
      })
    }
    return next();
  }
  res.redirect('/');
  next('route');
}

//For post requests where the jQuery code making the request will handle the response
function isLoggedInOrErrorResponse(req, res, next) {
  if (req.isAuthenticated()){
    loggedInUserData = req.user;
    return next();
  }
  res.send('nope');
  next('route');
}


function getTags(url) {
  return new Promise((resolve, reject) => {
    request('https://api.imagga.com/v2/tags?image_url=' + url, imaggaOptions, function (error, response, body) {
      if (error) {
        console.log(error);
        tagList = {}
        resolve(tagList)
      }
      else {
        var parsedBody = JSON.parse(body);
        if (parsedBody.status.type != "error"){
          var threshold = 60;
          var tagList = {
            auto: [],
            all: []
          }
          var tags = parsedBody.result.tags;
          for (var i = 0, ii = tags.length; i < ii; i++) {
            var tag = tags[i]
              , t = tag.tag.en;
            // Add first three tags to 'auto-suggest' array, along with any
            // others over confidence threshold
            if (tagList.auto.length < 3 || tag.confidence > threshold) {
              tagList.auto.push(t);
            }
            tagList.all.push(t);
          }
          if (error) reject(error);
          else resolve(tagList);
        }
        else {
          tagList = {}
          resolve(tagList)
        }
      }
    })
  })
}
