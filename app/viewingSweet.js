var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
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
const fs = require('fs');

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
      if (req.params.context == "user" && (await Post.findById(req.params.identifier)).settings.profileVisibility != "profileAndPosts") {
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

      var myCommunitites = () => {
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

      await myFollowedUserEmails().then(usersWhoTrustMe).then(myFlaggedUserEmails).then(usersFlaggedByMyTrustedUsers).then(myCommunitites).then(isMuted);

      myFollowedUserEmails.push(loggedInUserData.email)
      usersWhoTrustMeEmails.push(loggedInUserData.email)
      var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
    }

    const today = moment().clone().startOf('day');
    const thisyear = moment().clone().startOf('year');

    //construct the query that will retrieve the posts we want. if we are looking at a community page, we can do it with Post.find. otherwise,
    //we have to do some juggling to factor boosts into the sort order of our posts, so we use a more complex Post.aggregate call.

    if (req.params.context == "community") {
      var postDisplayCriteria = {
        type: community,
        community: req.params.identifier
      };
      //this defaults to fluid mode for logged out users
      var sortMethod = req.isAuthenticated() && req.user.settings.communityTimelineSorting == "chronological" ? "-timestamp" : "-lastUpdated";
      var query = Post.find(
          postDisplayCriteria
        ).sort(sortMethod)
        .skip(postsPerPage * page)
        .limit(postsPerPage)
        //these populate commands retrieve the complete data for these things that are referenced in the post documents we retrieve
        .populate('author', '-password')
        .populate('community')
    } else {
      if (req.params.context == "home") {
        //on the home page, we're concerned about boosts by users we follow for sorting, and overall we're looking for posts
        //that were boosted (implicitly or explicitly) by users we follow OR are from a community we're in.
        var matchBoosts = {
          'boostsV2.booster': {
            $in: myFollowedUserIds
          }
        }
        var matchPosts = {
          '$or': [matchBoosts,
            {
              type: 'community',
              community: {
                $in: myCommunities
              }
            }
          ]
        };
        var sortingType = req.user.settings.homeTagTimelineSorting;
      } else if (req.params.context == "user") {
        //on a user profile page, we're just concerned about boosts by that user, for sorting or for finding the posts in the first place.
        var matchBoosts = {
          'boostsV2.booster': new ObjectId(req.params.identifier)
        };
        var matchPosts = matchBoosts;
        var sortingType = req.user.settings.userTimelineSorting;
      }

      var aggregateQuery = [{
        '$match': matchPosts
      }, {
        //get a separate document for each boost that has occured for our retrieved posts
        '$unwind': {
          'path': '$boostsV2'
        }
      }, {
        //keep the documents for boosts we care about
        '$match': matchPosts
      }]

      if (sortingType == "fluid") {
        //for fluid sorting, we have to count comments in, so we add some aggregation stages to combine the boosts and comments
        //and find the most recent timestamp between them.
        aggregateQuery = aggregateQuery.concat([{
          '$group': {
            '_id': '$_id',
            'boostsV2': {
              '$addToSet': '$boostsV2'
            },
            'comments': {
              '$last': '$comments'
            }
          }
        }, {
          '$project': {
            'activity': {
              '$concatArrays': [
                '$boostsV2', '$comments'
              ]
            }
          }
        }, {
          '$project': {
            'sortByTimestamp': {
              '$max': '$activity.timestamp'
            }
          }
        }])
      } else {
        //if order is chronological, we just use the most recent timestamp of the relevant boosts, ignoring comments.
        if (req.params.context == "home") {
          //if we're home, there might be more than one relevant boost, so we group them before finding the max.
          aggregateQuery = aggregateQuery.concat([{
            '$group': {
              '_id': '$_id',
              'boostsV2': {
                '$addToSet': '$boostsV2'
              }
            }
          }]);
        }
        aggregateQuery = aggregateQuery.concat([{
          '$project': {
            'sortByTimestamp': {
              '$max': '$boostsV2.timestamp'
            }
          }
        }])
      }

      aggregateQuery = aggregateQuery.concat([{
        //now we do some really boring stuff
        '$sort': {
          'sortByTimestamp': -1
        }
      }, {
        '$skip': postsPerPage * page
      }, {
        '$limit': postsPerPage
      }, {
        //these three stages get us back the full post document with all the boosts and various fields intact, since we eliminated all but the 
        //ones that we're sorting by with the second $match and potentially the $group and i guess definitely the project above
        '$lookup': {
          'from': 'posts',
          'localField': '_id',
          'foreignField': '_id',
          'as': 'fullDocument'
        }
      }, {
        '$unwind': {
          'path': '$fullDocument'
        }
      }, {
        '$replaceRoot': {
          'newRoot': '$fullDocument'
        }
      }, {
        //find the full document that the author field references
        '$lookup': {
          'from': 'users',
          'localField': 'author',
          'foreignField': '_id',
          'as': 'author'
        }
      }, {
        //it's returned as an array for no reason so we have to unwind
        '$unwind': {
          'path': '$author'
        }
      }, {
        //do the same thing for communities
        '$lookup': {
          'from': 'communities',
          'localField': 'community',
          'foreignField': '_id',
          'as': 'community'
        }
      }, {
        '$unwind': {
          'path': '$community',
          //extremely necessary for non-community posts:
          'preserveNullAndEmptyArrays': true
        }
      }])
      var query = Post.aggregate(aggregateQuery);
    }

    //so this will be called when the query retrieves the posts we want
    query.then(async posts => {
      if (!posts.length) {
        res.status(404)
          .send('Not found');
        return "no posts";
      } else {
        //now we build the array of the posts we can actually display. some that we just retrieved still may not make the cut
        displayedPosts = [];

        for (const post of posts) {

          //get the full documents that these fields reference. you could do this with mongoose's populate() when using the find() query but
          //not with the aggregate one. you can also do it with aggregation stages but for each of the subarray elements (comments.author,
          //boostsV2.booster) it would take a lookup, an unwind, an addFields, and a group that listed every field in the post document.
          //might be faster though, since it's done by the mongodb program. also maybe there's a better way to write it that i can't figure out

          for (const comment of post.comments) {
            comment.author = await User.findById(comment.author);
          }

          for (const boost of post.boostsV2) {
            boost.booster = await User.findById(boost.booster);
          }

          var canDisplay = false;
          if (req.isAuthenticated()) {
            //logged in users can't see private posts by users who don't trust them or community posts by muted members
            if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
              canDisplay = true;
            }
            if (post.type == "community") {
              // Hide muted community members
              let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
              if (mutedMemberIds.includes(post.author._id.toString())) {
                canDisplay = false;
              }
            }
          } else {
            //for logged out users, we already eliminated private posts by specifying privacy: 'public' in the query,
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
            //if we can't display the post, move on to the next one in the loop
            continue;
          }

          //some fun logic that creates a "recently commented on by" label for recently commented on posts
          if (moment(post.timestamp).isSame(today, 'd')) {
            parsedTimestamp = moment(post.timestamp).fromNow();
          } else if (moment(post.timestamp).isSame(thisyear, 'y')) {
            parsedTimestamp = moment(post.timestamp).format('D MMM');
          } else {
            parsedTimestamp = moment(post.timestamp).format('D MMM YYYY');
          }
          if (post.comments != "") {
            if (moment(post.comments.slice(-1)[0].timestamp).isAfter(moment(new Date()).subtract(6, 'hours'))) {
              recentlyCommented = true;
              lastCommentAuthor = post.comments.slice(-1)[0].author
            } else {
              recentlyCommented = false;
              lastCommentAuthor = "";
            }
          } else {
            recentlyCommented = false;
            lastCommentAuthor = "";
          }

          //get the full url for all images in the post
          imageUrlsArray = []
          if (post.imageVersion === 2) {
            post.images.forEach(image => {
              imageUrlsArray.push('/api/image/display/' + image)
            })
          } else {
            post.images.forEach(image => {
              imageUrlsArray.push('/images/uploads/' + image)
            })
          }

          //generate some arrays containing usernames that will be put in "boosted by" labels
          if (req.isAuthenticated()) {
            var followedBoosters = [];
            var otherBoosters = [];
            var isYourPost = post.author._id.equals(req.user._id);
            var youBoosted = false;
            if (post.boostsV2.length > 1) {
              post.boostsV2.forEach((v, i, a) => {
                if (!(v.timestamp.getTime() == post.timestamp.getTime())) { //do not include implicit boost
                  if (v.booster._id.equals(req.user._id)) {
                    followedBoosters.push('you');
                    youBoosted = true;
                  } else {
                    if (followedBoosters.length < 3 && myFollowedUserIds.some(following => {
                        return following.equals(v.booster._id)
                      })) {
                      followedBoosters.push(v.booster.username);
                    } else if (isYourPost || followedBoosters.length == 3) {
                      otherBoosters.push(v.booster.username);
                    }
                  }
                }
              })
            } else if (post.boostsV2[0].timestamp.getTime() != post.timestamp.getTime()) {
              //if there's only one boost, and it's not the implicit one, the post's author re-boosted it
              followedBoosters.push('you');
              youBoosted = true;
            }
          } else {
            //logged out users will see boosts only on user profile pages and they only need to know that that user boosted the post. should be obvious anyway but, whatevs
            if (req.params.context == "user") {
              if (post.author._id.toString() != req.params.identifier) {
                followedBoosters = [(await (User.findById(req.params.identifier))).username];
              }
            }
          }

          displayedPost = {
            canDisplay: canDisplay,
            _id: post._id,
            deleteid: post._id,
            type: post.type,
            owner: post.author.username,
            author: {
              email: post.author.email,
              _id: post.author._id,
              username: post.author.username,
              displayName: post.author.displayName,
              imageEnabled: post.author.imageEnabled,
              image: post.author.image,
            },
            url: post.url,
            privacy: post.privacy,
            parsedTimestamp: parsedTimestamp,
            lastUpdated: post.lastUpdated,
            rawContent: post.rawContent,
            parsedContent: post.parsedContent,
            commentsDisabled: post.commentsDisabled,
            comments: post.comments,
            numberOfComments: post.numberOfComments,
            contentWarnings: post.contentWarnings,
            images: imageUrlsArray,
            imageDescriptions: post.imageDescriptions,
            community: post.community,
            followedBoosters: followedBoosters,
            recentlyCommented: recentlyCommented,
            lastCommentAuthor: lastCommentAuthor,
            subscribedUsers: post.subscribedUsers,
            unsubscribedUsers: post.unsubscribedUsers,
            // linkPreview: post.linkPreview
          }

          //these are only a thing for logged in users
          if (req.isAuthenticated()) {
            displayedPost.otherBoosters = otherBoosters;
            displayedPost.isYourPost = isYourPost;
            displayedPost.youBoosted = youBoosted
          }

          //get timestamps and full image urls for each comment
          displayedPost.comments.forEach(function (comment) {
            comment.parsedTimestamp = moment(comment.timestamp).fromNow();
            for (var i = 0; i < comment.images.length; i++) {
              comment.images[i] = '/api/image/display/' + comment.images[i];
            }
            // If the comment's author is logged in, or the post's author is logged in
            if ((comment.author._id.equals(loggedInUserData._id)) || (post.author._id.equals(loggedInUserData._id))) {
              comment.canDelete = true;
            }
          });

          //wow, finally.
          displayedPosts.push(displayedPost);
        }
      }
    }).then((result) => {
      if (result != "no posts") {
        metadata = {};
        if (req.params.context == "single") {
          metadata = {
            title: "sweet",
            description: displayedPosts[0].rawContent.split('.')[0],
            image: "https://sweet.sh/images/uploads/" + displayedPosts[0].image
          }
        }
        res.render('partials/posts', {
          layout: false,
          loggedIn: req.isAuthenticated(),
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


  //API method that responds to requests for posts tagged a certain way.
  //Input: name is the name of the tag, page is the page number of posts we're viewing.
  //Output: isLoggedInOrRedirect might redirect you. Otherwise, you get 404 if no showable posts are found or
  //the rendered posts results.
  app.get('/showtag/:name/:page', isLoggedInOrRedirect, function (req, res) {
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
                      unsubscribedUsers: displayContext.unsubscribedUsers,
                      // linkPreview: displayContext.linkPreview
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
                res.render('partials/posts', {
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

  //Responds to a get response for a specific post.
  //Inputs: the username of the user and the string of random letters and numbers that identifies the post (that's how post urls work)
  //Outputs: a rendering of the post (based on singlepost.handlebars) or an error might happen i guess. if the post is private singleposts contains and will render an error message
  app.get('/:username/:posturl', function (req, res) {
    var loggedInUserData = {};
    var isLoggedIn = false;
    if (req.isAuthenticated()) {
      isLoggedIn = true;
      loggedInUserData = req.user;
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
      if (isLoggedIn) {
        return Post.findOne({
            url: req.params.posturl
          })
          .then(post => {
            if (post) {
              if (post.type == "community") {
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
      if (req.isAuthenticated()) {
        myFollowedUserEmails.push(loggedInUserData.email)
        usersWhoTrustMeEmails.push(loggedInUserData.email)
        var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
      }
      Post.findOne({
          url: req.params.posturl
        })
        .populate('author', '-password')
        .populate('community')
        .populate('comments.author', '-password')
        .populate({
          path: 'boostTarget',
          populate: {
            path: 'author comments.author'
          }
        })
        .then((post) => {
          if (!post) {
            res.render('singlepost', {
              canDisplay: false,
              loggedIn: isLoggedIn,
              loggedInUserData: loggedInUserData,
              activePage: 'singlepost'
            })
          } else {
            displayedPost = [];
            metadata = {};
            let canDisplay = false;
            if (req.isAuthenticated()) {
              if ((post.privacy == "private" && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy == "public") {
                if (post.community) {
                  isInCommunity = (loggedInUserData.communities.indexOf(post.community._id.toString()) > -1);
                  if (isInCommunity) {
                    let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                    if (mutedMemberIds.includes(post.author._id.toString())) {
                      canDisplay = false;
                    } else {
                      canDisplay = true;
                    }
                  } else if (post.community.settings.visibility == "public") {
                    canDisplay = true;
                  }
                } else {
                  canDisplay = true;
                }
              }
            } else {
              if (post.privacy == "public" && post.author.settings.profileVisibility == "profileAndPosts") {
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
            if (post.type == "boost") {
              console.log("It's a boosted post!")
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
            if (displayContext.comments != "") {
              if (moment(displayContext.comments.slice(-1)[0].timestamp).isAfter(moment(new Date()).subtract(6, 'hours'))) {
                recentlyCommented = true;
                lastCommentAuthor = displayContext.comments.slice(-1)[0].author
              } else {
                recentlyCommented = false;
                lastCommentAuthor = "";
              }
            } else {
              recentlyCommented = false;
              lastCommentAuthor = "";
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
              unsubscribedUsers: displayContext.unsubscribedUsers,
              // linkPreview: displayContext.linkPreview
            }
            displayedPost.comments.forEach(function (comment) {
              comment.parsedTimestamp = moment(comment.timestamp).fromNow();
              for (var i = 0; i < comment.images.length; i++) {
                comment.images[i] = '/api/image/display/' + comment.images[i];
              }
              // If the comment's author is logged in, or the post's author is logged in
              if ((comment.author._id.equals(loggedInUserData._id)) || (displayContext.author._id.equals(loggedInUserData._id))) {
                comment.canDelete = true;
              }
            });
            if (canDisplay) {
              // Mark associated notifications read if post is visible
              if (req.isAuthenticated())
                notifier.markRead(loggedInUserData._id, displayContext._id);

              // Show metadata
              if (displayedPost.images != "") {
                console.log("Post has an image!")
                metadataImage = "https://sweet.sh/images/uploads/" + displayedPost.images[0]
              } else {
                if (displayedPost.author.imageEnabled) {
                  console.log("Post has no image, but author has an image!")
                  metadataImage = "https://sweet.sh/images/" + displayedPost.author.image
                } else {
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
              loggedIn: isLoggedIn,
              loggedInUserData: loggedInUserData,
              post: displayedPost,
              flaggedUsers: flagged,
              metadata: metadata,
              isMuted: isMuted,
              isMember: isMember,
              activePage: 'singlepost'
            })
          }
        })
    })
  })


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