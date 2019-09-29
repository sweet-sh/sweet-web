var auth = require('../config/auth.js'); //used on the settings page to set up push notifications

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
                                        console.log(req);
                                        console.log(image);
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
                    res.render('index', { layout: 'logged-out', userCount: users, communities: publicCommunites, communityCount: communities.length, sessionFlash: res.locals.sessionFlash });
                })
            })
        }
    });

    //Responds to get requests for the login page.
    //Input: flash message
    //Output: rendering of the login page with the flash message included.
    app.get('/login', function(req, res) {
        if (req.isAuthenticated()) {
            return res.redirect('back');
        }
        res.render('login', {
            layout: 'logged-out',
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to get requests for the signup page.
    //Input: flash message
    //Output: rendering of the signup page with the flash message included.
    app.get('/signup', function(req, res) {
        if (req.isAuthenticated()) {
            return res.redirect('back');
        }
        res.render('signup', {
            layout: 'logged-out',
            sessionFlash: res.locals.sessionFlash
        });
    });

    //Responds to get requests for the home page.
    //Input: none
    //Output: the home page, if isLoggedInOrRedirect doesn't redirect you.
    app.get('/home', isLoggedInOrRedirect, async function(req, res) {
        async function getRecommendations() {
            //console.time('getRecommendationsFunction')
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
            //console.time('popularHashtags')
            popularHashtags = await Tag.find()
                .limit(5)
                .sort('-lastUpdated')
                .then(tags => {
                    return tags;
                })
            //console.timeEnd('popularHashtags')

            // Trusted and followed users of people the user
            // trusts or follows are retrieved and placed in
            // an array with weighted scores - trust gives a
            // score of 2, following gives a score of 0.5.
            // (The scores have been arbitrarily selected.)

            //console.time('recommendedUsers')
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
            //console.timeEnd('recommendedUsers')

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
                    //console.time('userFunctions')
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
                            //console.timeEnd('userFunctions')
                            //console.timeEnd('getRecommendationsFunction')
                            return results;
                        })
                });
        }
        recommendations = await getRecommendations();
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
        res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
        res.setHeader("Expires", "0"); // Proxies.
        res.render('home', {
            layout: req.noLayout ? false : 'main',
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
                    layout: req.noLayout ? false : 'main',
                    loggedIn: true,
                    loggedInUserData: req.user,
                    notifications: user.notifications,
                    activePage: 'notifications'
                });
            })
        } else {
            res.render('notifications', {
                layout: req.noLayout ? false : 'main',
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
            query: req.params.query,
            metadata: { title: "Search: " + req.params.query } //more stuff could go here huh
        })
    })

    //Responds to post requests (?) for the users that follow the logged in user. used to build the @ mention list for tribute to auto-suggest stuff.
    //Input: none
    //Output: JSON data describing the users that follow the logged in user or a redirect from isLoggedInOrRedirect.
    app.post('/api/user/followers', isLoggedInOrRedirect, function(req, res) {
        followedUserData = []
        Relationship.find({ fromUser: req.user._id, value: "follow" }).populate("toUser").then((followedUsers) => {
                followedUsers.forEach(relationship => {
                    var follower = {
                        key: helper.escapeHTMLChars(relationship.toUser.displayName ? relationship.toUser.displayName + ' (' + '@' + relationship.toUser.username + ')' : '@' + relationship.toUser.username),
                        value: relationship.toUser.username,
                        image: (relationship.toUser.imageEnabled ? relationship.toUser.image : 'cake.svg')
                    }
                    followedUserData.push(follower);
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
                                            results: parsedResults.slice(0, resultsPerPage),
                                            query: req.params.query
                                        });
                                    }
                                })
                        })
                })
        }
    })

    app.get('/drafts/:olderthanthis', isLoggedInOrRedirect, function(req, res) {
        Post.find({ type: "draft", author: req.user._id, timestamp: { $lt: new Date(parseInt(req.params.olderthanthis)) } })
            .sort('-timestamp').limit(10).populate('author').then(async posts => {
                if (!posts.length) {
                    res.sendStatus(404);
                } else {
                    for (var post of posts) {
                        await keepCachedHTMLUpToDate(post);
                        post.internalPostHTML = post.cachedHTML.fullContentHTML;
                        post.commentsDisabled = true;
                        post.isYourPost = true;
                        var momentTimestamp = moment(post.timestamp);
                        if (momentTimestamp.isSame(moment(), 'd')) {
                            post.parsedTimestamp = momentTimestamp.fromNow();
                        } else if (momentTimestamp.isSame(moment(), 'y')) {
                            post.parsedTimestamp = momentTimestamp.format('D MMM');
                        } else {
                            post.parsedTimestamp = momentTimestamp.format('D MMM YYYY');
                        }
                        post.timestampMs = post.timestamp.getTime();
                        post.editedTimestampMs = post.lastEdited ? post.lastEdited.getTime() : '';
                    }
                    res.render('partials/posts_v2', {
                        layout: false,
                        loggedIn: true,
                        loggedInUserData: req.user,
                        posts: posts,
                        context: "drafts",
                        canReply: false,
                        isMuted: false,
                        oldesttimestamp: posts[posts.length - 1].timestamp.getTime() + ""
                    })
                }
            })
    })

    //this function checks if there are some newer posts than the given timestamp for the user's home feed. it duplicates some query logic from /showposts to do this.
    app.get("/heyaretherenewposts/:newerthanthis", isLoggedInOrRedirect, async function(req, res) {
        var myFollowedUserIds = ((await Relationship.find({ fromUser: req.user._id, value: "follow" })).map(v => v.toUser));
        var myMutedUserIds = ((await Relationship.find({ fromUser: req.user._id, value: "mute" })).map(v => v.toUser));
        var usersWhoTrustMe = ((await Relationship.find({ toUser: req.user._id, value: "trust" })).map(v => v.fromUser));
        var query = {
            $and: [{
                    $or: [
                        { $and: [{ author: { $in: myFollowedUserIds } }, { $or: [{ type: { $ne: "community" } }, { community: { $in: req.user.communities } }] }] }, { community: { $in: req.user.communities } }
                    ]
                },
                { $or: [{ privacy: "public" }, { author: { $in: usersWhoTrustMe } }] },
                { author: { $not: { $in: myMutedUserIds } } },
                { type: { $ne: "draft" } }
            ],
        };
        var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "lastUpdated" : "timestamp";
        var newerThanDate = new Date(parseInt(req.params.newerthanthis));
        var newerThanQuery = {};
        newerThanQuery[sortMethod] = { $gt: newerThanDate };
        query.$and.push(newerThanQuery);
        Post.find(query).then(async posts => {

            //if we're sorting by last updated, comments can prompt posts to look new, but we only want those with a comment that's newer than our newerthan timesamp
            //AND wasn't left by the logged in user, who knows about their own comments. so, we search recursively for that.
            function findNewComment(postOrComment) {
                if (postOrComment.timestamp > newerThanDate && !postOrComment.author.equals(req.user._id)) {
                    return true;
                }
                if (postOrComment.replies && postOrComment.replies.length) {
                    for (const r of postOrComment.replies) {
                        if (findNewComment(r)) {
                            return true;
                        }
                    }
                } else if (postOrComment.comments && postOrComment.comments.length) {
                    for (const c of postOrComment.comments) {
                        if (findNewComment(c)) {
                            return true;
                        }
                    }
                }
                return false;
            }

            res.setHeader("content-type", "text/plain")

            for (const post of posts) {
                var postCommunity = post.community ? (await Community.findById(post.community)) : undefined;
                if ((sortMethod == "lastUpdated" && findNewComment(post)) && (post.type != "community" || !postCommunity.mutedMembers.includes(post.author))) {
                    res.send("yeah");
                    return;
                }
            }
            res.send("no i guess not");
        })
    })

    app.get('/drafts', function(req, res, next) {
        req.draftsFirst = true;
        req.url = req.path = '/' + req.user.username;
        next('route');
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
            var html = await helper.renderHTMLContent(displayContext);
            if (displayContext.cachedHTML) {
                displayContext.cachedHTML.fullContentHTML = html;
            } else {
                displayContext.cachedHTML = { fullContentHTML: html };
            }
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
        var galleryTemplateMTime = undefined;
        var embedsTemplatePath = "./views/partials/embed.handlebars";
        var embedTemplateMTime = undefined;

        //non-blocking way to retrieve the last modified times for these templates so that we can check if the cached post html is up to data
        var mTimes = new Promise(function(resolve, reject) {
            fs.stat(galleryTemplatePath, (err, stats) => {
                if (err) {
                    console.err('could not get last modified time for image gallery template, post html will not be updated');
                    reject(err);
                } else {
                    galleryTemplateMTime = stats.mtime;
                    if (embedTemplateMTime) {
                        resolve();
                    }
                }
            })
            fs.stat(embedsTemplatePath, (err, stats) => {
                if (err) {
                    console.err('could not get last modified time for embed/link preview template, post html will not be updated');
                    reject(err);
                } else {
                    embedTemplateMTime = stats.mtime;
                    if (galleryTemplateMTime) {
                        resolve();
                    }
                }
            })
        })

        await mTimes.then(async function() {
            if ((!post.cachedHTML.imageGalleryMTime || post.cachedHTML.imageGalleryMTime < galleryTemplateMTime) || (!post.cachedHTML.embedsMTime || post.cachedHTML.embedsMTime < embedTemplateMTime)) {
                await updateHTMLRecursive(post);
                post.cachedHTML.imageGalleryMTime = galleryTemplateMTime;
                post.cachedHTML.embedsMTime = embedTemplateMTime;
                await post.save();
            }
        })
    }

    //called once per post and once per comment to get a readable, displayable timestamp for it
    function parseTimestamp(timestamp) {
        var tsMoment = moment(timestamp);
        var now = moment();
        if (tsMoment.isSame(now, 'd')) {
            return tsMoment.fromNow();
        } else if (tsMoment.isSame(now, 'y')) {
            return tsMoment.format('D MMM');
        } else {
            return tsMoment.format('D MMM YYYY');
        }
    }

    //Responds to requests for posts for feeds. API method, used within the public pages.
    //Inputs: the context is either community (posts on a community's page), home (posts on the home page), user
    //(posts on a user's profile page), single (a single post), or tag (posts on a tag page.) The identifier identifies either the user, the
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

        //construct the query that will retrieve the posts we want. basically just coming up with criteria to pass to Post.find. also, sortMethod
        //is set according to the relevant user setting if they're logged in or to a default way at the bottom of this part if they're not.

        if (req.params.context == "home") {
            //on the home page, we're looking for posts (and boosts) created by users we follow as well as posts in communities that we're in.
            //we're assuming the user is logged in if this request is being made (it's only made by code on a page that only loads if the user is logged in.)
            var matchPosts = {
                '$or': [
                    { 'author': { $in: myFollowedUserIds } },
                    { type: 'community', community: { $in: myCommunities } }
                ],
                type: { $ne: 'draft' }
            };
            var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
        } else if (req.params.context == "user") {
            //if we're on a user's page, obviously we want their posts:
            var matchPosts = {
                author: req.params.identifier,
                type: { $ne: 'draft' }
            }
            //but we also only want posts if they're non-community or they come from a community that we belong to:
            if (req.isAuthenticated()) {
                matchPosts.$or = [
                    { community: { $exists: false } },
                    { community: null },
                    { community: { $in: myCommunities } }
                ];
                var sortMethod = req.user.settings.userTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
            } else {
                //logged out users shouldn't see any community posts on user profile pages
                matchPosts.community = { $exists: false };
            }
        } else if (req.params.context == "community") {
            var thisComm = await Community.findById(req.params.identifier);
            //we want posts from the community, but only if it's public or we belong to it:
            if (thisComm.settings.visibility == 'public' || myCommunities.some(v => v.toString() == req.params.identifier)) {
                var matchPosts = { community: req.params.identifier }
            } else {
                //if we're not in the community and it's not public, there are no posts we're allowed to view!
                var matchPosts = undefined;
            }
            if (req.isAuthenticated()) {
                var sortMethod = req.user.settings.communityTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
            }
        } else if (req.params.context == "tag") {
            var matchPosts = { _id: { $in: (await Tag.findOne({ name: req.params.identifier })).posts }, type: { $ne: "draft" } };
            var sortMethod = req.user.settings.homeTagTimelineSorting == "fluid" ? "-lastUpdated" : "-timestamp";
        } else if (req.params.context == "single") {
            var author = (await User.findOne({ username: req.singlepostUsername }, { _id: 1 }));
            var matchPosts = {
                author: author ? author._id : undefined, //won't find anything if the author corresponding to the username couldn't be found
                url: req.params.identifier,
                type: { $ne: "draft" }
            }
            var sortMethod = "-lastUpdated" //this shouldn't matter oh well
        }

        if (!req.isAuthenticated()) {
            matchPosts.privacy = "public";
            var sortMethod = "-lastUpdated";
        }

        if (req.params.context != "single") {
            //in feeds, we only want posts older than ("less than") the parameter sent in, with age being judged by the currently active sorting method.
            matchPosts[sortMethod.substring(1, sortMethod.length)] = { $lt: olderthanthis };
        }

        var posts = await Post.find(matchPosts)
            .sort(sortMethod)
            .limit(postsPerPage)
            //these populate commands retrieve the complete data for these things that are referenced in the post documents
            .populate('author', '-password')
            .populate('community')
            .populate('boostTarget')
            .populate('boostsV2.booster');

        if (!posts || !posts.length) {
            res.status(404).render('singlepost', { // The 404 is required so InfiniteScroll.js stops loading the feed
                canDisplay: false,
                loggedIn: req.isAuthenticated(),
                loggedInUserData: loggedInUserData,
                post: null,
                metadata: {},
                activePage: 'singlepost'
            })
            return;
        }

        if (req.params.context != "single") {
            //this gets the timestamp of the last post, this tells the browser to ask for posts older than this next time. used in feeds, not with single posts
            var oldesttimestamp = "" + posts[posts.length - 1][sortMethod.substring(1, sortMethod.length)].getTime();
        }

        var displayedPosts = []; //populated by the for loop below

        for (var post of posts) {
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
                    if (!(req.params.context == "community" || (req.params.context == "single" && (post.author.equals(req.user._id) || post.community.settings.visibility == "public")))) {
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

            var parsedTimestamp = parseTimestamp(displayContext.timestamp);

            if (req.isAuthenticated()) {
                // Used to check if you can delete a post
                var isYourPost = displayContext.author._id.equals(req.user._id);
            }
            //generate some arrays containing usernames that will be put in "boosted by" labels
            if (req.isAuthenticated()) {
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
                        var boostsForHeader = [(await (User.findById(req.params.identifier))).username];
                    }
                } else if (req.isAuthenticated() && req.params.context == "user") {
                    if (displayContext.author._id.toString() != req.params.identifier) {
                        var boostsForHeader = [(await (User.findById(req.params.identifier))).username];
                    }
                }
            }

            var displayedPost = Object.assign(displayContext, {
                deleteid: displayContext._id,
                parsedTimestamp: parsedTimestamp,
                timestampMs: displayContext.timestamp.getTime(),
                editedTimestampMs: displayContext.lastEdited ? displayContext.lastEdited.getTime() : "",
                internalPostHTML: displayContext.cachedHTML.fullContentHTML,
                headerBoosters: boostsForHeader,
                recentlyCommented: false, // This gets set below
                lastCommentAuthor: "", // As does this
            })

            //these are only a thing for logged in users
            if (req.isAuthenticated()) {
                displayedPost.followedBoosters = followedBoosters;
                displayedPost.otherBoosters = notFollowingBoosters;
                displayedPost.isYourPost = isYourPost;
                displayedPost.youBoosted = youBoosted
            }

            //get timestamps and full image urls for each comment
            var latestTimestamp = 0;
            var sixHoursAgo = moment(new Date()).subtract(6, 'hours');
            var threeHoursAgo = moment(new Date()).subtract(3, 'hours');

            async function parseComments(comments, level) {
                for (var comment of comments) {
                    comment.canDisplay = true;
                    comment.muted = false;

                    comment.author = await User.findById(comment.author);

                    comment.muted = req.isAuthenticated() && myMutedUserEmails.includes(comment.author.email);
                    comment.canDisplay = !comment.deleted && !comment.muted;

                    comment.timestampMs = comment.timestamp.getTime();
                    comment.parsedTimestamp = parseTimestamp(comment.timestamp);
                    if (comment.timestamp > latestTimestamp) {
                        latestTimestamp = comment.timestamp;
                        displayedPost.lastCommentAuthor = comment.author;
                    }

                    // Only pulse comments from people who aren't you
                    comment.isRecent = (req.isAuthenticated() && moment(comment.timestamp).isAfter(threeHoursAgo) && !comment.author._id.equals(req.user._id));

                    comment.images = comment.images.map(v => '/api/image/display/' + v);

                    // If the comment's author is the current viewer, or the displayed post's author is the current viewer
                    comment.canDelete = ((comment.author._id.equals(loggedInUserData._id)) || (displayContext.author._id.equals(loggedInUserData._id))) && !comment.deleted;

                    comment.canReply = (level < globals.maximumCommentDepth);

                    comment.level = level;

                    if (comment.replies) {
                        await parseComments(comment.replies, level + 1);
                    }
                }
            }
            await parseComments(displayedPost.comments, 1);

            displayedPost.recentlyCommented = moment(latestTimestamp).isAfter(sixHoursAgo);

            //wow, finally.
            displayedPosts.push(displayedPost);
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
            return;
        }

        // For single posts, we are going to render a different template so that we can include its metadata in the HTML "head" section
        if (req.params.context == "single") {
            var displayedPost = displayedPosts[0];
            var canDisplay = Boolean(displayedPost);
            var metadata = helper.getPostMetadata(displayedPost);
            if (post.community && req.isAuthenticated() && post.community.members.some(m => { return m.equals(req.user._id) })) {
                var isMember = true;
            } else {
                var isMember = false;
            }
            res.render('singlepost', {
                layout: req.noLayout ? false : 'main',
                canDisplay: canDisplay,
                loggedIn: req.isAuthenticated(),
                loggedInUserData: loggedInUserData,
                posts: [displayedPost], // the posts_v2 partial expects an array
                flaggedUsers: flagged,
                metadata: metadata,
                isMuted: isMuted,
                isMember: isMember,
                canReply: !(displayedPost.type == "community" && !isMember),
                activePage: 'singlepost'
            })

        } else {
            var canReply = req.isAuthenticated() && (req.params.context != 'community' || myCommunities.some(m => { return m.equals(req.params.identifier) }))
            res.render('partials/posts_v2', {
                layout: false,
                loggedIn: req.isAuthenticated(),
                isMuted: isMuted,
                loggedInUserData: loggedInUserData,
                posts: displayedPosts,
                flaggedUsers: flagged,
                context: req.params.context,
                canReply: canReply,
                oldesttimestamp: oldesttimestamp
            });
        }
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

        var renderData = {}; //and he shall be filled up with properties

        renderData.communitiesData = await Community.find({ members: profileData._id }).catch(c);
        var followersEmails = (await Relationship.find({ to: profileData.email, value: "follow" }, { from: 1 }).catch(c)).map(v => v.from);
        renderData.followersData = await User.find({ email: { $in: followersEmails } }).catch(c);
        var theirFollowedUserEmails = (await Relationship.find({ from: profileData.email, value: "follow" }, { to: 1 }).catch(c)).map(v => v.to);
        renderData.followedUserData = await User.find({ email: { $in: theirFollowedUserEmails } });
        var usersWhoTrustThemEmails = (await Relationship.find({ to: profileData.email, value: "trust" }).catch(c)).map(v => v.from);
        renderData.usersWhoTrustThemData = await User.find({ email: { $in: usersWhoTrustThemEmails } }).catch(c);
        var theirTrustedUserEmails = (await Relationship.find({ from: profileData.email, value: "trust" }).catch(c)).map(v => v.to);
        renderData.trustedUserData = await User.find({ email: { $in: theirTrustedUserEmails } }).catch(c);

        if (req.isAuthenticated()) {
            // Is this the viewing user's own profile?
            if (profileData._id.equals(req.user._id)) {
                renderData.isOwnProfile = true;
                renderData.userTrustsYou = false;
                renderData.userFollowsYou = false;
                renderData.trusted = false;
                renderData.followed = false;
                renderData.muted = false;
                renderData.flagged = false;
                renderData.flagsFromTrustedUsers = 0;
                var myFlaggedUserEmails = (await Relationship.find({ from: req.user.email, value: "flag" }).catch(c)).map(v => v.to);
                renderData.flaggedUserData = await User.find({ email: { $in: myFlaggedUserEmails } }).catch(c);
            } else {
                renderData.isOwnProfile = false;

                var myTrustedUserEmails = (await Relationship.find({ from: req.user.email, value: "trust" }).catch(c)).map(v => v.to);

                // Check if profile user follows and/or trusts viewing user
                renderData.userTrustsYou = theirTrustedUserEmails.includes(req.user.email); //not sure if these includes are faster than an indexed query of the relationships collection would be
                renderData.userFollowsYou = theirFollowedUserEmails.includes(req.user.email);

                // Check if viewing user follows and/or trusts and/or has muted profile user
                renderData.trusted = myTrustedUserEmails.includes(profileData.email);
                renderData.followed = Boolean(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: "follow" }).catch(c));
                renderData.muted = Boolean(await Relationship.findOne({ from: req.user.email, to: profileData.email, value: "mute" }).catch(c));

                var flagsOnUser = await Relationship.find({ to: profileData.email, value: "flag" }).catch(c);
                renderData.flagsFromTrustedUsers = 0;
                renderData.flagged = false;
                for (var flag of flagsOnUser) {
                    // Check if viewing user has flagged profile user
                    renderData.flagged = (flag.from == req.user.email);
                    // Check if any of the viewing user's trusted users have flagged profile user
                    if (myTrustedUserEmails.includes(flag.from)) {
                        renderData.flagsFromTrustedUsers++;
                    }
                }
            }

        } else {
            renderData.isOwnProfile = false;
            renderData.flagsFromTrustedUsers = 0;
            renderData.trusted = false;
            renderData.followed = false;
            renderData.flagged = false;
        }

        if (profileData.profileVisibility != "invisible" || req.isAuthenticated()) {
            renderData.metadata = {
                title: profileData.displayName + ' (@' + profileData.username + ') on sweet',
                description: profileData.aboutRaw,
                image: (process.env.NODE_ENV == 'development' ? 'http://localhost:8686' : 'https://sweet.sh') + '/images/' + profileData.image,
                url: (process.env.NODE_ENV == 'development' ? 'http://localhost:8686' : 'https://sweet.sh') + '/' + profileData.username
            }
        } else {
            renderData.metadata = {};
        }

        res.render('user', Object.assign(renderData, {
            layout: req.noLayout ? false : 'main',
            profileData: profileData,
            draftsFirst: req.draftsFirst,
            loggedIn: req.isAuthenticated(),
            loggedInUserData: req.user,
            activePage: profileData.username,
            visibleSidebarArray: ['profileOnly', 'profileAndPosts']
        }));

    });

    app.post("/api/notification/update-by-subject/:subjectid", isLoggedInOrRedirect, async function(req, res) {
        var markedRead = await notifier.markRead(req.user._id, req.params.subjectid);
        socketCity.markNotifsRead(req.user._id, markedRead);
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
            const metadata = await helper.getLinkMetadata(req.body.url, true);
            //when the embed with this data is rendered in a post server-side, handlebars will escape the html characters bc the info is in double-braces,
            //not triple; but for the link preview previews in the browser, we have to escape them here.
            metadata.description = helper.escapeHTMLChars(metadata.description);
            metadata.title = helper.escapeHTMLChars(metadata.title);
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
    } else {
        res.redirect('/');
    }
}
