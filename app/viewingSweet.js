const fs = require('fs')
const mongoose = require('mongoose')
const moment = require('moment')
const path = require('path')
const bcrypt = require('bcrypt-nodejs')
const User = require('./models/user')
const Relationship = require('./models/relationship')
const Community = require('./models/community')
const Post = require('./models/post')
const Tag = require('./models/tag')
const Image = require('./models/image')
const helper = require('./utilityFunctionsMostlyText')
const notifier = require('./notifier')
const globals = require('../config/globals')

// used on the settings page to set up push notifications
const auth = require('../config/auth')

const ObjectId = mongoose.Types.ObjectId

module.exports = function (app) {
  // Responds to get requests for images on the server. If the image is private, checks to see
  // if the user is trusted/in the community first.
  // Input: URL of an image
  // Output: Responds with either the image file or a redirect response to /404 with 404 status.
  app.get('/api/image/display/:filename', function (req, res) {
    function sendImageFile () {
      const params = {
        Bucket: 'sweet-images',
        Key: 'images/' + req.params.filename
      };
      s3.getObject(params, (err, data) => {
        if (err) {
          console.log('Image ' + req.params.filename + " doesn't exist in S3 bucket!")
          console.log(err)
          res.status('404')
          res.redirect('/404')
        } else {
          res.send(data.Body)
        }
      });

      // const imagePath = global.appRoot + '/cdn/images/' + req.params.filename
      // try {
      //   if (fs.existsSync(imagePath)) {
      //     res.sendFile(imagePath)
      //   }
      // } catch (err) {
      //   // Image file doesn't exist on server
      //   console.log('Image ' + req.params.filename + " doesn't exist on server!")
      //   console.log(err)
      //   res.status('404')
      //   res.redirect('/404')
      // }
      // res.send(url)
    }

    Image.findOne({ filename: req.params.filename }).then(image => {
      if (image) {
        if (image.privacy === 'public') {
          sendImageFile()
        } else if (image.privacy === 'private') {
          if (req.isAuthenticated()) {
            if (image.user === req.user._id.toString()) {
              sendImageFile()
            } else if (image.context === 'user') {
              Relationship.findOne({ toUser: req.user._id, value: 'trust', fromUser: image.user }).then(rel => {
                if (rel) {
                  sendImageFile()
                } else {
                  // User not trusted by image's uploader
                  console.log('User not trusted!')
                  res.status('404')
                  res.redirect('/404')
                }
              })
            } else if (image.context === 'community') {
              Community.findOne({ _id: image.community, members: req.user._id }).then(comm => {
                if (comm) {
                  sendImageFile()
                } else {
                  // User not a member of this community
                  console.log(req)
                  console.log(image)
                  console.log('User not a community member!')
                  res.status('404')
                  res.redirect('/404')
                }
              })
            }
          } else {
            // User not logged in, but has to be to see this image
            console.log('User not logged in!')
            res.status('404')
            res.redirect('/404')
          }
        }
      } else {
        // Image entry not found in database
        console.log('Image ' + image.filename + ' not in database!')
        res.status('404')
        res.redirect('/404')
      }
    })
      .catch(error => {
        // Unexpected error
        console.log('Unexpected error displaying image')
        console.log(error)
        res.status('404')
        res.redirect('/404')
      })
  })

  // Responds to get requests for '/'.
  // Input: none
  // Output: redirect to '/home' if logged in, render of the index page if logged out.
  app.get('/', function (req, res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') // HTTP 1.1.
    res.setHeader('Pragma', 'no-cache') // HTTP 1.0.
    res.setHeader('Expires', '0') // Proxies.
    if (req.isAuthenticated()) {
      res.redirect('/home')
    } else {
      User.count().then(users => {
        Community.find().sort('-lastUpdated').then(communities => {
          const publicCommunites = communities.filter(c => c.settings.visibility === 'public' && c.settings.joinType === 'open')
          publicCommunites.sort(function () {
            return 0.5 - Math.random()
          })
          publicCommunites.length = 8
          res.render('index', { layout: 'logged-out', userCount: users, communities: publicCommunites, communityCount: communities.length, sessionFlash: res.locals.sessionFlash })
        })
      })
    }
  })

  // Responds to get requests for the login page.
  // Input: flash message
  // Output: rendering of the login page with the flash message included.
  app.get('/login', function (req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('back')
    }
    res.render('login', {
      layout: 'logged-out',
      sessionFlash: res.locals.sessionFlash
    })
  })

  // Responds to get requests for the signup page.
  // Input: flash message
  // Output: rendering of the signup page with the flash message included.
  app.get('/signup', function (req, res) {
    if (req.isAuthenticated()) {
      return res.redirect('back')
    }
    res.render('signup', {
      layout: 'logged-out',
      sessionFlash: res.locals.sessionFlash
    })
  })

  // Responds to get requests for the profile of someone with a certain email. Deprecated? Is this used?
  // Input: the email
  // Output: redirect to /the username of the person with that email, unless isLoggedInOrRedirect redirects you
  app.get('/getprofile/:email', isLoggedInOrRedirect, function (req, res) {
    User.findOne({
      email: req.params.email
    }).then((user) => {
      res.redirect('/' + user.username)
    })
  })

  // Responds to get requests for the home page.
  // Input: none
  // Output: the home page, if isLoggedInOrRedirect doesn't redirect you.
  app.get('/home', isLoggedInOrRedirect, async function (req, res) {
    async function getRecommendations () {
      // console.time('getRecommendationsFunction')
      let popularCommunities = []
      const recommendedUsers = {}
      const relationshipWeights = {
        trust: 2,
        follow: 0.5
      }
      const lastFortnight = moment(new Date()).subtract(14, 'days')
      async function getRelationships (id, type) {
        const users = {}
        return Relationship.find({
          fromUser: id,
          value: type
        })
          .then((relationships) => {
            relationships.forEach(relationship => {
              if (!relationship.toUser.equals(req.user._id)) {
                const id = relationship.toUser.toString()
                const weight = relationshipWeights[relationship.value]
                if (!(id in users)) {
                  users[id] = weight
                } else {
                  users[id] += weight
                }
              }
            })
            return users
          })
      }
      // console.time('popularHashtags')
      const popularHashtags = await Tag.find()
        .limit(15)
        .sort('-lastUpdated')
        .then(tags => {
          return tags
        })
      // console.timeEnd('popularHashtags')

      // Trusted and followed users of people the user
      // trusts or follows are retrieved and placed in
      // an array with weighted scores - trust gives a
      // score of 2, following gives a score of 0.5.
      // (The scores have been arbitrarily selected.)

      // console.time('recommendedUsers')
      const primaryRelationships = await getRelationships(req.user._id, ['trust', 'follow'])
      for (const primaryUser in primaryRelationships) {
        const secondaryRelationships = await getRelationships(primaryUser, ['trust', 'follow'])
        for (const secondaryUser in secondaryRelationships) {
          const id = secondaryUser
          const weight = secondaryRelationships[secondaryUser]
          if (!(id in recommendedUsers)) {
            recommendedUsers[id] = weight
          } else {
            recommendedUsers[id] += weight
          }
        }
      }
      const recommendedUserIds = Object.keys(recommendedUsers)
      const usersKnown = Object.keys(primaryRelationships)

      // Shows all recently active communities if the user's only friend is sweetbot,
      // otherwise only recently active communities with a friend in them
      let membersQuery
      if (usersKnown.length === 1 && usersKnown[0] === '5c962bccf0b0d14286e99b68') {
        membersQuery = {}
      } else {
        membersQuery = { members: { $in: usersKnown } }
      }
      popularCommunities = await Community.find({
        $and: [
          { lastUpdated: { $gt: lastFortnight } },
          { members: { $ne: req.user._id } },
          membersQuery
        ]
      })
        .then(communities => {
          return communities
        })

      return User.findOne({
        _id: req.user._id
      })
        .then(user => {
          // console.time('userFunctions')
          popularCommunities = popularCommunities.filter(e => !user.hiddenRecommendedCommunities.includes(e._id.toString()))

          if (popularCommunities.length > 16) {
            // TODO: There are better/clearer ways to slice an array.
            popularCommunities.length = 16
          }

          const unknownUsers = recommendedUserIds
            .filter(e => !usersKnown.includes(e))
            .filter(e => !user.hiddenRecommendedUsers.includes(e))

          if (unknownUsers.length > 16) {
            unknownUsers.length = 16
          }

          return User.find({
            _id: unknownUsers
          }, { username: 1, image: 1, imageEnabled: 1, displayName: 1 })
            .then(userData => {
              userData.forEach(user => {
                user.weight = recommendedUsers[user._id.toString()]
              })
              userData.sort((a, b) => (a.weight > b.weight) ? -1 : 1)
              const results = {
                popularCommunities: popularCommunities,
                userRecommendations: userData,
                popularHashtags: popularHashtags
              }
              // console.timeEnd('userFunctions')
              // console.timeEnd('getRecommendationsFunction')
              return results
            })
        })
    }
    const recommendations = await getRecommendations()
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') // HTTP 1.1.
    res.setHeader('Pragma', 'no-cache') // HTTP 1.0.
    res.setHeader('Expires', '0') // Proxies.
    res.render('home', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'home',
      popularCommunities: (recommendations.popularCommunities.length > 0 ? recommendations.popularCommunities : false),
      userRecommendations: (recommendations.userRecommendations.length > 0 ? recommendations.userRecommendations : false),
      popularHashtags: (recommendations.popularHashtags.length > 0 ? recommendations.popularHashtags : false)
    })
  })

  // Responds to get requests for the 404 page.
  // Input: user data from req.user
  // Output: the 404 page
  app.get('/404', function (req, res) {
    if (req.isAuthenticated()) {
      res.render('404', { loggedIn: true, loggedInUserData: req.user })
    } else {
      res.render('404', { loggedIn: false })
    }
  })

  // Responds to get requests for tag pages.
  // Input: the name of the tag from the url
  // Output: the tag page rendered if it exists, redirect to the 404 page otherwise, unless isLoggedInOrRedirect redirects you
  app.get('/tag/:name', isLoggedInOrRedirect, function (req, res) {
    Tag.findOne({ name: req.params.name }).then((tag) => {
      if (tag) {
        res.render('tag', {
          name: req.params.name,
          loggedIn: true,
          loggedInUserData: req.user
        })
      } else {
        res.redirect('/404')
      }
    })
  })

  // Responds to get requests for /notifications. I think this is only used on mobile?
  // Input: none
  // Output: renders notifications page, which renders as "you're not logged in" if you're not logged in
  app.get('/notifications', function (req, res) {
    if (req.isAuthenticated()) {
      User.findOne({ _id: req.user._id }, 'notifications').then(user => {
        user.notifications.reverse()
        res.render('notifications', {
          loggedIn: true,
          loggedInUserData: req.user,
          notifications: user.notifications,
          activePage: 'notifications'
        })
      })
    } else {
      res.render('notifications', {
        loggedIn: false,
        activePage: 'notifications'
      })
    }
  })

  // Responds to get request for /settings
  // Input: none
  // Output: the settings page is rendered, unless isLoggedInOrRedirect redirects you first.
  app.get('/settings', isLoggedInOrRedirect, function (req, res) {
    res.render('settings', {
      loggedIn: true,
      loggedInUserData: req.user,
      notifierPublicKey: auth.vapidPublicKey,
      activePage: 'settings'
    })
  })

  app.get('/support', isLoggedInOrRedirect, function (req, res) {
    res.render('support', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'support'
    })
  })

  app.get('/about', function (req, res) {
    res.render('about', {
      loggedIn: req.isAuthenticated(),
      loggedInUserData: req.user,
      activePage: 'support'
    })
  })

  // Responds to post requests (?) for the users that follow the logged in user. used to build the @ mention list for tribute to auto-suggest stuff.
  // Input: none
  // Output: JSON data describing the users that follow the logged in user or a redirect from isLoggedInOrRedirect.
  app.post('/api/user/followers', isLoggedInOrRedirect, function (req, res) {
    const followedUserData = []
    Relationship.find({ fromUser: req.user._id, value: 'follow' }).populate('toUser').then((followedUsers) => {
      followedUsers.forEach(relationship => {
        const follower = {
          key: helper.escapeHTMLChars(relationship.toUser.displayName ? relationship.toUser.displayName + ' (' + '@' + relationship.toUser.username + ')' : '@' + relationship.toUser.username),
          value: relationship.toUser.username,
          image: (relationship.toUser.imageEnabled ? relationship.toUser.image : 'cake.svg')
        }
        followedUserData.push(follower)
      })
      res.setHeader('content-type', 'text/plain')
      res.end(JSON.stringify({ followers: followedUserData }))
    })
      .catch((err) => {
        console.log('Error in profileData.')
        console.log(err)
      })
  })

  // Responds to get requests for /search.
  // Input: none
  // Output: renders search page unless isLoggedInOrRedirect redirects you
  app.get('/search', isLoggedInOrRedirect, (req, res) => {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'search'
    })
  })

  // Responds to get requests for /search that include a query.
  // Input: the query
  // Output: the rendered search page, unless isLoggedInOrRedirect redirects you
  app.get('/search/:query', isLoggedInOrRedirect, (req, res) => {
    res.render('search', {
      loggedIn: true,
      loggedInUserData: req.user,
      activePage: 'search',
      query: req.params.query
    })
  })

  // Responds to requests for search queries by page.
  // Input: query, timestamp of oldest result yet loaded (in milliseconds)
  // Output: 404 response if no results, the rendered search results otherwise, unless isLoggedInOrRedirect redirects you
  app.get('/showsearch/:query/:olderthanthis', isLoggedInOrRedirect, (req, res) => {
    const resultsPerPage = 10
    const olderthan = new Date(parseInt(req.params.olderthanthis))
    const query = req.params.query.trim()

    if (!query.length) {
      res.status(404).send('Not found')
    } else {
      const queryObject = {
        $regex: query,
        $options: 'i'
      }
      Tag.find({
        name: queryObject,
        lastUpdated: { $lt: olderthan }
      }, { name: 1, posts: 1, lastUpdated: 1 })
        .sort('-lastUpdated')
        .limit(resultsPerPage) // this won't completely keep us from getting more than we need, but the point is we'll never need more results than this per page load from any collection
        .then((tagResults) => {
          User.find({
            $or: [
              { username: queryObject },
              { displayName: queryObject },
              { aboutParsed: queryObject }
            ],
            lastUpdated: { $lt: olderthan }
          }, { displayName: 1, username: 1, aboutParsed: 1, lastUpdated: 1, image: 1, imageEnabled: 1 })
            .sort('-lastUpdated')
            .limit(resultsPerPage)
            .then((userResults) => {
              Community.find({
                $or: [
                  { name: queryObject },
                  { descriptionParsed: queryObject }
                ],
                lastUpdated: { $lt: olderthan }
              }, { lastUpdated: 1, name: 1, descriptionParsed: 1, membersCount: 1, image: 1, slug: 1, imageEnabled: 1 })
                .sort('-lastUpdated')
                .limit(resultsPerPage)
                .then(async communityResults => {
                  const flaggedByMe = (await Relationship.find({ fromUser: req.user._id, value: 'flag' }, { toUser: 1 })).map(v => v.toUser)
                  const myTrustedUsers = (await Relationship.find({ fromUser: req.user._id, value: 'trust' }, { toUser: 1 })).map(v => v.toUser)
                  const flaggedByTrusted = (await Relationship.find({ from: { $in: myTrustedUsers }, value: 'flag' }, { toUser: 1 })).map(v => v.toUser)
                  const allFlaggedUsers = new Set((flaggedByMe.concat(flaggedByTrusted)).map(v => v.toString()))
                  userResults = userResults.map(u => { return { ...u.toObject(), ...{ type: 'user', flagged: allFlaggedUsers.has(u._id.toString()) } } })
                  communityResults = communityResults.map(c => { return { ...c.toObject(), ...{ type: 'community' } } })
                  tagResults = tagResults.map(t => { return { ...t.toObject(), ...{ type: 'tag', posts: t.posts.length } } })
                  const combinedResults = (userResults.concat(communityResults, tagResults))
                  if (!combinedResults.length) {
                    res.sendStatus(404)
                  } else {
                    const results = (combinedResults.sort((a, b) => b.lastUpdated - a.lastUpdated)).slice(0, resultsPerPage)
                    const oldestTimestamp = results[results.length - 1].lastUpdated.getTime()
                    res.json({ results, oldestTimestamp })
                  }
                })
            })
        })
        .catch((err) => {
          console.warn(`Error in search: ${err}`)
        })
    }
  })

  app.get('/drafts/:olderthanthis', isLoggedInOrRedirect, function (req, res) {
    Post.find({ type: 'draft', author: req.user._id, timestamp: { $lt: new Date(parseInt(req.params.olderthanthis)) } })
      .sort('-timestamp').limit(10).populate('author').then(async posts => {
        if (!posts.length) {
          res.sendStatus(404)
        } else {
          for (const post of posts) {
            await keepCachedHTMLUpToDate(post)
            post.internalPostHTML = post.cachedHTML.fullContentHTML
            post.commentsDisabled = true
            post.isYourPost = true
            const momentTimestamp = moment(post.timestamp)
            if (momentTimestamp.isSame(moment(), 'd')) {
              post.parsedTimestamp = momentTimestamp.fromNow()
            } else if (momentTimestamp.isSame(moment(), 'y')) {
              post.parsedTimestamp = momentTimestamp.format('D MMM')
            } else {
              post.parsedTimestamp = momentTimestamp.format('D MMM YYYY')
            }
            post.fullTimestamp = momentTimestamp.calendar()
          }
          res.render('partials/posts_v2', {
            layout: false,
            loggedIn: true,
            loggedInUserData: req.user,
            posts: posts,
            context: 'drafts',
            canReply: false,
            isMuted: false,
            oldesttimestamp: posts[posts.length - 1].timestamp.getTime() + ''
          })
        }
      })
  })

  // this function checks if there are some newer posts than the given timestamp for the user's home feed. it duplicates some query logic from /showposts to do this.
  app.get('/heyaretherenewposts/:newerthanthis', isLoggedInOrRedirect, async function (req, res) {
    const myFollowedUserIds = ((await Relationship.find({ fromUser: req.user._id, value: 'follow' })).map(v => v.toUser))
    const myMutedUserIds = ((await Relationship.find({ fromUser: req.user._id, value: 'mute' })).map(v => v.toUser))
    const usersWhoTrustMe = ((await Relationship.find({ toUser: req.user._id, value: 'trust' })).map(v => v.fromUser))
    const query = {
      $and: [{
        $or: [
          { $and: [{ author: { $in: myFollowedUserIds } }, { $or: [{ type: { $ne: 'community' } }, { community: { $in: req.user.communities } }] }] }, { community: { $in: req.user.communities } }
        ]
      },
      { $or: [{ privacy: 'public' }, { author: { $in: usersWhoTrustMe } }] },
      { author: { $not: { $in: myMutedUserIds } } },
      { type: { $ne: 'draft' } }
      ]
    }
    const sortMethod = req.user.settings.homeTagTimelineSorting === 'fluid' ? 'lastUpdated' : 'timestamp'
    const newerThanDate = new Date(parseInt(req.params.newerthanthis))
    const newerThanQuery = {}
    newerThanQuery[sortMethod] = { $gt: newerThanDate }
    query.$and.push(newerThanQuery)
    Post.find(query).then(async posts => {
      // if we're sorting by last updated, comments can prompt posts to
      // look new, but we only want those with a comment that's newer than
      // our newerthan timesamp AND wasn't left by the logged in user, who
      // knows about their own comments. so, we search recursively for that.
      function findNewComment (postOrComment) {
        if (postOrComment.timestamp > newerThanDate && !postOrComment.author.equals(req.user._id)) {
          return true
        }
        if (postOrComment.replies && postOrComment.replies.length) {
          for (const r of postOrComment.replies) {
            if (findNewComment(r)) {
              return true
            }
          }
        } else if (postOrComment.comments && postOrComment.comments.length) {
          for (const c of postOrComment.comments) {
            if (findNewComment(c)) {
              return true
            }
          }
        }
        return false
      }

      res.setHeader('content-type', 'text/plain')

      for (const post of posts) {
        const postCommunity = post.community ? (await Community.findById(post.community)) : undefined
        if ((sortMethod === 'lastUpdated' && findNewComment(post)) && (post.type !== 'community' || !postCommunity.mutedMembers.includes(post.author))) {
          res.send('yeah')
          return
        }
      }
      res.send('no i guess not')
    })
  })

  // Responds to a get response for a specific post.
  // Inputs: the username of the user and the string of random letters and numbers that identifies the post (that's how post urls work)
  // Outputs: showposts handles it!
  app.get('/:username/:posturl', function (req, res, next) {
    if (req.params.username !== 'images') { // a terrible hack to stop requests for images (/images/[image filename] fits into this route's format) from being sent to showposts
      req.url = req.path = '/showposts/single/' + req.params.posturl + '/1'
      req.singlepostUsername = req.params.username // slightly sus way to pass this info to showposts
      next('route')
    }
  })

  app.get('/tag/:tagname', function (req, res, next) {
    req.url = req.path = '/showposts/tag/' + req.params.tagname + '/1'
    next('route')
  })

  // this function is called per post in the post displaying function below to keep the cached html for image galleries and embeds up to date
  // in the post and all of its comments.
  async function keepCachedHTMLUpToDate (post) {
    // only runs if cached html is out of date
    async function updateHTMLRecursive (displayContext) {
      const html = await helper.renderHTMLContent(displayContext)
      if (displayContext.cachedHTML) {
        displayContext.cachedHTML.fullContentHTML = html
      } else {
        displayContext.cachedHTML = { fullContentHTML: html }
      }
      if (displayContext.comments) {
        for (const comment of displayContext.comments) {
          await updateHTMLRecursive(comment)
        }
      } else if (displayContext.replies) {
        for (const reply of displayContext.replies) {
          await updateHTMLRecursive(reply)
        }
      }
    }

    let galleryTemplateMTime
    let embedTemplateMTime
    const galleryTemplatePath = './views/partials/imagegallery.handlebars'
    const embedsTemplatePath = './views/partials/embed.handlebars'

    // non-blocking way to retrieve the last modified times for these templates
    // so that we can check if the cached post html is up to data
    const mTimes = new Promise(function (resolve, reject) {
      fs.stat(galleryTemplatePath, (err, stats) => {
        if (err) {
          console.err(
            'could not get last modified time for image gallery template, post ' +
            'html will not be updated'
          )
          reject(err)
        } else {
          galleryTemplateMTime = stats.mtime
          if (embedTemplateMTime) {
            resolve()
          }
        }
      })
      fs.stat(embedsTemplatePath, (err, stats) => {
        if (err) {
          console.err(
            'could not get last modified time for embed/link preview template, ' +
            'post html will not be updated'
          )
          reject(err)
        } else {
          embedTemplateMTime = stats.mtime
          if (galleryTemplateMTime) {
            resolve()
          }
        }
      })
    })

    await mTimes.then(async function () {
      if ((!post.cachedHTML.imageGalleryMTime || post.cachedHTML.imageGalleryMTime < galleryTemplateMTime) || (!post.cachedHTML.embedsMTime || post.cachedHTML.embedsMTime < embedTemplateMTime)) {
        await updateHTMLRecursive(post)
        post.cachedHTML.imageGalleryMTime = galleryTemplateMTime
        post.cachedHTML.embedsMTime = embedTemplateMTime
        await post.save()
      }
    })
  }

  /*
    Responds to requests for posts for feeds. API method, used within the public pages.

    Inputs:

    context is one of:
     - community (posts on a community's page)
     - home (posts on the home page)
     - user (posts on a user's profile page)
     - single (a single post)

    identifier identifies one of
     - user
     - community
     - post

    I don't believe it's used when the context is home?  It appears to be the url of the
    image of the logged in user in that case. (??????????????????)

    olderthanthis means we want posts older than this timestamp (milliseconds).

    Output: the rendered HTML of the posts, unless it can't find any posts, in which
    case it returns a 404 error.
    */
  app.get('/showposts/:context/:identifier/:olderthanthis', async function (req, res) {
    let loggedInUserData = {}
    if (req.isAuthenticated()) {
      loggedInUserData = req.user
    } else {
      // logged out users can't get any posts from pages of non-completely-public users and communities
      if (req.params.context === 'user' && (await User.findById(req.params.identifier)).settings.profileVisibility !== 'profileAndPosts') {
        res.sendStatus(404)
        return
      } else if (req.params.context === 'community' && (await Community.findById(req.params.identifier)).settings.visibility !== 'public') {
        res.sendStatus(404)
        return
      }
    }

    const postsPerPage = 10
    const olderthanthis = new Date(parseInt(req.params.olderthanthis))
    let isMuted
    let flagged
    let myMutedUserEmails
    let myFollowedUserIds
    let myCommunities
    let usersWhoTrustMeEmails

    // const myFlaggedUserEmails
    // const myTrustedUserEmails
    // const usersFlaggedByMyTrustedUsers

    // build some user lists. only a thing if the user is logged in.
    // todo: instead of pulling them from the relationships collection, at least the first 4 could be arrays of references to other users in the user document, that would speed things up
    if (req.isAuthenticated()) {
      myFollowedUserIds = ((await Relationship.find({ from: loggedInUserData.email, value: 'follow' })).map(v => v.toUser)).concat([req.user._id])
      const myFlaggedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: 'flag' })).map(v => v.to))
      myMutedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: 'mute' })).map(v => v.to))
      const myTrustedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: 'trust' })).map(v => v.to))
      const usersFlaggedByMyTrustedUsers = ((await Relationship.find({ from: { $in: myTrustedUserEmails }, value: 'flag' })).map(v => v.to))
      usersWhoTrustMeEmails = ((await Relationship.find({ to: loggedInUserData.email, value: 'trust' })).map(v => v.from)).concat([req.user.email])
      myCommunities = req.user.communities
      if (req.params.context === 'community' && req.isAuthenticated()) {
        isMuted = (await Community.findById(req.params.identifier)).mutedMembers.some(v => v.equals(req.user._id))
      } else {
        isMuted = false
      }
      flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email)
    }

    const today = moment().clone().startOf('day')
    const thisyear = moment().clone().startOf('year')

    // construct the query that will retrieve the posts we want. basically just coming up with criteria to pass to Post.find. also, sortMethod
    // is set according to the relevant user setting if they're logged in or to a default way at the bottom of this part if they're not.

    let matchPosts
    let sortMethod
    let thisComm
    if (req.params.context === 'home') {
      // on the home page, we're looking for posts (and boosts) created by users we follow as well as posts in communities that we're in.
      // we're assuming the user is logged in if this request is being made (it's only made by code on a page that only loads if the user is logged in.)
      matchPosts = {
        $or: [{
          author: {
            $in: myFollowedUserIds
          }
        },
        {
          type: 'community',
          community: {
            $in: myCommunities
          }
        }
        ],
        type: { $ne: 'draft' }
      }
      sortMethod = req.user.settings.homeTagTimelineSorting === 'fluid' ? '-lastUpdated' : '-timestamp'
    } else if (req.params.context === 'user') {
      // if we're on a user's page, obviously we want their posts:
      matchPosts = {
        author: req.params.identifier,
        type: { $ne: 'draft' }
      }
      // but we also only want posts if they're non-community or they come from a community that we belong to:
      if (req.isAuthenticated()) {
        matchPosts.$or = [{
          community: {
            $exists: false
          }
        }, {
          community: {
            $in: myCommunities
          }
        }]
        sortMethod = req.user.settings.userTimelineSorting === 'fluid' ? '-lastUpdated' : '-timestamp'
      } else {
        // logged out users shouldn't see any community posts on user profile pages
        matchPosts.community = {
          $exists: false
        }
      }
    } else if (req.params.context === 'community') {
      thisComm = await Community.findById(req.params.identifier)
      // we want posts from the community, but only if it's public or we belong to it:
      if (thisComm.settings.visibility === 'public' || myCommunities.some(v => v.toString() === req.params.identifier)) {
        matchPosts = {
          community: req.params.identifier
        }
      } else {
        // if we're not in the community and it's not public, there are no posts we're allowed to view!
        matchPosts = undefined
      }
      if (req.isAuthenticated()) {
        sortMethod = req.user.settings.communityTimelineSorting === 'fluid' ? '-lastUpdated' : '-timestamp'
      }
    } else if (req.params.context === 'tag') {
      const getTag = () => {
        return Tag.findOne({ name: req.params.identifier })
          .then((tag) => {
            return { _id: { $in: tag.posts }, type: { $ne: 'draft' } }
          })
      }
      matchPosts = await getTag()
      sortMethod = req.user.settings.homeTagTimelineSorting === 'fluid' ? '-lastUpdated' : '-timestamp'
    } else if (req.params.context === 'single') {
      const author = (await User.findOne({ username: req.singlepostUsername }, { _id: 1 }))
      matchPosts = {
        author: author ? author._id : undefined, // won't find anything if the author corresponding to the username couldn't be found
        url: req.params.identifier,
        type: { $ne: 'draft' }
      }
      sortMethod = '-lastUpdated' // this shouldn't matter oh well
    }

    if (!req.isAuthenticated()) {
      matchPosts.privacy = 'public'
      sortMethod = '-lastUpdated'
    }

    if (req.params.context !== 'single') {
      // in feeds, we only want posts older than ("less than") the parameter sent in, with age being judged by the currently active sorting method.
      matchPosts[sortMethod.substring(1, sortMethod.length)] = { $lt: olderthanthis }
    }

    const query = Post
      .find(matchPosts)
      .sort(sortMethod)
      .limit(postsPerPage)
    // these populate commands retrieve the complete data for these things that are referenced in the post documents
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

    // so this will be called when the query retrieves the posts we want
    const posts = await query

    if (!posts || !posts.length) {
      res.status(404).render('singlepost', { // The 404 is required so InfiniteScroll.js stops loading the feed
        canDisplay: false,
        loggedIn: req.isAuthenticated(),
        loggedInUserData: loggedInUserData,
        post: null,
        metadata: {},
        activePage: 'singlepost'
      })
      return
    }

    let displayedPost
    let oldesttimestamp

    if (req.params.context !== 'single') {
      // this gets the timestamp of the last post, this tells the browser to ask for posts older than this next time. used in feeds, not with single posts
      oldesttimestamp = '' + posts[posts.length - 1][sortMethod.substring(1, sortMethod.length)].getTime()
    }

    const displayedPosts = [] // populated by the for loop below

    for (const post of posts) {
      // figure out if there is a newer instance of the post we're looking at. if it's an original post, check the boosts from
      // the context's relevant users; if it's a boost, check the original post if we're in fluid mode to see if lastUpdated is more
      // recent (meaning the original was bumped up from recieving a comment) and then for both fluid and chronological we have to check
      // to see if there is a more recent boost.
      if (req.params.context !== 'community' && req.params.context !== 'single') {
        let isThereNewerInstance = false
        const whosePostsCount = req.params.context === 'user' ? [new ObjectId(req.params.identifier)] : myFollowedUserIds
        if (post.type === 'original') {
          for (const boost of post.boostsV2) {
            if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => boost.booster.equals(f))) {
              isThereNewerInstance = true
            }
          }
        } else if (post.type === 'boost') {
          if (post.boostTarget !== null) {
            if (sortMethod === '-lastUpdated') {
              if (post.boostTarget.lastUpdated.getTime() > post.timestamp.getTime()) {
                isThereNewerInstance = true
              }
            }
            for (const boost of post.boostTarget.boostsV2) {
              if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => boost.booster.equals(f))) {
                isThereNewerInstance = true
              }
            }
          } else {
            console.log('Error fetching boostTarget of boost')
            isThereNewerInstance = true
          }
        }

        if (isThereNewerInstance) {
          continue
        }
      }

      let canDisplay = false
      if (req.isAuthenticated()) {
        // logged in users can't see private posts by users who don't trust them or community posts by muted members
        if ((post.privacy === 'private' && usersWhoTrustMeEmails.includes(post.authorEmail)) || post.privacy === 'public') {
          canDisplay = true
        }
        if (post.type === 'community') {
          // we don't have to check if the user is in the community before displaying posts to them if we're on the community's page, or if it's a single post page and: the community is public or the user wrote the post
          // in other words, we do have to check if the user is in the community if those things aren't true, hence the !
          if (!(req.params.context === 'community' || (req.params.context === 'single' && (post.author.equals(req.user._id) || post.community.settings.visibility === 'public')))) {
            if (myCommunities.some(m => m.equals(post.community._id))) {
              canDisplay = true
            } else {
              canDisplay = false
            }
          }
          // Hide muted community members
          const mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString())
          if (mutedMemberIds.includes(post.author._id.toString())) {
            canDisplay = false
          }
        }
      } else {
        // for logged out users, we already eliminated private posts by specifying query.privacy =  'public',
        // so we just have to hide posts boosted from non-publicly-visible accounts and posts from private communities that
        // the user whose profile page we are on wrote (if this is an issue, we're on a profile page, bc non-public
        // community pages are hidden from logged-out users by a return at the very, very beginning of this function)
        if (post.author.settings.profileVisibility === 'profileAndPosts') {
          // User has allowed non-logged-in users to see their posts
          if (post.community) {
            if (post.community.settings.visibility === 'public') {
              // Public community, can display post
              const mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString())
              if (mutedMemberIds.includes(post.author._id.toString())) {
                canDisplay = false
              } else {
                canDisplay = true
              }
            }
          } else {
            // Not a community post, can display
            canDisplay = true
          }
        } else if (req.params.context === 'community' && thisComm.settings.visibility === 'public') {
          // also posts in publicly visible communities can be shown, period. i'm 99% sure that posts from private communities won't even
          // be fetched for logged out users because of the way the matchPosts query is constructed above but just in case i'm checking it
          // again in the above if statement
          canDisplay = true
        }
      }

      // As a final hurrah, just hide all posts and boosts made by users you've muted
      if (req.isAuthenticated() && myMutedUserEmails.includes(post.authorEmail)) {
        canDisplay = false
      }

      if (!canDisplay) {
        continue
      }

      let displayContext = post
      if (post.type === 'boost') {
        displayContext = post.boostTarget
        displayContext.author = await User.findById(displayContext.author)
        for (const boost of displayContext.boostsV2) {
          boost.booster = await User.findById(boost.booster)
        }
      }

      await keepCachedHTMLUpToDate(displayContext)

      let parsedTimestamp
      if (moment(displayContext.timestamp).isSame(today, 'd')) {
        parsedTimestamp = moment(displayContext.timestamp).fromNow()
      } else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
        parsedTimestamp = moment(displayContext.timestamp).format('D MMM')
      } else {
        parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY')
      }

      let isYourPost
      if (req.isAuthenticated()) {
        // Used to check if you can delete a post
        isYourPost = displayContext.author._id.equals(req.user._id)
      }
      // generate some arrays containing usernames that will be put in "boosted by" labels
      let boostsForHeader
      let youBoosted
      const followedBoosters = []
      const notFollowingBoosters = []
      if (req.isAuthenticated() && (req.params.context !== 'community')) {
        youBoosted = false
        if (displayContext.boostsV2.length > 0) {
          displayContext.boostsV2.forEach((v, i, a) => {
            if (!(v.timestamp.getTime() === displayContext.timestamp.getTime())) { // do not include implicit boost
              if (v.booster._id.equals(req.user._id)) {
                followedBoosters.push('you')
                youBoosted = true
              } else {
                if (myFollowedUserIds.some(following => { if (following) { return following.equals(v.booster._id) } })) {
                  followedBoosters.push(v.booster.username)
                } else {
                  notFollowingBoosters.push(v.booster.username)
                }
              }
            }
          })
        }
        if (req.params.context === 'user' && !displayContext.author._id.equals(post.author._id)) {
          boostsForHeader = [post.author.username]
        } else {
          boostsForHeader = followedBoosters.slice(0, 3)
        }
      } else {
        // logged out users will see boosts only on user profile pages and they only need to know that that user boosted the post. should be obvious anyway but, whatevs
        if (!req.isAuthenticated() && req.params.context === 'user') {
          if (displayContext.author._id.toString() !== req.params.identifier) {
            boostsForHeader = [(await (User.findById(req.params.identifier))).username]
          }
        } else if (req.isAuthenticated() && req.params.context === 'user') {
          if (displayContext.author._id.toString() !== req.params.identifier) {
            boostsForHeader = [(await (User.findById(req.params.identifier))).username]
          }
        }
      }

      displayedPost = Object.assign(displayContext, {
        deleteid: displayContext._id,
        parsedTimestamp: parsedTimestamp,
        timestampMs: displayContext.timestamp.getTime(),
        editedTimestampMs: displayContext.lastEdited ? displayContext.lastEdited.getTime() : '',
        internalPostHTML: displayContext.cachedHTML.fullContentHTML,
        headerBoosters: boostsForHeader,
        recentlyCommented: false, // This gets set below
        lastCommentAuthor: '' // As does this
      })

      // these are only a thing for logged in users
      if (req.isAuthenticated()) {
        displayedPost.followedBoosters = followedBoosters
        displayedPost.otherBoosters = notFollowingBoosters
        displayedPost.isYourPost = isYourPost
        displayedPost.youBoosted = youBoosted
      }

      // get timestamps and full image urls for each comment
      let latestTimestamp = 0
      const sixHoursAgo = moment(new Date()).subtract(6, 'hours')
      const threeHoursAgo = moment(new Date()).subtract(3, 'hours')

      const parseComments = (element, level) => {
        if (!level) {
          level = 1
        }
        element.forEach(async (comment) => {
          comment.canDisplay = true
          comment.muted = false
          // I'm not sure why, but boosts in the home feed don't display
          // comment authors below the top level - this fixes it, but
          // it's kind of a hack - I can't work out what's going on
          if (!comment.author.username) {
            comment.author = await User.findById(comment.author)
          }
          if (req.isAuthenticated() && myMutedUserEmails.includes(comment.author.email)) {
            comment.muted = true
            comment.canDisplay = false
          }
          if (comment.deleted) {
            comment.canDisplay = false
          }
          const momentifiedTimestamp = moment(comment.timestamp)
          if (momentifiedTimestamp.isSame(today, 'd')) {
            comment.parsedTimestamp = momentifiedTimestamp.fromNow()
          } else if (momentifiedTimestamp.isSame(thisyear, 'y')) {
            comment.parsedTimestamp = momentifiedTimestamp.format('D MMM')
          } else {
            comment.parsedTimestamp = momentifiedTimestamp.format('D MMM YYYY')
          }
          if (comment.timestamp > latestTimestamp) {
            latestTimestamp = comment.timestamp
            displayedPost.lastCommentAuthor = comment.author
          }
          // Only pulse comments from people who aren't you
          if (req.isAuthenticated() && momentifiedTimestamp.isAfter(threeHoursAgo) && !comment.author._id.equals(req.user._id)) {
            comment.isRecent = true
          }
          for (let i = 0; i < comment.images.length; i++) {
            comment.images[i] = '/api/image/display/' + comment.images[i]
          }
          // If the comment's author is logged in, or the displayContext's author is logged in
          if (((comment.author._id.equals(loggedInUserData._id)) || (displayContext.author._id.equals(loggedInUserData._id))) && !comment.deleted) {
            comment.canDelete = true
          }
          if (level < globals.maximumCommentDepth) {
            comment.canReply = true
          }
          comment.level = level
          if (comment.replies) {
            parseComments(comment.replies, level + 1)
          }
        })
        if (moment(latestTimestamp).isAfter(sixHoursAgo)) {
          displayedPost.recentlyCommented = true
        } else {
          displayedPost.recentlyCommented = false
        }
      }
      parseComments(displayedPost.comments)

      if (req.isAuthenticated() && req.params.context === 'single') {
        // Mark associated notifications read if post is visible
        notifier.markRead(loggedInUserData._id, displayContext._id)
      }

      // wow, finally.
      displayedPosts.push(displayedPost)
    }

    if (!displayedPosts.length) {
      res.status(404).render('singlepost', { // The 404 is required so InfiniteScroll.js stops loading the feed
        canDisplay: false,
        loggedIn: req.isAuthenticated(),
        loggedInUserData: loggedInUserData,
        post: null,
        metadata: {},
        activePage: 'singlepost'
      })
      return
    }

    let metadata = {}
    if (req.params.context === 'single') {
      // For single posts, we are going to render a different template so that we can include its metadata in the HTML "head" section
      // We can only get the post metadata if the post array is filled (and it'll only be filled
      // if the post was able to be displayed, so this checks to see if we should display
      // our vague error message on the frontend)
      displayedPost = displayedPosts[0]
      let canDisplay
      let isMember = false
      if (typeof displayedPost !== 'undefined') {
        canDisplay = true
        let imageCont
        let metadataImage
        if (displayedPost.inlineElements && displayedPost.inlineElements.length && (imageCont = (displayedPost.inlineElements.find(v => v.type === 'image(s)')))) {
          metadataImage = 'https://sweet.sh/api/image/display/' + imageCont.images[0]
        } else if (displayedPost.images && displayedPost.images.length) {
          metadataImage = ((!displayedPost.imageVersion || displayedPost.imageVersion < 2) ? 'https://sweet.sh/images/uploads/' : 'https://sweet.sh/api/image/display/') + displayedPost.images[0]
        } else if (displayedPost.author.imageEnabled) {
          metadataImage = 'https://sweet.sh/images/' + displayedPost.author.image
        } else {
          metadataImage = 'https://sweet.sh/images/cake.svg'
        }
        let firstLine = /<p>(.+?)<\/p>|<ul><li>(.+?)<\/li>|<blockquote>(.+?)<\/blockquote>/.exec(displayedPost.internalPostHTML)
        if (firstLine && firstLine[1]) {
          firstLine = firstLine[1].replace(/<.*?>/g, '').substring(0, 100) + (firstLine[1].length > 100 ? '...' : '')
        } else {
          firstLine = "Just another ol' good post on sweet"
        }
        metadata = {
          title: '@' + displayedPost.author.username + ' on sweet',
          description: firstLine,
          image: metadataImage,
          url: 'https://sweet.sh/' + displayedPost.author.username + '/' + displayedPost.url
        }
        isMember = (
          displayedPost.community &&
          req.isAuthenticated() &&
          displayedPost.community.members.some(m => m.equals(req.user._id))
        )
      } else {
        canDisplay = false
        // We add some dummy metadata for posts which error
        metadata = {
          title: 'sweet • a social network',
          description: '',
          image: 'https://sweet.sh/images/cake.svg',
          url: 'https://sweet.sh/'
        }
      }
      res.render('singlepost', {
        canDisplay: canDisplay,
        loggedIn: req.isAuthenticated(),
        loggedInUserData: loggedInUserData,
        posts: [displayedPost], // This is so it loads properly inside the posts_v2 partial
        flaggedUsers: flagged,
        metadata: metadata,
        isMuted: isMuted,
        isMember: isMember,
        canReply: !(displayedPost.type === 'community' && !isMember),
        activePage: 'singlepost'
      })
    } else {
      const getCanReply = () => {
        if (req.isAuthenticated()) {
          switch (req.params.context) {
            // These contexts already hide posts from communites you're not a member of
            case 'home':
            case 'tag':
            case 'user':
              return true
            case 'community':
            default:
              return false
          }
        }
        return false
      }
      res.render('partials/posts_v2', {
        layout: false,
        loggedIn: req.isAuthenticated(),
        isMuted: isMuted,
        loggedInUserData: loggedInUserData,
        posts: displayedPosts,
        flaggedUsers: flagged,
        context: req.params.context,
        canReply: getCanReply(),
        oldesttimestamp: oldesttimestamp
      })
    }
  })

  // Responds to get requests for a user's profile page.
  // Inputs: username is the user's username.
  // Outputs: a 404 if the user isn't found
  app.get('/:username', async function (req, res) {
    function c (e) {
      console.error('error in query in /:username user list builders')
      console.error(e)
    }

    const profileData = await User.findOne({ username: req.params.username }).catch(err => {
      console.error('error in username query in /:username')
      console.error(err)
    })
    if (!profileData) {
      console.log('user ' + req.params.username + ' not found')
      res.status(404).redirect('/404')
      return
    }
    const communitiesData = await Community.find({ members: profileData._id }).catch(c) // given to the renderer at the end
    const followersArray = (await Relationship.find({ to: profileData.email, value: 'follow' }, { from: 1 }).catch(c)).map(v => v.from) // only used for the below
    const followers = await User.find({ email: { $in: followersArray } }).catch(c) // passed directly to the renderer
    const theirFollowedUserEmails = (await Relationship.find({ from: profileData.email, value: 'follow' }, { to: 1 }).catch(c)).map(v => v.to) // used in the below and to see if the profile user follows you
    const theirFollowedUserData = await User.find({ email: { $in: theirFollowedUserEmails } }) // passed directly to the renderer
    const usersWhoTrustThemArray = (await Relationship.find({ to: profileData.email, value: 'trust' }).catch(c)).map(v => v.from) // only used for the below
    const usersWhoTrustThem = await User.find({ email: { $in: usersWhoTrustThemArray } }).catch(c) // passed directly to the renderer
    const theirTrustedUserEmails = (await Relationship.find({ from: profileData.email, value: 'trust' }).catch(c)).map(v => v.to) // used to see if the profile user trusts the logged in user (if not isOwnProfile) and the below
    const theirTrustedUserData = await User.find({ email: { $in: theirTrustedUserEmails } }).catch(c) // given directly to the renderer

    let userFollowsYou = false
    let userTrustsYou = false
    let isOwnProfile
    let flagsFromTrustedUsers
    let flagged
    let trusted
    let followed
    let muted
    let myFlaggedUserData
    if (req.isAuthenticated()) {
      // Is this the logged in user's own profile?
      if (profileData.email === req.user.email) {
        isOwnProfile = true
        userTrustsYou = false
        userFollowsYou = false
        trusted = false
        followed = false
        muted = false
        flagged = false
        flagsFromTrustedUsers = 0
        const myFlaggedUserEmails = (await Relationship.find({ from: req.user.email, value: 'flag' }).catch(c)).map(v => v.to) // only used in the below line
        myFlaggedUserData = await User.find({ email: { $in: myFlaggedUserEmails } }).catch(c) // passed directly to the renderer, but only actually used if isOwnProfile, so we're only actually defining it in here
      } else {
        isOwnProfile = false

        const myTrustedUserEmails = (await Relationship.find({ from: req.user.email, value: 'trust' }).catch(c)).map(v => v.to) // used for flag checking and to see if the logged in user trusts this user

        // Check if profile user follows and/or trusts logged in user
        userTrustsYou = theirTrustedUserEmails.includes(req.user.email) // not sure if these includes are faster than an indexed query of the relationships collection would be
        userFollowsYou = theirFollowedUserEmails.includes(req.user.email)

        // Check if logged in user follows and/or trusts and/or has muted profile user
        trusted = myTrustedUserEmails.includes(profileData.email)
        followed = !!(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: 'follow' }).catch(c))
        muted = !!(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: 'mute' }).catch(c))

        const flagsOnUser = await Relationship.find({ to: profileData.email, value: 'flag' }).catch(c)
        flagsFromTrustedUsers = 0
        flagged = false
        for (const flag of flagsOnUser) {
          // Check if logged in user has flagged profile user
          if (flag.from === req.user.email) {
            flagged = true
          }
          // Check if any of the logged in user's trusted users have flagged profile user
          if (myTrustedUserEmails.includes(flag.from)) {
            flagsFromTrustedUsers++
          }
        }
      }
    } else {
      isOwnProfile = false
      flagsFromTrustedUsers = 0
      trusted = false
      followed = false
      flagged = false
    }
    res.render('user', {
      loggedIn: req.isAuthenticated(),
      isOwnProfile: isOwnProfile,
      loggedInUserData: req.user,
      profileData: profileData,
      trusted: trusted,
      flagged: flagged,
      muted: muted,
      followed: followed,
      followersData: followers,
      usersWhoTrustThemData: usersWhoTrustThem,
      userFollowsYou: userFollowsYou,
      userTrustsYou: userTrustsYou,
      trustedUserData: theirTrustedUserData,
      followedUserData: theirFollowedUserData,
      communitiesData: communitiesData,
      flaggedUserData: myFlaggedUserData,
      flagsFromTrustedUsers: flagsFromTrustedUsers,
      activePage: profileData.username,
      visibleSidebarArray: ['profileOnly', 'profileAndPosts']
    })
  })

  // Responds to post request from the browser informing us that the user has seen the comments of some post by setting notifications about those comments
  // to seen=true
  // Input:
  app.post('/api/notification/update/:id', isLoggedInOrRedirect, function (req, res) {
    User.findOneAndUpdate({
      _id: req.user._id,
      'notifications._id': req.params.id
    }, {
      $set: {
        'notifications.$.seen': true
      }
    },
    (_, doc) => res.sendStatus(200)
    )
  })

  app.post('/api/notification/update-by-subject/:subjectid', isLoggedInOrRedirect, function (req, res) {
    User.findOne({
      _id: req.user._id
    })
      .then(user => {
        user.notifications.forEach(notification => {
          if (notification.subjectId === req.params.subjectid) {
            notification.seen = true
          }
        })
        user.save()
          .then(response => {
            res.sendStatus(200)
          })
      })
  })

  app.get('/api/notification/display', function (req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
        _id: req.user._id
      }, 'notifications')
        .then(user => {
          user.notifications.reverse()
          res.render('partials/notifications', {
            layout: false,
            loggedIn: true,
            loggedInUserData: req.user,
            notifications: user.notifications
          })
        })
    } else {
      res.render('partials/notifications', {
        layout: false,
        loggedIn: false
      })
    }
  })

  app.post('/api/newpostform/linkpreviewdata', async function (req, res) {
    try {
      const metadata = await helper.getLinkMetadata(req.body.url)
      res.setHeader('content-type', 'text/plain')
      res.send(JSON.stringify(metadata))
    } catch (err) {
      console.log('could not get link preview information for url ' + req.body.url)
      console.log(err)
      res.send('invalid url i guess')
    }
  })

  app.post('/admin/reporterror', function (req, res) {
    fs.appendFile('clientsideerrors.txt', req.body.errorstring + '\n\n', (error) => {
      if (error) {
        console.error(error)
      }
    })
    res.status(200).send('thank')
  })

  app.get('/admin/errorlogs/:password', function (req, res) {
    const passwordHash = '$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq'
    if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash) && fs.existsSync(path.resolve(global.appRoot, 'clientsideerrors.txt'))) {
      res.status(200).sendFile(path.resolve(global.appRoot, 'clientsideerrors.txt'))
    }
  })

  app.get('/admin/emaillogs/:password', function (req, res) {
    const passwordHash = '$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq'
    if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash) && fs.existsSync(path.resolve(global.appRoot, 'emailLog.txt'))) {
      res.status(200).sendFile(path.resolve(global.appRoot, 'emailLog.txt'))
    }
  })
}

// For post and get requests where the browser will handle the response automatically and so redirects will work
function isLoggedInOrRedirect (req, res, next) {
  if (req.isAuthenticated()) {
    // A potentially expensive way to update a user's last logged in timestamp (currently only relevant to sorting search results)
    const currentTime = new Date()
    if ((currentTime - req.user.lastUpdated) > 3600000) { // If the timestamp is older than an hour
      User.findOne({
        _id: req.user._id
      })
        .then(user => {
          user.lastUpdated = currentTime
          user.save()
        })
    }
    return next()
  }
  res.redirect('/')
}
