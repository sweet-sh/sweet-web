const moment = require('moment');
const sanitizeHtml = require('sanitize-html');
const notifier = require('./notifier.js');
const sanitize = require('mongo-sanitize');
const fs = require('fs');

//just used for error log thing at the very end
const path = require('path')
const bcrypt = require('bcrypt-nodejs');

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

// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);


module.exports = function (app) {

  //Responds to get requests for images on the server. If the image is private, checks to see
  //if the user is trusted/in the community first.
  //Input: URL of an image
  //Output: Responds with either the image file or a redirect response to /404 with 404 status.
  app.get('/api/image/display/:filename', function (req, res) {

    function sendImageFile() {
      imagePath = global.appRoot + '/cdn/images/' + req.params.filename;
      try {
        if (fs.existsSync(imagePath)) {
          res.sendFile(imagePath);
        }
      } catch (err) {
        // Image file doesn't exist on server
        console.log("Image " + req.params.filename + " doesn't exist on server!")
        console.log(err)
        res.status('404')
        res.redirect('/404');
      }
    }

    Image.findOne({
        filename: req.params.filename
      })
      .then(image => {
        if (image) {
          if (image.privacy === "public") {
            sendImageFile()
          } else if (image.privacy === "private") {
            if (req.isAuthenticated()) {
              if (image.context === "user") {
                Relationship.find({
                    toUser: req.user._id,
                    value: "trust"
                  })
                  .then(trusts => {
                    usersWhoTrustMe = trusts.map(a => a.fromUser.toString());
                    usersWhoTrustMe.push(req.user._id.toString());
                    if (usersWhoTrustMe.includes(image.user)) {
                      sendImageFile()
                    } else {
                      // User not trusted by image's uploader
                      console.log("User not trusted!")
                      res.status('404')
                      res.redirect('/404');
                    }
                  })
              } else if (image.context === "community") {
                Community.find({
                    members: req.user._id
                  })
                  .then(communities => {
                    joinedCommunities = communities.map(a => a._id.toString());
                    if (joinedCommunities.includes(image.community)) {
                      sendImageFile()
                    } else {
                      // User not a member of this community
                      console.log("User not a community member!")
                      res.status('404')
                      res.redirect('/404');
                    }
                  })
              }
            } else {
              // User not logged in, but has to be to see this image
              console.log("User not logged in!")
              res.status('404');
              res.redirect('/404');
            }
          }
        } else {
          // Image entry not found in database
          console.log("Image " + image.filename + " not in database!")
          res.status('404');
          res.redirect('/404');
        }
      })
      .catch(error => {
        // Unexpected error
        console.log("Unexpected error displaying image")
        console.log(error)
        res.status('404');
        res.redirect('/404');
      })
  })

  //Very like the above, but responds to requests for images still in the temp folder, which will only be viewed in the image preview windows
  //by the poster before their post is actually made. We don't need any security checks because the only person with access to the urls of
  //these images in the first place is the person who just uploaded them.
  //Input: filename of an image
  //Output: Either the image file they requested or a 404 error
  app.get('/api/image/display/temp/:filename', function (req, res) {
    var imagePath = global.appRoot + '/cdn/images/temp/' + req.params.filename;
    try {
      if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
      }
    } catch (err) {
      // Image file doesn't exist on server
      console.log("Image " + req.params.filename + " doesn't exist on server!")
      console.log(err)
      //in theory we should probably have an image to send that has the text 'sorry' or something
      res.status('404').send('could not find requested temp image')
    }
  })

  //Responds to get requests for '/'.
  //Input: none
  //Output: redirect to '/home' if logged in, render of the index page if logged out.
  app.get('/', function (req, res) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
    res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
    res.setHeader("Expires", "0"); // Proxies.
    if (req.isAuthenticated()) {
      res.redirect('/home');
    } else {
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
  app.get('/login', function (req, res) {
    res.render('login', {
      sessionFlash: res.locals.sessionFlash
    });
  });

  //Responds to get requests for the signup page.
  //Input: flash message
  //Output: rendering of the signup page with the flash message included.
  app.get('/signup', function (req, res) {
    res.render('signup', {
      sessionFlash: res.locals.sessionFlash
    });
  });

  //Responds to get requests for the profile of someone with a certain email. Deprecated? Is this used?
  //Input: the email
  //Output: redirect to /the username of the person with that email, unless isLoggedInOrRedirect redirects you
  app.get('/getprofile/:email', isLoggedInOrRedirect, function (req, res) {
    User.findOne({
      email: req.params.email
    }).then((user) => {
      res.redirect('/' + user.username);
    })
  });

  //Responds to get requests for the home page.
  //Input: none
  //Output: the home page, if isLoggedInOrRedirect doesn't redirect you.
  app.get('/home', isLoggedInOrRedirect, function (req, res) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
    res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
    res.setHeader("Expires", "0"); // Proxies.
    res.render('home', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'home'
    });
  });

  //Responds to get requests for the 404 page.
  //Input: user data from req.user
  //Output: the 404 page
  app.get('/404', function (req, res) {
    if (req.isAuthenticated()) {
      res.render('404', {
        loggedIn: true,
        loggedInUserData: req.user
      });
    } else {
      res.render('404', {
        loggedIn: false
      });
    }
  });

  //Responds to get requests for tag pages.
  //Input: the name of the tag from the url
  //Output: the tag page rendered if it exists, redirect to the 404 page otherwise, unless isLoggedInOrRedirect redirects you
  app.get('/tag/:name', isLoggedInOrRedirect, function (req, res) {
    Tag.findOne({
        name: req.params.name
      })
      .then((tag) => {
        if (tag) {
          res.render('tag', {
            name: req.params.name,
            loggedIn: true,
            loggedInUserData: req.user
          })
        } else {
          res.redirect('/404');
        }
      })
  })

  //Responds to get requests for /notifications. I think this is only used on mobile?
  //Input: none
  //Output: renders notifications page, which renders as "you're not logged in" if you're not logged in
  app.get('/notifications', function (req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
          _id: req.user._id
        }, 'notifications')
        .then(user => {
          user.notifications.reverse();
          res.render('notifications', {
            loggedIn: true,
            loggedInUserData: req.user,
            notifications: user.notifications,
            activePage: 'notifications'
          });
        })
    } else {
      res.render('notifications', {
        loggedIn: false,
        activePage: 'notifications'
      });
    }
  })

  //Responds to get request for /settings
  //Input: none
  //Output: the settings page is rendered, unless isLoggedInOrRedirect redirects you first.
  app.get('/settings', isLoggedInOrRedirect, function (req, res) {
    res.render('settings', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'settings'
    })
  })

  //Responds to get requests for /search.
  //Input: none
  //Output: renders search page unless isLoggedInOrRedirect redirects you
  app.get('/search', isLoggedInOrRedirect, function (req, res) {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'search'
    })
  })

  //Responds to get requests for /search that include a query.
  //Input: the query
  //Output: the rendered search page, unless isLoggedInOrRedirect redirects you
  app.get('/search/:query', isLoggedInOrRedirect, function (req, res) {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'search',
      query: sanitize(sanitizeHtml(req.params.query, sanitizeHtmlOptions))
    })
  })

  //Responds to post requests (?) for the users that follow the logged in user
  //Input: none
  //Output: JSON data describing the users that follow the logged in user or a redirect from isLoggedInOrRedirect.
  //Should be isLoggedInOrErrorResponse? Because jQuery intercepts the response, the browser won't automatically handle it?
  app.post('/api/user/followers', isLoggedInOrRedirect, function (req, res) {
    followedUserData = []
    Relationship.find({
        fromUser: req.user._id,
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
        res.setHeader('content-type', 'text/plain');
        res.end(JSON.stringify({
          followers: followedUserData
        }));
      })
      .catch((err) => {
        console.log("Error in profileData.")
        console.log(err);
      });
  })

  //Responds to requests for search queries by page.
  //Input: query, page number
  //Output: 404 response if no results, the rendered search results otherwise, unless isLoggedInOrRedirect redirects you
  app.get('/showsearch/:query/:page', isLoggedInOrRedirect, function (req, res) {

    let postsPerPage = 10;
    let page = req.params.page - 1;

    let query = req.params.query.trim();
    if (!query.length) {
      res.status(404)
        .send('Not found');
    } else {
      Tag.find({
          name: {
            '$regex': query,
            '$options': 'i'
          }
        })
        .then(tagResults => {
          User.find({
              "$or": [{
                  username: {
                    '$regex': query,
                    '$options': 'i'
                  }
                },
                {
                  displayName: {
                    '$regex': query,
                    '$options': 'i'
                  }
                },
                {
                  aboutParsed: {
                    '$regex': query,
                    '$options': 'i'
                  }
                }
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
                  "$or": [{
                      name: {
                        '$regex': query,
                        '$options': 'i'
                      }
                    },
                    {
                      descriptionParsed: {
                        '$regex': query,
                        '$options': 'i'
                      }
                    }
                  ]
                })
                // .sort('name')
                // .skip(postsPerPage * page)
                // .limit(postsPerPage)
                .then(communityResults => {
                  var combinedResults = userResults.concat(communityResults, tagResults);
                  var paginatedResults = combinedResults.slice(postsPerPage * page, (postsPerPage * page) + postsPerPage);
                  if (!paginatedResults.length) {
                    if (page == 0) {
                      res.render('partials/searchresults', {
                        layout: false,
                        loggedIn: true,
                        loggedInUserData: req.user,
                        noResults: true
                      });
                    } else {
                      res.status(404)
                        .send('Not found');
                    }
                  } else {
                    var parsedResults = [];
                    paginatedResults.forEach(result => {
                      constructedResult = {};
                      if (result.username) {
                        // It's a user
                        constructedResult.type = '<i class="fas fa-user"></i> User'
                        constructedResult.sort = result.lastUpdated
                        constructedResult.email = result.email
                        if (result.displayName) {
                          constructedResult.title = '<strong><a class="authorLink" href="/' + result.username + '">' + result.displayName + '</a></strong> &middot; <span class="text-muted">@' + result.username + '</span>';
                        } else {
                          constructedResult.title = '<strong><a class="authorLink" href="/' + result.username + '">@' + result.username + '</a></strong>';
                        }
                        constructedResult.url = '/' + result.username
                        if (result.imageEnabled)
                          constructedResult.image = '/images/' + result.image
                        else
                          constructedResult.image = '/images/cake.svg'
                        constructedResult.description = result.aboutParsed
                      } else if (result.members) {
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
                      } else {
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
                    parsedResults.sort(function (a, b) {
                      var timestampA = a.sort,
                        timestampB = b.sort;
                      if (timestampA > timestampB) //sort timestamp descending
                        return -1;
                      if (timestampA < timestampB)
                        return 1;
                      return 0; //default return value (no sorting)
                    });
                    res.render('partials/searchresults', {
                      layout: false,
                      loggedIn: true,
                      loggedInUserData: req.user,
                      results: parsedResults
                    });
                  }
                })
            })
        })
    }
  })

  //Responds to a get response for a specific post.
  //Inputs: the username of the user and the string of random letters and numbers that identifies the post (that's how post urls work)
  //Outputs: showposts handles it! in fact, we don't even use the username, anything could be in there and this would still work
  app.get('/:username/:posturl', function (req, res, next) {
    req.url = req.path = "/showposts/single/" + req.params.posturl + "/1";
    req.singlepostUsername = req.params.username; //slightly sus way to pass this info to showposts
    next('route');
    return;
  })

  app.get('/tag/:tagname', function (req, res, next) {
    req.url = req.path = "/showposts/tag/" + req.params.tagname + "/1";
    next('route');
    return;
  })

  //Responds to requests for posts for feeds. API method, used within the public pages.
  //Inputs: the context is either community (posts on a community's page), home (posts on the home page), user
  //(posts on a user's profile page), or single (a single post.) The identifier identifies either the user, the
  //community, or the post. I don't believe it's used when the context is home? It appears to be the url of the image
  //of the logged in user in that case. (??????????????????) Page means page.
  //Output: the rendered HTML of the posts, unless it can't find any posts, in which case it returns a 404 error.
  app.get('/showposts/:context/:identifier/:page', async function (req, res) {
    var loggedInUserData = {};
    if (req.isAuthenticated()) {
      loggedInUserData = req.user;
    } else {
      //logged out users can't get any posts from pages of non-completely-public users and communities
      if (req.params.context == "user" && (await User.findById(req.params.identifier)).settings.profileVisibility != "profileAndPosts") {
        res.sendStatus(404);
        return;
      } else if (req.params.context == "community" && (await Community.findById(req.params.identifier)).settings.visibility != "public") {
        res.sendStatus(404);
        return;
      }
    }

    let postsPerPage = 10;
    let page = req.params.page - 1;

    //build some user lists. only a thing if the user is logged in.

    if (req.isAuthenticated()) {
      var myFollowedUserEmails = () => {
        myFollowedUserEmails = []
        myFollowedUserIds = [req.user._id]
        return Relationship.find({
            from: loggedInUserData.email,
            value: "follow"
          })
          .then((follows) => {
            for (var key in follows) {
              var follow = follows[key];
              myFollowedUserEmails.push(follow.to);
              myFollowedUserIds.push(follow.toUser)
            }
          })
          .catch((err) => {
            console.log("Error in profileData.")
            console.log(err);
          });
      }

      var myFlaggedUserEmails = () => {
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

      var usersFlaggedByMyTrustedUsers = () => {
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
                from: {
                  $in: myTrustedUserEmails
                }
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

      var usersWhoTrustMe = () => {
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

      var myCommunities = () => {
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

      var isMuted = () => {
        isMuted = false;
        if (req.params.context == "community" && req.isAuthenticated()) {
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

      await myFollowedUserEmails().then(usersWhoTrustMe).then(myFlaggedUserEmails).then(usersFlaggedByMyTrustedUsers).then(myCommunities).then(isMuted);

      myFollowedUserEmails.push(loggedInUserData.email)
      usersWhoTrustMeEmails.push(loggedInUserData.email)
      var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
    }

    const today = moment().clone().startOf('day');
    const thisyear = moment().clone().startOf('year');

    //construct the query that will retrieve the posts we want. basically just coming up with criteria to pass to Post.find

    if (req.params.context == "home") {
        console.log("========= HOME DEBUG =========")
        console.log(req.user)
        console.log(req.user.settings)
      //on the home page, we're looking for posts (and boosts) created by users we follow as well as posts in communities that we're in.
      var matchPosts = {
        '$or': [{
            'author': {
              $in: myFollowedUserIds
            }
          },
          {
            type: 'community',
            community: {
              $in: myCommunities
            }
          }
        ]
      };
      var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
    } else if (req.params.context == "user") {
      var matchPosts = {
        author: req.params.identifier
      }
      if (req.isAuthenticated()) {
        var sortMethod = req.user.settings.userTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
      }
    } else if (req.params.context == "community") {
      var matchPosts = {
        community: req.params.identifier
      }
      if (req.isAuthenticated()) {
        var sortMethod = req.user.settings.communityTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
      }
    } else if (req.params.context == "tag") {
      function getTag() {
        return Tag.findOne({
            name: req.params.identifier
          })
          .then((tag) => {
            var matchPosts = {
              _id: {
                $in: tag.posts
              }
            }
            return matchPosts;
          })
      }
      var matchPosts = await getTag();
      var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
    } else if (req.params.context == "single") {
      var author = (await User.findOne({
        username: req.singlepostUsername
      }, {
        _id: 1
      }));
      var matchPosts = {
        author: author ? author._id : undefined, //won't find anything if the author corresponding to the username couldn't be found
        url: req.params.identifier
      }
      var sortMethod = "-lastUpdated" //this shouldn't matter oh well
    }

    if (!req.isAuthenticated()) {
      matchPosts.privacy = "public";
      var sortMethod = "-lastUpdated";
    }

    var query = Post.find(
        matchPosts
      ).sort(sortMethod)
      .skip(postsPerPage * page)
      .limit(postsPerPage)
      //these populate commands retrieve the complete data for these things that are referenced in the post documents
      .populate('author', '-password')
      .populate('community')
      // If there's a better way to populate a nested tree lmk because this is... dumb. Mitch says: probably just fetching the authors recursively in actual code below
      .populate('comments.author')
      .populate('comments.replies.author')
      .populate('comments.replies.replies.author')
      .populate('comments.replies.replies.replies.author')
      .populate('comments.replies.replies.replies.replies.author')
      .populate('boostTarget')
      .populate('boostsV2.booster')

    //so this will be called when the query retrieves the posts we want
    query.then(async posts => {
      if (!posts.length) {
        res.status(404).render('singlepost', { // The 404 is required so InfiniteScroll.js stops loading the feed
          canDisplay: false,
          loggedIn: req.isAuthenticated(),
          loggedInUserData: loggedInUserData,
          post: null,
          metadata: {},
          activePage: 'singlepost'
        })
        return "no posts";
      } else {

        //now we build the array of the posts we can actually display. some that we just retrieved still may not make the cut
        displayedPosts = [];

        for (const post of posts) {

          var canDisplay = false;

          //figure out if there is a newer instance of the post we're looking at. if it's an original post, check the boosts from
          //the context's relevant users; if it's a boost, check the original post if we're in fluid mode to see if lastUpdated is more
          //recent (meaning the original was bumped up from recieving a comment) and then for both fluid and chronological we have to check
          //to see if there is a more recent boost.
          if (req.params.context != "community" && req.params.context != "single") {
            var isThereNewerInstance = false;
            var whosePostsCount = req.params.context == "user" ? [new ObjectId(req.params.identifier)] : myFollowedUserIds;
            if (post.type == 'original') {
              for (boost of post.boostsV2) {
                if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => {
                    return boost.booster.equals(f)
                  })) {
                  isThereNewerInstance = true;
                }
              }
            } else if (post.type == 'boost') {
              if (post.boostTarget != null) {
                if (sortMethod == "-lastUpdated") {
                  if (post.boostTarget.lastUpdated.getTime() > post.timestamp.getTime()) {
                    isThereNewerInstance = true;
                  }
                }
                for (boost of post.boostTarget.boostsV2) {
                  if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => {
                      return boost.booster.equals(f)
                    })) {
                    isThereNewerInstance = true;
                  }
                }
              } else {
                console.log("Error fetching boostTarget of boost")
                isThereNewerInstance = true;
              }
            }

            if (isThereNewerInstance) {
              continue;
            }
          }

          var canDisplay = false;
          if (req.isAuthenticated()) {
            //logged in users can't see private posts by users who don't trust them or community posts by muted members
            if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
              canDisplay = true;
            }
            if (post.type == "community") {
              if (myCommunities.some(m => {
                  return m.equals(post.community._id)
                })) {
                canDisplay = true;
                // Hide muted community members
                let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                if (mutedMemberIds.includes(post.author._id.toString())) {
                  canDisplay = false;
                }
              } else {
                canDisplay = false;
              }
            }
          } else {
            //for logged out users, we already eliminated private posts by specifying query.privacy =  'public',
            //so we just have to hide posts boosted from non-publicly-visible accounts and posts from private communities that
            //the user whose profile page we are on wrote (if this is an issue, we're on a profile page, bc non-public
            //community pages are hidden from logged-out users by a return at the very, very beginning of this function)
            if (post.author.settings.profileVisibility == "profileAndPosts") {
              // User has allowed non-logged-in users to see their posts
              if (post.community) {
                if (post.community.settings.visibility == "public") {
                  // Public community, can display post
                  let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                  if (mutedMemberIds.includes(post.author._id.toString())) {
                    canDisplay = false;
                  } else {
                    canDisplay = true;
                  }
                }
              } else {
                // Not a community post, can display
                canDisplay = true;
              }
            }
          }

          if (!canDisplay) {
            continue;
          }

          var displayContext = post;
          if (post.type == "boost") {
            displayContext = post.boostTarget;
            displayContext.author = await User.findById(displayContext.author);
            for (const boost of displayContext.boostsV2) {
              boost.booster = await User.findById(boost.booster);
            }
          }

          if (moment(displayContext.timestamp).isSame(today, 'd')) {
            parsedTimestamp = moment(displayContext.timestamp).fromNow();
          } else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
            parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
          } else {
            parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
          }

          //get the full url for all images in the displayContext
          imageUrlsArray = []
          if (displayContext.imageVersion === 2) {
            displayContext.images.forEach(image => {
              imageUrlsArray.push('/api/image/display/' + image)
            })
          } else {
            displayContext.images.forEach(image => {
              imageUrlsArray.push('/images/uploads/' + image)
            })
          }
          if (req.isAuthenticated()) {
            // Used to check if you can delete a post
            var isYourPost = displayContext.author._id.equals(req.user._id);
          }
          //generate some arrays containing usernames that will be put in "boosted by" labels
          if (req.isAuthenticated() && (req.params.context != "community")) {
              console.log("======== BOOSTED BY LABEL DEBUG ========")
              console.log(req.user)
              console.log(req.isAuthenticated())
            var followedBoosters = [];
            var notFollowingBoosters = [];
            var youBoosted = false;
            if (displayContext.boostsV2.length > 0) {
              displayContext.boostsV2.forEach((v, i, a) => {
                if (!(v.timestamp.getTime() == displayContext.timestamp.getTime())) { //do not include implicit boost
                  if (v.booster._id.equals(req.user._id)) {
                    followedBoosters.push('you');
                    youBoosted = true;
                  } else {
                    if (myFollowedUserIds.some(following => {
                        return following.equals(v.booster._id)
                      })) {
                      followedBoosters.push(v.booster.username);
                    } else {
                      notFollowingBoosters.push(v.booster.username);
                    }
                  }
                }
              })
            }
            if (req.params.context == "user" && !displayContext.author._id.equals(post.author._id)) {
              var boostsForHeader = [post.author.username]
            } else {
              var boostsForHeader = followedBoosters.slice(0, 3);
            }
          } else {
            //logged out users will see boosts only on user profile pages and they only need to know that that user boosted the post. should be obvious anyway but, whatevs
            if (!req.isAuthenticated() && req.params.context == "user") {
              if (displayContext.author._id.toString() != req.params.identifier) {
                boostsForHeader = [(await (User.findById(req.params.identifier))).username];
              }
            } else if (req.isAuthenticated() && req.params.context == "user") {
              if (displayContext.author._id.toString() != req.params.identifier) {
                boostsForHeader = [(await (User.findById(req.params.identifier))).username];
              }
            }
          }

          displayedPost = {
            canDisplay: canDisplay,
            _id: displayContext._id,
            deleteid: displayContext._id,
            type: displayContext.type,
            owner: displayContext.author.username,
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
            lastUpdated: displayContext.lastUpdated,
            rawContent: displayContext.rawContent,
            parsedContent: displayContext.parsedContent,
            commentsDisabled: displayContext.commentsDisabled,
            comments: displayContext.comments,
            numberOfComments: displayContext.numberOfComments,
            contentWarnings: displayContext.contentWarnings,
            images: imageUrlsArray,
            imageDescriptions: displayContext.imageDescriptions,
            imageIsVertical: displayContext.imageIsVertical,
            community: displayContext.community,
            headerBoosters: boostsForHeader,
            recentlyCommented: false, // This gets set below
            lastCommentAuthor: "", // As does this
            subscribedUsers: displayContext.subscribedUsers,
            unsubscribedUsers: displayContext.unsubscribedUsers,
            // linkPreview: displayContext.linkPreview
          }

          //these are only a thing for logged in users
          if (req.isAuthenticated()) {
            displayedPost.followedBoosters = followedBoosters;
            displayedPost.otherBoosters = notFollowingBoosters;
            displayedPost.isYourPost = isYourPost;
            displayedPost.youBoosted = youBoosted
          }

          //get timestamps and full image urls for each comment
          latestTimestamp = 0;
          lastCommentAuthor = "";
          recentlyCommented = false;
          sixHoursAgo = moment(new Date()).subtract(6, 'hours');
          threeHoursAgo = moment(new Date()).subtract(3, 'hours');

          function parseComments(element, level) {
            if (!level) level = 1;
            element.forEach(async function (comment) {
              // I'm not sure why, but boosts in the home feed don't display
              // comment authors below the top level - this fixes it, but
              // it's kind of a hack - I can't work out what's going on
              if (!comment.author.username) {
                console.log("Comment did not have author information!")

                function getUser(user) {
                  return User.findById(user);
                }
                comment.author = await getUser(comment.author)
              }
              momentifiedTimestamp = moment(comment.timestamp);
              if (momentifiedTimestamp.isSame(today, 'd')) {
                comment.parsedTimestamp = momentifiedTimestamp.fromNow();
              } else if (momentifiedTimestamp.isSame(thisyear, 'y')) {
                comment.parsedTimestamp = momentifiedTimestamp.format('D MMM');
              } else {
                comment.parsedTimestamp = momentifiedTimestamp.format('D MMM YYYY');
              }
              if (comment.timestamp > latestTimestamp) {
                latestTimestamp = comment.timestamp;
                displayedPost.lastCommentAuthor = comment.author;
              }
              // Only pulse comments from people who aren't you
              if (momentifiedTimestamp.isAfter(threeHoursAgo) && !comment.author._id.equals(req.user._id)) {
                comment.isRecent = true;
              }
              for (var i = 0; i < comment.images.length; i++) {
                comment.images[i] = '/api/image/display/' + comment.images[i];
              }
              // If the comment's author is logged in, or the displayContext's author is logged in
              if (((comment.author._id.equals(loggedInUserData._id)) || (displayContext.author._id.equals(loggedInUserData._id))) && !comment.deleted) {
                comment.canDelete = true;
              }
              if (level < globals.maximumCommentDepth) {
                comment.canReply = true;
              }
              comment.level = level;
              if (comment.replies) {
                var runOnReplies = parseComments(comment.replies, level + 1)
              }
            });
            if (moment(latestTimestamp).isAfter(sixHoursAgo)) {
              displayedPost.recentlyCommented = true;
            } else {
              displayedPost.recentlyCommented = false;
            }
          }
          parseComments(displayedPost.comments);
          // if (displayedPost._id.equals('5d04d2b0da26de82313546f3')){
          //     console.log(displayedPost.comments)
          // }
          // });

          if (req.isAuthenticated() && req.params.context == "single") {
            // Mark associated notifications read if post is visible
            notifier.markRead(loggedInUserData._id, displayContext._id)
          }

          if (req.isAuthenticated() && req.params.context == "single") {
            // Mark associated notifications read if post is visible
            notifier.markRead(loggedInUserData._id, displayContext._id)
          }

          //wow, finally.
          displayedPosts.push(displayedPost);
        }
      }
    }).then((result) => {
      function canReply() {
        if (req.isAuthenticated()) {
          // These contexts already hide posts from communites you're not a member of
          if (req.params.context == "home" || req.params.context == "tag" || req.params.context == "user") {
            return true;
          }
          if (req.params.context == "community") {
            if (myCommunities.some(m => {
                return m.equals(req.params.identifier)
              })) {
              return true;
            }
          } else {
            if (req.params.context == "single") {
              console.log(displayedPosts[0].type)
              if (displayedPosts[0].type == "community" && !isMember) {
                return false;
              } else {
                return true;
              }
            }
          }
        } else {
          return false;
        }
      }
      if (result != "no posts") {
        metadata = {};
        if (req.params.context == "single") {
          // For single posts, we are going to render a different template so that we can include its metadata in the HTML "head" section
          // We can only get the post metadata if the post array is filled (and it'll only be filled
          // if the post was able to be displayed, so this checks to see if we should display
          // our vague error message on the frontend)
          if (typeof displayedPost !== 'undefined') {
            console.log(displayedPost)
            var canDisplay = true;
            if (displayedPost.images != "") {
              console.log("Post has an image!")
              var metadataImage = "https://sweet.sh/images/uploads/" + displayedPost.images[0]
            } else {
              if (displayedPost.author.imageEnabled) {
                console.log("Post has no image, but author has an image!")
                var metadataImage = "https://sweet.sh/images/" + displayedPost.author.image
              } else {
                console.log("Neither post nor author have an image!")
                var metadataImage = "https://sweet.sh/images/cake.svg";
              }
            }
            metadata = {
              title: "@" + displayedPost.author.username + " on sweet",
              description: displayedPost.rawContent.split('\n')[0],
              image: metadataImage,
              url: 'https://sweet.sh/' + displayedPost.author.username + '/' + displayedPost.url
            }

            var post = displayedPosts[0]; //hopefully there's only one...
            if (post.community && req.isAuthenticated() && post.community.members.some(m => {
                return m.equals(req.user._id)
              })) {
              var isMember = true;
            } else {
              var isMember = false;
            }
          } else {
            var canDisplay = false;
            // We add some dummy metadata for posts which error
            metadata = {
              title: "sweet • a social network",
              description: "",
              image: "https://sweet.sh/images/cake.svg",
              url: "https://sweet.sh/"
            }
          }
          res.render('singlepost', {
            canDisplay: canDisplay,
            loggedIn: req.isAuthenticated(),
            loggedInUserData: loggedInUserData,
            posts: [post], // This is so it loads properly inside the posts_v2 partial
            flaggedUsers: flagged,
            metadata: metadata,
            isMuted: isMuted,
            isMember: isMember,
            canReply: canReply(),
            activePage: 'singlepost'
          })
        } else {
          res.render('partials/posts_v2', {
            layout: false,
            loggedIn: req.isAuthenticated(),
            isMuted: isMuted,
            loggedInUserData: loggedInUserData,
            posts: displayedPosts,
            flaggedUsers: flagged,
            context: req.params.context,
            metadata: metadata,
            canReply: canReply(),
          });
        }
      }
    })
  })

  //API method that responds to requests for posts tagged a certain way.
  //Input: name is the name of the tag, page is the page number of posts we're viewing.
  //Output: isLoggedInOrRedirect might redirect you. Otherwise, you get 404 if no showable posts are found or
  //the rendered posts results.
  /*app.get('/showtag/:name/:page', isLoggedInOrRedirect, function (req, res) {
    let postsPerPage = 10;
    let page = req.params.page - 1;

    let myFlaggedUserEmails = () => {
      myFlaggedUserEmails = []
      return Relationship.find({
          from: req.user.email,
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
          from: req.user.email,
          value: "trust"
        })
        .then((trusts) => {
          for (var key in trusts) {
            var trust = trusts[key];
            myTrustedUserEmails.push(trust.to);
          }
          return Relationship.find({
              value: "flag",
              from: {
                $in: myTrustedUserEmails
              }
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
          to: req.user.email,
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

      usersWhoTrustMeEmails.push(req.user.email);
      var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== req.user.email);
      Tag.findOne({
          name: req.params.name
        })
        .then((tag) => {
          if (req.user.settings.homeTagTimelineSorting == "fluid") {
            sortMethod = '-lastUpdated';
          } else {
            sortMethod = '-timestamp';
          }
          Post.find({
              _id: {
                $in: tag.posts
              }
            })
            .sort(sortMethod)
            .skip(postsPerPage * page)
            .limit(postsPerPage)
            .populate('author', '-password')
            .populate('comments.author', '-password')
            .populate('comments.replies.author')
            .populate('comments.replies.replies.author')
            .populate('comments.replies.replies.replies.author')
            .populate('comments.replies.replies.replies.replies.author')
            .populate({
              path: 'boostTarget',
              populate: {
                path: 'author comments.author'
              }
            })
            .then((posts) => {
              if (!posts.length) {
                res.status(404)
                  .send('Not found');
              } else {
                displayedPosts = [];
                posts.forEach(function (post, i) {
                  if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
                    let canDisplay = true;
                    if (post.type == "boost") {
                      displayContext = post.boostTarget;
                    } else {
                      displayContext = post;
                    }
                    if (moment(displayContext.timestamp).isSame(today, 'd')) {
                      parsedTimestamp = moment(displayContext.timestamp).fromNow();
                    } else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
                      parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
                    } else {
                      parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
                    }

                    imageUrlsArray = []
                    if (displayContext.imageVersion === 2) {
                      displayContext.images.forEach(image => {
                        imageUrlsArray.push('/api/image/display/' + image)
                      })
                    } else {
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
                      lastUpdated: post.lastUpdated,  For sorting, get the timestamp of the actual post, not the boosted original
                      rawContent: displayContext.rawContent,
                      parsedContent: displayContext.parsedContent,
                      commentsDisabled: displayContext.commentsDisabled,
                      comments: displayContext.comments,
                      numberOfComments: displayContext.numberOfComments,
                      contentWarnings: displayContext.contentWarnings,
                      images: imageUrlsArray,
                      imageDescriptions: displayContext.imageDescriptions,
                      community: displayContext.community,
                      boosts: displayContext.boosts,
                      boostTarget: post.boostTarget,
                      recentlyCommented: recentlyCommented,
                      lastCommentAuthor: lastCommentAuthor,
                      subscribedUsers: displayContext.subscribedUsers,
                      unsubscribedUsers: displayContext.unsubscribedUsers,
                       linkPreview: displayContext.linkPreview
                    }
                    displayedPost.comments.forEach(function (comment) {
                      comment.parsedTimestamp = moment(comment.timestamp).fromNow();
                      for (var i = 0; i < comment.images.length; i++) {
                        comment.images[i] = '/api/image/display/' + comment.images[i];
                      }
                    });
                    displayedPosts.push(displayedPost);
                  }
                })
                res.render('partials/posts_v2', {
                  layout: false,
                  loggedIn: true,
                  loggedInUserData: req.user,
                  posts: displayedPosts,
                  flaggedUsers: flagged,
                  context: req.params.context
                });
              }
            })
        })
    })
  })
  */

  //Responds to get requests for a user's profile page.
  //Inputs: username is the user's username.
  //Outputs: a 404 if the user isn't found
  app.get('/:username', function (req, res) {
    if (req.isAuthenticated()) {
      isLoggedIn = true;
    } else {
      isLoggedIn = false;
    }

    let results = {};

    let profileData = () => {
      return User.findOne({
          username: req.params.username
        })
        .then((user) => {
          if (!user) {
            console.log("no such user!");
            res.status(404).redirect('/404');
          } else {
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
    }

    let flagsOnUser = (user) => {
      if (req.isAuthenticated()) {
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
      if (req.isAuthenticated()) {
        myTrustedUserEmails = []
        myTrustedUserData = []
        return Relationship.find({
            from: req.user.email,
            value: "trust"
          })
          .then((trusts) => {
            for (var key in trusts) {
              var trust = trusts[key];
              myTrustedUserEmails.push(trust.to);
            }
            return User.find({
                email: {
                  $in: myTrustedUserEmails
                }
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
              email: {
                $in: theirTrustedUserEmails
              }
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
      if (req.isAuthenticated()) {
        myFlaggedUserEmails = []
        myFlaggedUserData = []
        return Relationship.find({
            from: req.user.email,
            value: "flag"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
            return User.find({
                email: {
                  $in: myFlaggedUserEmails
                }
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
      if (req.isAuthenticated()) {
        myBlockedUserEmails = []
        return Relationship.find({
            from: req.user.email,
            value: "block"
          })
          .then((flags) => {
            for (var key in flags) {
              var flag = flags[key];
              myFlaggedUserEmails.push(flag.to);
            }
            return User.find({
                email: {
                  $in: myFlaggedUserEmails
                }
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
      if (req.isAuthenticated()) {
        myFollowedUserEmails = []
        myFollowedUserData = []
        return Relationship.find({
            from: req.user.email,
            value: "follow"
          })
          .then((follows) => {
            for (var key in follows) {
              var follow = follows[key];
              myFollowedUserEmails.push(follow.to);
            }
            return User.find({
                email: {
                  $in: myFollowedUserEmails
                }
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
        }, {
          'from': 1
        })
        .then((followers) => {
          let followersArray = followers.map(({
            from
          }) => from)
          return User.find({
              email: {
                $in: followersArray
              }
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
              email: {
                $in: theirFollowedUserEmails
              }
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
        }, {
          'from': 1
        })
        .then((usersWhoTrustThem) => {
          let usersWhoTrustThemArray = usersWhoTrustThem.map(({
            from
          }) => from)
          return User.find({
              email: {
                $in: usersWhoTrustThemArray
              }
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
      if (req.isAuthenticated()) {
        // Is this the logged in user's own profile?
        if (results.profileData.email == req.user.email) {
          isOwnProfile = true;
          trustedUserData = results.myTrustedUserData
          followedUserData = results.myFollowedUserData
        } else {
          isOwnProfile = false;
          trustedUserData = results.theirTrustedUserData
          followedUserData = results.theirFollowedUserData
          // Check if profile user trusts logged in user
          if (theirTrustedUserEmails.includes(req.user.email)) {
            userTrustsYou = true;
          }
          // Check if profile user follows logged in user
          if (theirFollowedUserEmails.includes(req.user.email)) {
            userFollowsYou = true;
          }
        }
        flagsFromTrustedUsers = [];
        var trusted = false;
        myTrustedUserEmails.forEach(function (email) {
          // Check if logged in user trusts profile user
          if (email == results.profileData.email) {
            trusted = true;
          }
        })
        var followed = false;
        myFollowedUserEmails.forEach(function (email) {
          // Check if logged in user follows profile user
          if (email == results.profileData.email) {
            followed = true;
          }
        })
        for (var key in results.flagsOnUser) {
          var flag = results.flagsOnUser[key];
          // Check if logged in user has flagged profile user
          if (flag.from == req.user.email) {
            var flagged = true;
          }
          // Check if any of the logged in user's trusted users have flagged profile user
          if (myTrustedUserEmails.includes(flag.from)) {
            flagsFromTrustedUsers.push(flag.from)
          }
        }
        numberOfFlagsFromTrustedUsers = flagsFromTrustedUsers.length;
      } else {
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
        loggedIn: isLoggedIn,
        isOwnProfile: isOwnProfile,
        loggedInUserData: req.user,
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

  //Responds to post request from the browser informing us that the user has seen the comments of some post by setting notifications about those comments
  //to seen=true
  //Input:
  app.post("/api/notification/update/:id", isLoggedInOrRedirect, function (req, res) {
    User.findOneAndUpdate({
        "_id": req.user._id,
        "notifications._id": req.params.id
      }, {
        "$set": {
          "notifications.$.seen": true
        }
      },
      function (err, doc) {
        res.sendStatus(200)
      }
    );
  })

  app.post("/api/notification/update-by-subject/:subjectid", isLoggedInOrRedirect, function (req, res) {
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

  app.get('/api/notification/display', function (req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
          _id: req.user._id
        }, 'notifications')
        .then(user => {
          user.notifications.reverse();
          res.render('partials/notifications', {
            layout: false,
            loggedIn: true,
            loggedInUserData: req.user,
            notifications: user.notifications
          });
        })
    } else {
      res.render('partials/notifications', {
        layout: false,
        loggedIn: false
      });
    }
  })

  app.post('/admin/reporterror', function (req, res) {
    fs.appendFile("clientsideerrors.txt", req.body.errorstring + "\n\n", (error) => {
      if (error) {
        console.error(error)
      }
    });
    res.status(200).send('thank');
  })

  app.get('/admin/errorlogs/:password', function (req, res) {
    var passwordHash = "$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq"
    if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash)) {
      res.status(200).sendFile(path.resolve(global.appRoot, "clientsideerrors.txt"));
    }
  })
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