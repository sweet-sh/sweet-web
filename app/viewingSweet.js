const moment = require('moment');
const sanitizeHtml = require('sanitize-html');
const notifier = require('./notifier.js');
const sanitize = require('mongo-sanitize');
const fs = require('fs');

var auth = require('../config/auth.js'); //used on the settings page to set up push notifications

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


module.exports = function(app) {

    //Responds to get requests for images on the server. If the image is private, checks to see
    //if the user is trusted/in the community first.
    //Input: URL of an image
    //Output: Responds with either the image file or a redirect response to /404 with 404 status.
    app.get('/api/image/display/:filename', function(req, res) {

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

        Image.findOne({ filename: req.params.filename }).then(image => {
                if (image) {
                    if (image.privacy === "public") {
                        sendImageFile()
                    } else if (image.privacy === "private") {
                        if (req.isAuthenticated()) {
                            if (image.user == req.user._id.toString()) {
                                sendImageFile()
                            } else if (image.context === "user") {
                                Relationship.findOne({ toUser: req.user._id, value: "trust", fromUser: image.user }).then(rel => {
                                    if (rel) {
                                        sendImageFile()
                                    } else {
                                        // User not trusted by image's uploader
                                        console.log("User not trusted!")
                                        res.status('404')
                                        res.redirect('/404');
                                    }
                                })
                            } else if (image.context === "community") {
                                Community.findOne({ _id: image.community, members: req.user._id }).then(comm => {
                                    if (comm) {
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

    //Responds to get requests for '/'.
    //Input: none
    //Output: redirect to '/home' if logged in, render of the index page if logged out.
    app.get('/', function(req, res) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
        res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
        res.setHeader("Expires", "0"); // Proxies.
        if (req.isAuthenticated()) {
            res.redirect('/home');
        } else {
            User.count().then(users => {
                Community.find().sort('-lastUpdated').then(communities => {
                    var publicCommunites = communities.filter(c => c.settings.visibility == "public" && c.settings.joinType == "open");
                    publicCommunites.sort(function() {
                      return .5 - Math.random();
                    });
                    publicCommunites.length = 8;
                    res.render('index', {layout: 'logged-out', userCount: users, communities: publicCommunites, communityCount: communities.length, sessionFlash: res.locals.sessionFlash });
                })
            })
        }
    });

    //Responds to get requests for the login page.
    //Input: flash message
    //Output: rendering of the login page with the flash message included.
    app.get('/login', function(req, res) {
        res.render('login', {
            layout: 'logged-out',
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to get requests for the signup page.
    //Input: flash message
    //Output: rendering of the signup page with the flash message included.
    app.get('/signup', function(req, res) {
        res.render('signup', {
            layout: 'logged-out',
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to get requests for the profile of someone with a certain email. Deprecated? Is this used?
    //Input: the email
    //Output: redirect to /the username of the person with that email, unless isLoggedInOrRedirect redirects you
    app.get('/getprofile/:email', isLoggedInOrRedirect, function(req, res) {
        User.findOne({
            email: req.params.email
        }).then((user) => {
            res.redirect('/' + user.username);
        })
    });

    //Responds to get requests for the home page.
    //Input: none
    //Output: the home page, if isLoggedInOrRedirect doesn't redirect you.
    app.get('/home', isLoggedInOrRedirect, async function(req, res) {
        async function getRecommendations() {
            console.time('getRecommendationsFunction')
            popularCommunities = [];
            recommendedUsers = {};
            relationshipWeights = {
                "trust": 2,
                "follow": 0.5
            };
            lastFortnight = moment(new Date()).subtract(14, 'days');
            async function getRelationships(id, type) {
                var users = {};
                return Relationship.find({
                        fromUser: id,
                        value: type
                    })
                    .then((relationships) => {
                        relationships.forEach(relationship => {
                            if (!relationship.toUser.equals(req.user._id)) {
                                let id = relationship.toUser.toString();
                                let weight = relationshipWeights[relationship.value]
                                if (!(id in users)) {
                                    users[id] = weight;
                                } else {
                                    users[id] += weight;
                                }
                            }
                        })
                        return users;
                    })
            }
            console.time('popularHashtags')
            popularHashtags = await Tag.find()
                .limit(5)
                .sort('-lastUpdated')
                .then(tags => {
                    return tags;
                })
            console.timeEnd('popularHashtags')

            // Trusted and followed users of people the user
            // trusts or follows are retrieved and placed in
            // an array with weighted scores - trust gives a
            // score of 2, following gives a score of 0.5.
            // (The scores have been arbitrarily selected.)

            console.time('recommendedUsers')
            primaryRelationships = await getRelationships(req.user._id, ["trust", "follow"]);
            for (const primaryUser in primaryRelationships) {
                const secondaryRelationships = await getRelationships(primaryUser, ["trust", "follow"])
                for (const secondaryUser in secondaryRelationships) {
                    let id = secondaryUser;
                    let weight = secondaryRelationships[secondaryUser]
                    if (!(id in recommendedUsers)) {
                        recommendedUsers[id] = weight;
                    } else {
                        recommendedUsers[id] += weight;
                    }
                }
            }
            recommendedUserIds = Object.keys(recommendedUsers)
            console.timeEnd('recommendedUsers')

            usersKnown = Object.keys(primaryRelationships)

            // Shows all recently active communities if the user's only friend is sweetbot,
            // otherwise only recently active communities with a friend in them
            if (usersKnown.length == 1 && usersKnown[0] === "5c962bccf0b0d14286e99b68") {
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
                    return communities;
                })

            return User.findOne({
                    _id: req.user._id
                })
                .then(user => {
                    console.time('userFunctions')
                    popularCommunities = popularCommunities.filter(e => !user.hiddenRecommendedCommunities.includes(e._id.toString()))

                    if (popularCommunities.length > 16)
                        popularCommunities.length = 16;

                    unknownUsers = recommendedUserIds.filter(e => !usersKnown.includes(e));
                    unknownUsers = unknownUsers.filter(e => !user.hiddenRecommendedUsers.includes(e));

                    if (unknownUsers.length > 16)
                        unknownUsers.length = 16;

                    return User.find({
                            _id: unknownUsers
                        }, { username: 1, image: 1, imageEnabled: 1, displayName: 1 })
                        .then(userData => {
                            userData.forEach(user => {
                                user.weight = recommendedUsers[user._id.toString()];
                            })
                            userData.sort((a, b) => (a.weight > b.weight) ? -1 : 1)
                            results = {
                                popularCommunities: popularCommunities,
                                userRecommendations: userData,
                                popularHashtags: popularHashtags
                            }
                            console.timeEnd('userFunctions')
                            console.timeEnd('getRecommendationsFunction')
                            return results;
                        })
                });
        }
        recommendations = await getRecommendations();
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
        res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
        res.setHeader("Expires", "0"); // Proxies.
        res.render('home', {
            loggedIn: true,
            loggedInUserData: req.user,
            activePage: 'home',
            popularCommunities: (recommendations.popularCommunities.length > 0 ? recommendations.popularCommunities : false),
            userRecommendations: (recommendations.userRecommendations.length > 0 ? recommendations.userRecommendations : false),
            popularHashtags: (recommendations.popularHashtags.length > 0 ? recommendations.popularHashtags : false)
        });
    });

    //Responds to get requests for the 404 page.
    //Input: user data from req.user
    //Output: the 404 page
    app.get('/404', function(req, res) {
        if (req.isAuthenticated()) {
            res.render('404', { loggedIn: true, loggedInUserData: req.user });
        } else {
            res.render('404', { loggedIn: false });
        }
    });

    //Responds to get requests for tag pages.
    //Input: the name of the tag from the url
    //Output: the tag page rendered if it exists, redirect to the 404 page otherwise, unless isLoggedInOrRedirect redirects you
    app.get('/tag/:name', isLoggedInOrRedirect, function(req, res) {
        Tag.findOne({ name: req.params.name }).then((tag) => {
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
    app.get('/notifications', function(req, res) {
        if (req.isAuthenticated()) {
            User.findOne({ _id: req.user._id }, 'notifications').then(user => {
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
    app.get('/settings', isLoggedInOrRedirect, function(req, res) {
        res.render('settings', {
            loggedIn: true,
            loggedInUserData: req.user,
            notifierPublicKey: auth.vapidPublicKey,
            activePage: 'settings'
        })
    })

    app.get('/support', isLoggedInOrRedirect, function(req, res) {
        res.render('support', {
            loggedIn: true,
            loggedInUserData: req.user,
            activePage: 'support'
        })
    })

    app.get('/about', function(req, res) {
        res.render('about', {
            loggedIn: req.isAuthenticated(),
            loggedInUserData: req.user,
            activePage: 'support'
        })
    })

    //Responds to get requests for /search.
    //Input: none
    //Output: renders search page unless isLoggedInOrRedirect redirects you
    app.get('/search', isLoggedInOrRedirect, function(req, res) {
        res.render('search', {
            loggedIn: true,
            loggedInUserData: req.user,
            activePage: 'search'
        })
    })

    //Responds to get requests for /search that include a query.
    //Input: the query
    //Output: the rendered search page, unless isLoggedInOrRedirect redirects you
    app.get('/search/:query', isLoggedInOrRedirect, function(req, res) {
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
    app.post('/api/user/followers', isLoggedInOrRedirect, function(req, res) {
        followedUserData = []
        Relationship.find({ fromUser: req.user._id, value: "follow" }).populate("toUser").then((followedUsers) => {
                followedUsers.forEach(relationship => {
                    var follower = {
                        key: (relationship.toUser.displayName ? relationship.toUser.displayName + ' (' + '@' + relationship.toUser.username + ')' : '@' + relationship.toUser.username),
                        value: relationship.toUser.username,
                        image: (relationship.toUser.imageEnabled ? relationship.toUser.image : 'cake.svg')
                    }
                    followedUserData.push(follower)
                })
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({ followers: followedUserData }));
            })
            .catch((err) => {
                console.log("Error in profileData.")
                console.log(err);
            });
    })

    //Responds to requests for search queries by page.
    //Input: query, timestamp of oldest result yet loaded (in milliseconds)
    //Output: 404 response if no results, the rendered search results otherwise, unless isLoggedInOrRedirect redirects you
    app.get('/showsearch/:query/:olderthanthis', isLoggedInOrRedirect, function(req, res) {

        let resultsPerPage = 10;
        let olderthan = new Date(parseInt(req.params.olderthanthis))

        let query = req.params.query.trim();
        if (!query.length) {
            res.status(404).send('Not found');
        } else {
            Tag.find({
                    name: {
                        '$regex': query,
                        '$options': 'i'
                    },
                    lastUpdated: { $lt: olderthan }
                })
                .sort('-lastUpdated')
                .limit(resultsPerPage) // this won't completely keep us from getting more than we need, but the point is we'll never need more results than this per page load from any collection
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
                            ],
                            lastUpdated: { $lt: olderthan }
                        })
                        .sort('-lastUpdated')
                        .limit(resultsPerPage)
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
                                    ],
                                    lastUpdated: { $lt: olderthan }
                                })
                                .sort('-lastUpdated')
                                .limit(resultsPerPage)
                                .then(communityResults => {
                                    var combinedResults = userResults.concat(communityResults, tagResults);
                                    if (!combinedResults.length) {
                                        res.sendStatus(404)
                                    } else {
                                        var parsedResults = [];
                                        combinedResults.forEach(result => {
                                            var constructedResult = {};
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
                                        parsedResults.sort(function(a, b) {
                                            var timestampA = a.sort,
                                                timestampB = b.sort;
                                            if (timestampA > timestampB) //sort timestamp descending
                                                return -1;
                                            if (timestampA < timestampB)
                                                return 1;
                                            return 0;
                                        });
                                        parsedResults = parsedResults.slice(0, resultsPerPage);
                                        var oldesttimestamp = parsedResults[parsedResults.length - 1].sort;
                                        res.render('partials/searchresults', {
                                            layout: false,
                                            loggedIn: true,
                                            loggedInUserData: req.user,
                                            oldesttimestamp: oldesttimestamp.getTime(),
                                            results: parsedResults.slice(0, resultsPerPage)
                                        });
                                    }
                                })
                        })
                })
        }
    })

    //Responds to a get response for a specific post.
    //Inputs: the username of the user and the string of random letters and numbers that identifies the post (that's how post urls work)
    //Outputs: showposts handles it!
    app.get('/:username/:posturl', function(req, res, next) {
        if (req.params.username != 'images') { //a terrible hack to stop requests for images (/images/[image filename] fits into this route's format) from being sent to showposts
            req.url = req.path = "/showposts/single/" + req.params.posturl + "/1";
            req.singlepostUsername = req.params.username; //slightly sus way to pass this info to showposts
            next('route');
        }
        return;
    })

    app.get('/tag/:tagname', function(req, res, next) {
        req.url = req.path = "/showposts/tag/" + req.params.tagname + "/1";
        next('route');
        return;
    })

    //this function is called per post in the post displaying function below to keep the cached html for image galleries and embeds up to date
    //in the post and all of its comments.
    async function keepCachedHTMLUpToDate(post) {

        //only runs if cached html is out of date
        async function updateHTMLRecursive(displayContext) {
            displayContext = await helper.updateHTMLCache(displayContext);
            if (displayContext.comments) {
                for (comment of displayContext.comments) {
                    await updateHTMLRecursive(comment);
                }
            } else if (displayContext.replies) {
                for (reply of displayContext.replies) {
                    await updateHTMLRecursive(reply);
                }
            }
        }

        var galleryTemplatePath = "./views/partials/imagegallery.handlebars";
        var galleryTemplateMTime = fs.statSync(galleryTemplatePath).mtime; //would probably be better asynchronous
        var embedsTemplatePath = "./views/partials/embed.handlebars";
        var embedTemplateMTime = fs.statSync(embedsTemplatePath).mtime;

        if ((!post.cachedHTML.imageGalleryMTime || post.cachedHTML.imageGalleryMTime < galleryTemplateMTime) || (!post.cachedHTML.embedsMTime || post.cachedHTML.embedsMTime < embedTemplateMTime)) {

            await updateHTMLRecursive(post);
            post.cachedHTML.imageGalleryMTime = galleryTemplateMTime;
            post.cachedHTML.embedsMTime = embedTemplateMTime;
            await post.save();
        }
    }

    //Responds to requests for posts for feeds. API method, used within the public pages.
    //Inputs: the context is either community (posts on a community's page), home (posts on the home page), user
    //(posts on a user's profile page), or single (a single post.) The identifier identifies either the user, the
    //community, or the post. I don't believe it's used when the context is home? It appears to be the url of the image
    //of the logged in user in that case. (??????????????????) olderthanthis means we want posts older than this timestamp (milliseconds).
    //Output: the rendered HTML of the posts, unless it can't find any posts, in which case it returns a 404 error.
    app.get('/showposts/:context/:identifier/:olderthanthis', async function(req, res) {
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
        let olderthanthis = new Date(parseInt(req.params.olderthanthis))

        //build some user lists. only a thing if the user is logged in.
        //todo: instead of pulling them from the relationships collection, at least the first 4 could be arrays of references to other users in the user document, that would speed things up
        if (req.isAuthenticated()) {
            var myFollowedUserIds = ((await Relationship.find({ from: loggedInUserData.email, value: "follow" })).map(v => v.toUser)).concat([req.user._id]);
            var myFlaggedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: "flag" })).map(v => v.to));
            var myMutedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: "mute" })).map(v => v.to));
            var myTrustedUserEmails = ((await Relationship.find({ from: loggedInUserData.email, value: "trust" })).map(v => v.to));
            var usersFlaggedByMyTrustedUsers = ((await Relationship.find({ from: { $in: myTrustedUserEmails }, value: "flag" })).map(v => v.to));
            var usersWhoTrustMeEmails = ((await Relationship.find({ to: loggedInUserData.email, value: "trust" })).map(v => v.from)).concat([req.user.email]);
            var myCommunities = req.user.communities;
            if (req.params.context == "community" && req.isAuthenticated()) {
                var isMuted = (await Community.findById(req.params.identifier)).mutedMembers.some(v => v.equals(req.user._id));
            } else {
                var isMuted = false;
            }
            var flagged = usersFlaggedByMyTrustedUsers.concat(myFlaggedUserEmails).filter(e => e !== loggedInUserData.email);
        }

        const today = moment().clone().startOf('day');
        const thisyear = moment().clone().startOf('year');

        //construct the query that will retrieve the posts we want. basically just coming up with criteria to pass to Post.find. also, sortMethod
        //is set according to the relevant user setting if they're logged in or to a default way at the bottom of this part if they're not.

        if (req.params.context == "home") {
            //on the home page, we're looking for posts (and boosts) created by users we follow as well as posts in communities that we're in.
            //we're assuming the user is logged in if this request is being made (it's only made by code on a page that only loads if the user is logged in.)
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
            //if we're on a user's page, obviously we want their posts:
            var matchPosts = {
                author: req.params.identifier,
            }
            //but we also only want posts if they're non-community or they come from a community that we belong to:
            if (req.isAuthenticated()) {
                matchPosts.$or = [{
                    community: {
                        $exists: false
                    }
                }, {
                    community: {
                        $in: myCommunities
                    }
                }];
                var sortMethod = req.user.settings.userTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
            } else {
                //logged out users shouldn't see any community posts on user profile pages
                matchPosts.community = {
                    $exists: false
                };
            }
        } else if (req.params.context == "community") {
            var thisComm = await Community.findById(req.params.identifier);
            //we want posts from the community, but only if it's public or we belong to it:
            if (thisComm.settings.visibility == 'public' || myCommunities.some(v => v.toString() == req.params.identifier)) {
                var matchPosts = {
                    community: req.params.identifier
                }
            } else {
                //if we're not in the community and it's not public, there are no posts we're allowed to view!
                var matchPosts = undefined;
            }
            if (req.isAuthenticated()) {
                var sortMethod = req.user.settings.communityTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
            }
        } else if (req.params.context == "tag") {
            function getTag() {
                return Tag.findOne({ name: req.params.identifier })
                    .then((tag) => {
                        var matchPosts = { _id: { $in: tag.posts } }
                        return matchPosts;
                    })
            }
            var matchPosts = await getTag();
            var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
        } else if (req.params.context == "single") {
            var author = (await User.findOne({ username: req.singlepostUsername }, { _id: 1 }));
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

        if (req.params.context != "single") {
            //in feeds, we only want posts older than ("less than") the paramater sent in, with age being judged by the currently active sorting method.
            matchPosts[sortMethod.substring(1, sortMethod.length)] = { $lt: olderthanthis };
        }

        var query = Post.find(
                matchPosts
            ).sort(sortMethod)
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

                if (req.params.context != "single") {
                    //this gets the timestamp of the last post, this tells the browser to ask for posts older than this next time. used in feeds, not with single posts
                    oldesttimestamp = "" + posts[posts.length - 1][sortMethod.substring(1, sortMethod.length)].getTime();
                }

                //now we build the array of the posts we can actually display. some that we just retrieved still may not make the cut
                displayedPosts = [];

                for (const post of posts) {
                    //figure out if there is a newer instance of the post we're looking at. if it's an original post, check the boosts from
                    //the context's relevant users; if it's a boost, check the original post if we're in fluid mode to see if lastUpdated is more
                    //recent (meaning the original was bumped up from recieving a comment) and then for both fluid and chronological we have to check
                    //to see if there is a more recent boost.
                    if (req.params.context != "community" && req.params.context != "single") {
                        var isThereNewerInstance = false;
                        var whosePostsCount = req.params.context == "user" ? [new ObjectId(req.params.identifier)] : myFollowedUserIds;
                        if (post.type == 'original') {
                            for (boost of post.boostsV2) {
                                if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => { return boost.booster.equals(f) })) {
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
                                    if (boost.timestamp.getTime() > post.lastUpdated.getTime() && whosePostsCount.some(f => { return boost.booster.equals(f) })) {
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
                            //we don't have to check if the user is in the community before displaying posts to them if we're on the community's page, or if it's a single post page and: the community is public or the user wrote the post
                            //in other words, we do have to check if the user is in the community if those things aren't true, hence the !
                            if (!(req.params.context == "community" || (req.params.context == "single" && (post.author.equals(req.user._id) || post.community.settings.visibilty == "public")))) {
                                if (myCommunities.some(m => { return m.equals(post.community._id) })) {
                                    canDisplay = true;
                                } else {
                                    canDisplay = false;
                                }
                            }
                            // Hide muted community members
                            let mutedMemberIds = post.community.mutedMembers.map(a => a._id.toString());
                            if (mutedMemberIds.includes(post.author._id.toString())) {
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
                        } else if (req.params.context == "community" && thisComm.settings.visibility == "public") {
                            //also posts in publicly visible communities can be shown, period. i'm 99% sure that posts from private communities won't even
                            //be fetched for logged out users because of the way the matchPosts query is constructed above but just in case i'm checking it
                            //again in the above if statement
                            canDisplay = true;
                        }
                    }

                    // As a final hurrah, just hide all posts and boosts made by users you've muted
                    if (req.isAuthenticated() && myMutedUserEmails.includes(post.authorEmail)) {
                        canDisplay = false;
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

                    await keepCachedHTMLUpToDate(displayContext);

                    if (moment(displayContext.timestamp).isSame(today, 'd')) {
                        parsedTimestamp = moment(displayContext.timestamp).fromNow();
                    } else if (moment(displayContext.timestamp).isSame(thisyear, 'y')) {
                        parsedTimestamp = moment(displayContext.timestamp).format('D MMM');
                    } else {
                        parsedTimestamp = moment(displayContext.timestamp).format('D MMM YYYY');
                    }

                    if (req.isAuthenticated()) {
                        // Used to check if you can delete a post
                        var isYourPost = displayContext.author._id.equals(req.user._id);
                    }
                    //generate some arrays containing usernames that will be put in "boosted by" labels
                    if (req.isAuthenticated() && (req.params.context != "community")) {
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
                                        if (myFollowedUserIds.some(following => { if (following) { return following.equals(v.booster._id) } })) {
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
                        canDisplay: canDisplay, //todo: remove here and in template, if this is false then the post should not have been added thanks to the continue;
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
                        internalPostHTML: displayContext.cachedHTML.fullContentHTML,
                        commentsDisabled: displayContext.commentsDisabled,
                        comments: displayContext.comments,
                        numberOfComments: displayContext.numberOfComments,
                        contentWarnings: displayContext.contentWarnings,
                        community: displayContext.community,
                        headerBoosters: boostsForHeader,
                        recentlyCommented: false, // This gets set below
                        lastCommentAuthor: "", // As does this
                        subscribedUsers: displayContext.subscribedUsers,
                        unsubscribedUsers: displayContext.unsubscribedUsers,
                        hasImages: (displayContext.images && displayContext.images.length > 0),
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
                        element.forEach(async function(comment) {

                            comment.canDisplay = true;
                            comment.muted = false;
                            // I'm not sure why, but boosts in the home feed don't display
                            // comment authors below the top level - this fixes it, but
                            // it's kind of a hack - I can't work out what's going on
                            if (!comment.author.username) {
                                comment.author = await User.findById(comment.author);
                            }
                            if (req.isAuthenticated() && myMutedUserEmails.includes(comment.author.email)) {
                                comment.muted = true;
                                comment.canDisplay = false;
                            }
                            if (comment.deleted) {
                                comment.canDisplay = false;
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
                            if (req.isAuthenticated() && momentifiedTimestamp.isAfter(threeHoursAgo) && !comment.author._id.equals(req.user._id)) {
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
                        if (myCommunities.some(m => { return m.equals(req.params.identifier) })) {
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
                        var canDisplay = true;
                        //todo: use the first image from the post if it has one, its address and location in the post document will be based on displayedPost.imageVersion
                        if (displayedPost.author.imageEnabled) {
                            var metadataImage = "https://sweet.sh/images/" + displayedPost.author.image
                        } else {
                            var metadataImage = "https://sweet.sh/images/cake.svg";
                        }
                        var firstLine = /<p>(.+?)<\/p>|<ul><li>(.+?)<\/li>|<blockquote>(.+?)<\/blockquote>/.exec(displayedPost.internalPostHTML)
                        if(firstLine && firstLine[1]){
                            firstLine = firstLine[1];
                        }else{
                            //todo: maybe look at the post's inline elements and if there's a link preview have this be "link to..." or if there's an image with a description use that
                            firstLine = "Just another ol' good post on sweet";
                        }
                        metadata = {
                            title: "@" + displayedPost.author.username + " on sweet",
                            description: firstLine,
                            image: metadataImage,
                            url: 'https://sweet.sh/' + displayedPost.author.username + '/' + displayedPost.url
                        }

                        var post = displayedPosts[0]; //hopefully there's only one...
                        if (post.community && req.isAuthenticated() && post.community.members.some(m => { return m.equals(req.user._id) })) {
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
                        oldesttimestamp: oldesttimestamp
                    });
                }
            }
        })
    })

    //Responds to get requests for a user's profile page.
    //Inputs: username is the user's username.
    //Outputs: a 404 if the user isn't found
    app.get('/:username', async function(req, res) {

        function c(e) {
            console.error("error in query in /:username user list builders");
            console.error(e);
        }

        var profileData = await User.findOne({ username: req.params.username }).catch(err => {
            console.error("error in username query in /:username");
            console.error(err);
        });
        if (!profileData) {
            console.log("user " + req.params.username + " not found");
            res.status(404).redirect('/404');
            return;
        }
        var communitiesData = await Community.find({ members: profileData._id }).catch(c); //given to the renderer at the end
        var followersArray = (await Relationship.find({ to: profileData.email, value: "follow" }, { from: 1 }).catch(c)).map(v => v.from); //only used for the below
        var followers = await User.find({ email: { $in: followersArray } }).catch(c); //passed directly to the renderer
        var theirFollowedUserEmails = (await Relationship.find({ from: profileData.email, value: "follow" }, { to: 1 }).catch(c)).map(v => v.to); //used in the below and to see if the profile user follows you
        var theirFollowedUserData = await User.find({ email: { $in: theirFollowedUserEmails } }); //passed directly to the renderer
        var usersWhoTrustThemArray = (await Relationship.find({ to: profileData.email, value: "trust" }).catch(c)).map(v => v.from) //only used for the below
        var usersWhoTrustThem = await User.find({ email: { $in: usersWhoTrustThemArray } }).catch(c); //passed directly to the renderer
        var theirTrustedUserEmails = (await Relationship.find({ from: profileData.email, value: "trust" }).catch(c)).map(v => v.to); //used to see if the profile user trusts the logged in user (if not isOwnProfile) and the below
        var theirTrustedUserData = await User.find({ email: { $in: theirTrustedUserEmails } }).catch(c); //given directly to the renderer

        var userTrustsYou = false;
        var userFollowsYou = false;
        if (req.isAuthenticated()) {
            // Is this the logged in user's own profile?
            if (profileData.email == req.user.email) {
                var isOwnProfile = true;
                var userTrustsYou = false;
                var userFollowsYou = false;
                var trusted = false;
                var followed = false;
                var muted = false;
                var flagged = false;
                var flagsFromTrustedUsers = 0;
                var myFlaggedUserEmails = (await Relationship.find({ from: req.user.email, value: "flag" }).catch(c)).map(v => v.to); //only used in the below line
                var myFlaggedUserData = await User.find({ email: { $in: myFlaggedUserEmails } }).catch(c); //passed directly to the renderer, but only actually used if isOwnProfile, so we're only actually defining it in here
            } else {
                var isOwnProfile = false;

                var myTrustedUserEmails = (await Relationship.find({ from: req.user.email, value: "trust" }).catch(c)).map(v => v.to); //used for flag checking and to see if the logged in user trusts this user

                // Check if profile user follows and/or trusts logged in user
                var userTrustsYou = theirTrustedUserEmails.includes(req.user.email) //not sure if these includes are faster than an indexed query of the relationships collection would be
                var userFollowsYou = theirFollowedUserEmails.includes(req.user.email)

                // Check if logged in user follows and/or trusts and/or has muted profile user
                var trusted = myTrustedUserEmails.includes(profileData.email);
                var followed = !!(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: "follow" }).catch(c));
                var muted = !!(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: "mute" }).catch(c));

                var flagsOnUser = await Relationship.find({ to: profileData.email, value: "flag" }).catch(c);
                var flagsFromTrustedUsers = 0;
                var flagged = false;
                for (var flag of flagsOnUser) {
                    // Check if logged in user has flagged profile user
                    if (flag.from == req.user.email) {
                        var flagged = true;
                    }
                    // Check if any of the logged in user's trusted users have flagged profile user
                    if (myTrustedUserEmails.includes(flag.from)) {
                        flagsFromTrustedUsers++;
                    }
                }
            }

        } else {
            var isOwnProfile = false;
            var flagsFromTrustedUsers = 0;
            var trusted = false;
            var followed = false;
            var flagged = false;
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
        });
    });

    app.get("/api/suggestions/users", isLoggedInOrRedirect, function(req, res) {

    })

    //Responds to post request from the browser informing us that the user has seen the comments of some post by setting notifications about those comments
    //to seen=true
    //Input:
    app.post("/api/notification/update/:id", isLoggedInOrRedirect, function(req, res) {
        User.findOneAndUpdate({
                "_id": req.user._id,
                "notifications._id": req.params.id
            }, {
                "$set": {
                    "notifications.$.seen": true
                }
            },
            function(err, doc) {
                res.sendStatus(200)
            }
        );
    })

    app.post("/api/notification/update-by-subject/:subjectid", isLoggedInOrRedirect, function(req, res) {
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

    app.get('/api/notification/display', function(req, res) {
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

    app.post('/api/newpostform/linkpreviewdata', async function(req, res) {
        try {
            const metadata = await helper.getLinkMetadata(req.body.url);
            res.setHeader('content-type', 'text/plain');
            res.send(JSON.stringify(metadata))
        } catch (err) {
            console.log("could not get link preview information for url " + req.body.url)
            console.log(err);
            res.send("invalid url i guess");
        }
    })

    app.post('/admin/reporterror', function(req, res) {
        fs.appendFile("clientsideerrors.txt", req.body.errorstring + "\n\n", (error) => {
            if (error) {
                console.error(error)
            }
        });
        res.status(200).send('thank');
    })

    app.get('/admin/errorlogs/:password', function(req, res) {
        var passwordHash = "$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq"
        if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash) && fs.existsSync(path.resolve(global.appRoot, "clientsideerrors.txt"))) {
            res.status(200).sendFile(path.resolve(global.appRoot, "clientsideerrors.txt"));
        }
    })

    app.get('/admin/emaillogs/:password', function(req, res) {
        var passwordHash = "$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq"
        if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash) && fs.existsSync(path.resolve(global.appRoot, "emailLog.txt"))) {
            res.status(200).sendFile(path.resolve(global.appRoot, "emailLog.txt"));
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
}
