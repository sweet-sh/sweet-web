const reservedUsernames = require('../config/reserved-usernames.js')
var bcrypt = require('bcrypt-nodejs');
var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
var Autolinker = require('autolinker');
var notifier = require('./notifier.js');

sanitizeHtmlOptions = {
    allowedTags: ['em', 'strong', 'a', 'p', 'br', 'div', 'span'],
    allowedAttributes: {
        'a': ['href', 'data-*', 'target', 'rel']
    }
}

moment.updateLocale('en', {
    relativeTime: {
        future: "in %s",
        past: "%s ago",
        s: '1s',
        ss: '%ds',
        m: "1m",
        mm: "%dm",
        h: "1h",
        hh: "%dh",
        d: "1d",
        dd: "%dd",
        M: "1mon",
        MM: "%dmon",
        y: "1y",
        yy: "%dy"
    }
});

var sanitize = require('mongo-sanitize');
const sharp = require('sharp');

// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

module.exports = function (app, passport) {

    //Responds to a post request containing signup information.
    //Inputs: the request body, containing an email, a username, and a password.
    //Outputs: either a redirect back to the signup html page with an error message in the sessionflash if some of the info is invalid;
    //or a redirect to login if with a message telling you you've been sent a confirmation email otherwise. also passport is called to send the email for some reason
    app.post('/signup', function (req, res) {

        if (reservedUsernames.includes(req.body.username)) {
            req.session.sessionFlash = {
                type: 'warning',
                message: "This username is unavailable.",
                username: req.body.username,
                email: req.body.email
            }
            res.redirect(301, '/signup');
        } else {
            req.checkBody('email', 'Please enter a valid email.').isEmail().isLength({
                max: 80
            });
            req.checkBody('username', 'Username can contain only lowercase letters, numbers, - (dash) and _ (underscore).').matches(/^[a-z0-9-_]+$/);
            req.checkBody('username', 'Username must be between 2 and 20 characters long.').isLength({
                min: 2,
                max: 20
            })
            req.checkBody('password', 'Password must be at least 8 characters long.').isLength({
                min: 8
            });
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
                } else {
                    req.session.sessionFlash = {
                        type: 'info',
                        message: 'An email has been sent to ' + req.body.email + ' with further instructions. Please check your spam or junk folder if it does not arrive in the next few minutes.'
                    }
                    passport.authenticate('signup', {
                        successRedirect: '/login',
                        failureRedirect: '/signup',
                        failureFlash: true
                    })(req, res);
                }
            });
        }
    });


    //Responds to post requests containing information theoretically used to log a user in.
    //Input: info from the request body: the email field and the password field. the email field can actually also contain the user's username and
    //work just as well.
    //Output: either a redirect back to the login html page with a sessionflash message "Please check you email and password" (which shows up twice in fact if
    //you didn't enter an email) or you are successfully logged in by passport.
    app.post('/login', function (req, res) {
        req.checkBody('email', 'Please check your email and password.').isEmail().notEmpty();
        // req.checkBody('password', 'Please enter a password.').notEmpty();

        req.getValidationResult().then(function (result) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
            res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
            res.setHeader("Expires", "0"); // Proxies.
            if (!result.isEmpty()) {
                var errors = result.array().map(function (elem) {
                    return elem.msg
                }).join("<hr>");
                req.session.sessionFlash = {
                    type: 'warning',
                    message: errors
                }
                res.redirect(301, '/login');
            } else {
                passport.authenticate('login', {
                    successRedirect : '/home',
                    failureRedirect : '/login',
                    failureFlash : true
                  })(req,res);
            }
        });
    });


    //Responds to get requests for /logout.
    //Input: none
    //Output: user is logged out and redirected to the referring page or / if no referrer.
    app.get('/logout', function (req, res) {
        req.logout();
        req.session.destroy();
        res.redirect('back');
    });

    //Responds to post requests that create relationships between users.
    //Input: the parameters in the url. type can be either follow, flag, or trust; action can either be add (follow/flag/trust) or delete (unfollow/unflag/untrust);
    //from and fromid are both the id of the account taking the action (?), same with to and toid (??) and from username is the username of the account
    //taking the action.
    //Output: a relationship document in the database or the removal of one, depending on type, and a notification if someone has followed someone. Or
    //isLoggedInOrRedirect redirects you.
    app.post("/useraction/:type/:action/:from/:to/:fromid/:toid/:fromusername", isLoggedInOrRedirect, function (req, res) {
        if (req.params.from != req.user._id.toString()) {
            res.status(400).send("action not permitted: following/unfollowing/flagging/unflagging/trusting/untrusting a user from an account you're not logged in to");
            return;
        }
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
                        if (req.params.action == "add") {
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
                                    if (req.params.type != 'block' && req.params.type != 'flag' && req.params.type != 'mute') {
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
                        } else if (req.params.action = "delete") {
                            Relationship.findOneAndRemove({
                                    from: from.email,
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

    //Respond to post requests that update the logged in user's display name, bio, location, website, and profile picture.
    //Inputs: all the fields listed above, in req.params. new profile pictures arrive as raw image data, not a url (like in createpost.)
    //Outputs: if the user has uploaded a new image, that image is saved; all the fields in the user's document are updated.
    app.post("/updateprofile", isLoggedInOrRedirect, function (req, res) {
        let imageEnabled = req.user.imageEnabled;
        let imageFilename = req.user.image;
        if (Object.keys(req.files).length != 0) {
            console.log(req.files.imageUpload.data.length)
            if (req.files.imageUpload.data.length > 3145728) {
                req.session.sessionFlash = {
                    type: 'warning',
                    message: 'File too large. The file size limit is 3MB.'
                }
                return res.redirect('back');
            } else {
                imageEnabled = true;
                let eventImageBuffer = req.files.imageUpload.data;
                sharp(eventImageBuffer)
                    .resize({
                        width: 600,
                        height: 600
                    })
                    .jpeg({
                        quality: 85
                    })
                    .toFile('./public/images/' + req.user._id + '.jpg')
                    .catch(err => {
                        console.error(err);
                    });
                imageFilename = req.user._id + '.jpg';
            }
        }
        User.findOne({
                _id: req.user._id
            })
            .then((user) => {
                let parsedAbout = req.user.aboutParsed;
                if (req.body.about != req.user.aboutRaw) {
                    // Parse about section
                    let splitAbout = req.body.about.substring(0,500).split(/\r\n|\r|\n/gi);
                    let parsedAboutArray = [];
                    splitAbout.forEach(function (line) {
                        if (line != "") {
                            line = "<p>" + line + "</p>";
                            line = Autolinker.link(line);
                            var mentionRegex = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
                            var mentionReplace = '$1<a href="/$2">@$2</a>';
                            var hashtagRegex = /(^|[^#\w])#(\w{1,60})\b/g
                            var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
                            line = line.replace(mentionRegex, mentionReplace).replace(hashtagRegex, hashtagReplace);
                            parsedAboutArray.push(line);
                        }
                    })
                    parsedAbout = parsedAboutArray.join('');
                }
                user.displayName = sanitize(sanitizeHtml(req.body.displayName.substring(0,50), sanitizeHtmlOptions));
                user.pronouns = sanitize(sanitizeHtml(req.body.pronouns.substring(0,50), sanitizeHtmlOptions));
                user.aboutRaw = sanitize(req.body.about.substring(0,500));
                user.aboutParsed = sanitize(sanitizeHtml(parsedAbout, sanitizeHtmlOptions));
                user.location = sanitize(sanitizeHtml(req.body.location.substring(0,50), sanitizeHtmlOptions));
                user.websiteRaw = sanitize(req.body.website.substring(0,50));
                user.websiteParsed = sanitize(sanitizeHtml(Autolinker.link(req.body.website.substring(0,50)), sanitizeHtmlOptions));
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


    //Responds to post requests from users who do not want notifications from activity on some post anymore.
    //Inputs: the id of the post
    //Outputs: removes the logged in user from the post's subscribedusers field, adds them to unsubscribedUsers
    app.post('/api/post/unsubscribe/:postid', isLoggedInOrRedirect, async function (req, res) {
        Post.findOne({
                _id: req.params.postid
            })
            .then(async post => {
                if(post.type=="boost"){
                    post = await Post.findById(post.boostTarget);
                }
                post.subscribedUsers.pull(req.user._id)
                post.unsubscribedUsers.push(req.user._id)
                post.save()
                    .then(response => {
                        res.sendStatus(200);
                    })
                    .catch(error => {
                        console.error(error);
                    })
            })
    })

    //Well, it's a bit like the last one but in reverse
    app.post('/api/post/subscribe/:postid', isLoggedInOrRedirect, async function (req, res) {
        Post.findOne({
                _id: req.params.postid
            })
            .then(async post => {
                if(post.type=="boost"){
                    post = await Post.findById(post.boostTarget);
                }
                post.unsubscribedUsers.pull(req.user._id)
                post.subscribedUsers.push(req.user._id)
                post.save()
                    .then(response => {
                        res.sendStatus(200);
                    })
                    .catch(error => {
                        console.error(error);
                    })
            })
    })

    //Responds to post request that's updating settings
    //Input: the settings
    //Output: settings are saved for the user in the database, we're redirected back to the user's page.
    //database error will do... something? again, all unless isLoggedInOrRedirect redirects you first.
    app.post('/updatesettings', isLoggedInOrRedirect, async function (req, res) {
        let updatedSettings = req.body;
        console.log(updatedSettings)
        var user = await User.findById(req.user._id);
        var us = user.settings;

        //it would be nice if the email stuff could be kept in the emailer file but not sure how?
        var emailStuffChanged = false;
        if(us.emailTime != updatedSettings.emailTime || us.emailDay != updatedSettings.emailDay || us.timezone!=updatedSettings.timezone || us.autoDetectedTimeZone != updatedSettings.autoDetectedTimeZone){
            emailStuffChanged = true;
        }

        User.update({
                _id: req.user._id
            }, {
                $set: {
                    'settings.timezone': updatedSettings.timezone,
                    'settings.autoDetectedTimeZone': updatedSettings.autoDetectedTimeZone,
                    'settings.profileVisibility': updatedSettings.profileVisibility,
                    'settings.newPostPrivacy': updatedSettings.newPostPrivacy,
                    'settings.digestEmailFrequency': updatedSettings.digestEmailFrequency,
                    'settings.imageQuality': updatedSettings.imageQuality,
                    'settings.homeTagTimelineSorting': updatedSettings.homeTagTimelineSorting,
                    'settings.userTimelineSorting': updatedSettings.userTimelineSorting,
                    'settings.communityTimelineSorting': updatedSettings.communityTimelineSorting,
                    'settings.flashRecentComments': (updatedSettings.flashRecentComments == 'on' ? true : false),
                    'settings.emailTime': updatedSettings.emailTime,
                    'settings.emailDay': updatedSettings.emailDay
                }
            })
            .then(user => {
                if(emailStuffChanged){
                    emailer.updateEmailSettings(user);
                }
                res.redirect('/' + req.user.username)
            })
            .catch(error => {
                console.log("Error updating settings!")
                console.log(error)
            })
    })

    app.post('/api/notifications/clearall', isLoggedInOrRedirect, function (req, res) {
        User.findOne({
            _id: req.user._id
          }, 'notifications')
          .then(user => {
            user.notifications.forEach(notification => {
               notification.seen = true;
            })
            user.save()
            .then(result => {
                if (result) {
                    res.sendStatus(200);
                }
            })
          })
      })

    //Responds to get requests for email verification that don't have the verification token included. Deprecated? When would this happen
    //Input: none
    //Output: redirect to /login with a 301 code and "No token provided" in the flash message.
    app.get('/verify-email', function (req, res) {
        req.session.sessionFlash = {
            type: 'warning',
            message: "No token provided."
        }
        res.redirect(301, '/login');
    });

    //Responds to get requests for email verification that include the verification token.
    //Input: the token
    //Output: rendering of verify-email with the token as a hidden input on the page and the email autofilled from sessionFlash.
    app.get('/verify-email/:verificationtoken', function (req, res) {
        res.render('verify-email', {
            sessionFlash: res.locals.sessionFlash,
            token: req.params.verificationtoken
        });
    })

    //Responds to post requests for email verification.
    //Input: the email address and the verification token
    //Output: A redirect to /verify-email/... if the email is wrong or there's an error saving the user,
    //redirect to /resend-token if the token is wrong or if there is a database error finding the user, or a
    //redirect to /login and the user's isVerified property being set to true if everything's right.
    app.post('/verify-email', function (req, res) {
        req.checkBody('email', 'Please enter a valid email.').isEmail().isLength({
            max: 80
        });
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
            } else {
                User.findOne({
                        email: req.body.email,
                        verificationToken: req.body.verificationToken,
                        verificationTokenExpiry: {
                            $gt: Date.now()
                        }
                    })
                    .then(user => {
                        if (!user) {
                            console.log("No such user")
                            req.session.sessionFlash = {
                                type: 'warning',
                                message: "Email verification token invalid or has expired. Enter your email below to resend the token."
                            }
                            res.redirect(301, '/resend-token');
                        } else {
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
    app.get('/resend-token', function (req, res) {
        res.render('resend-token', {
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to post requests from /resend-token
    //Input: email address
    //Output: a redirect to /resend-token with a new flash message.
    app.post('/resend-token', function (req, res) {
        User.findOne({
                email: req.body.email
            })
            .then(user => {
                if (!user) { // There is no user registered with this email.
                    req.session.sessionFlash = {
                        type: 'success',
                        message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page.",
                        email: req.body.email
                    }
                    res.redirect(301, '/resend-token');
                } else if (user.isVerified) { // This email address is aleady verified.
                    req.session.sessionFlash = {
                        type: 'success',
                        message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page.",
                        email: req.body.email
                    }
                    res.redirect(301, '/resend-token');
                } else { // Actual success
                    require('crypto').randomBytes(20, function (err, buffer) {
                        token = buffer.toString('hex');
                    })
                    user.verificationToken = token;
                    user.verificationTokenExpiry = Date.now() + 3600000; // 1 hour
                    user.save()
                        .then(user => {
                            const msg = {
                                to: email,
                                from: 'support@sweet.sh',
                                subject: 'sweet new user verification',
                                text: 'Hi! You are receiving this because you have created a new account on sweet with this email.\n\n' +
                                    'Please click on the following link, or paste it into your browser, to verify your email:\n\n' +
                                    'https://sweet.sh/verify-email/' + token + '\n\n' +
                                    'If you did not create an account on sweet, please ignore and delete this email. The token will expire in an hour.\n'
                            };
                            sgMail.send(msg)
                                .then(user => {
                                    req.session.sessionFlash = {
                                        type: 'success',
                                        message: "A new token has been sent to " + req.body.email + ". Please check your spam or junk folder if it does not arrive in the next few minutes. You may now close this page."
                                    }
                                    res.redirect(301, '/resend-token');
                                })
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
    app.get('/forgot-password', function (req, res) {
        res.render('forgot-password', {
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to get requests for /forgot-password with a password reset token
    //Input: password reset token
    //Output: a redirect to /forgot-password with flash message if the token is wrong,
    //a redirect to reset-password if the token is right
    app.get('/reset-password/:token', function (req, res) {
        User.findOne({
                passwordResetToken: req.params.token,
                passwordResetTokenExpiry: {
                    $gt: Date.now()
                }
            })
            .then(user => {
                if (!user) {
                    console.log("Wrong token on GET")
                    req.session.sessionFlash = {
                        type: 'warning',
                        message: "Password reset token is invalid or has expired."
                    }
                    res.redirect(301, '/forgot-password');
                } else {
                    console.log("Correct token")
                    res.render('reset-password', {
                        sessionFlash: res.locals.sessionFlash,
                        resetToken: req.params.token
                    });
                }
            })
    });

    //Responds to post requests from /forgot-password by sending a password reset email with a token
    //Input: the user's email
    //Ouput: just a redirect to /forgot-password with an incorrect flash message if the email is wrong,
    //an email with a link to /reset-password with a token if the email is right and the token saved in
    //the database, or a redirect to /forgot-password with a warning message if the email or database apis return errors.
    app.post('/forgot-password', function (req, res) {
        require('crypto').randomBytes(20, function (err, buffer) {
            token = buffer.toString('hex');
        })
        User.findOne({
                email: req.body.email
            })
            .then(user => {
                if (!user) { // No account with this email address exists.
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
    app.post('/reset-password/:token', function (req, res) {
        console.log(req.params.token)
        User.findOne({
                passwordResetToken: req.params.token,
                passwordResetTokenExpiry: {
                    $gt: Date.now()
                }
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
                } else {
                    console.log("Checking body")
                    req.checkBody('password', 'Password must be at least 8 characters long.').isLength({
                        min: 8
                    });
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
                        } else {
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
};

//For post and get requests where the browser will handle the response automatically and so redirects will work
function isLoggedInOrRedirect(req, res, next) {
    if (req.isAuthenticated()) {
        // A potentially expensive way to update a user's last logged in timestamp (currently only relevant to sorting search results)
        currentTime = new Date();
        if ((currentTime - req.user.lastUpdated) > 3600000) { // If the timestamp is older than an hour
            User.findOne({
                    _id: req.user._id
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
