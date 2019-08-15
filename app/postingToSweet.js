var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
var notifier = require('./notifier.js');
var mongoose = require('mongoose');
var path = require('path');

const url = require('url');

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
var shortid = require('shortid');
const fs = require('fs');
const request = require('request');

// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

module.exports = function(app) {

    //New image upload reciever.
    //Inputs: image data.
    //Outputs: if the image is under the max size for its file type (currently 5 MB for .gifs and 10 MB for .jpgs) it is saved (if it's a .gif),
    //or saved as a 1200 pixel wide jpg with compression level 85 otherwise. Saves to the temp folder; when a post or comment is actually completed,
    //it's moved to the image folder that post images are loaded from upon being displayed. Or isLoggedInOrRedirect redirects you
    app.post("/api/image/v2", isLoggedInOrRedirect, async function(req, res) {
        var imageQualitySettingsArray = {
            'standard': {
                resize: 1200,
                filetype: 'jpg',
                jpegQuality: 85
            },
            'high': {
                resize: 2048,
                filetype: 'png',
                jpegQuality: 95
            },
            'ridiculous': {
                resize: 4096,
                filetype: 'png',
                jpegQuality: 95
            }
        };
        var imageQualitySettings = imageQualitySettingsArray[req.user.settings.imageQuality];
        if (req.files.image) {
            if (req.files.image.size <= 10485760) {
                var sharpImage;
                var imageMeta;
                try {
                    sharpImage = sharp(req.files.image.data);
                    imageMeta = await sharpImage.metadata();
                } catch (err) {
                    console.log("image failed to be loaded by sharp for format determination");
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify({ error: "filetype" }));
                    return;
                }
                var imageFormat = imageMeta.format;
                let imageUrl = shortid.generate();
                if (imageFormat == "gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        fs.writeFile('./cdn/images/temp/' + imageUrl + '.gif', imageData, 'base64', function(err) { //to temp
                            if (err) {
                                return console.log(err);
                            }
                            res.setHeader('content-type', 'text/plain');
                            res.end(JSON.stringify({ url: imageUrl + '.gif' }));
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({ error: "filesize" }));
                    }
                } else if (imageFormat == "jpeg" || imageFormat == "png") {
                    sharpImage = sharpImage.resize({
                        width: imageQualitySettings.resize,
                        withoutEnlargement: true
                    }).rotate();
                    if (imageFormat == "png" && req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.flatten({ background: { r: 255, g: 255, b: 255 } });
                    }
                    if (imageFormat == "jpeg" || req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.jpeg({ quality: imageQualitySettings.jpegQuality })
                        var finalFormat = "jpeg";
                    } else {
                        sharpImage = sharpImage.png();
                        var finalFormat = "png";
                    }

                    //if the image is being rotated according to exif data or a is png with transparency being removed, send the client a thumbnail showing these changes
                    if ((imageMeta.orientation && imageMeta.orientation !== 1) || (imageFormat == "png" && imageMeta.hasAlpha && finalFormat == "jpeg")) {
                        //IN THEORY we should just be able to .clone() sharpImage and operate on the result of that instead of making this new object for the thumbnail, but i'll be damned if i can get that to behave, i get cropped images somehow
                        var thumbnail = sharp(req.files.image.data).resize({ height: 200, withoutEnlargement: true });
                        thumbnail = await (finalFormat == "jpeg" ? thumbnail.rotate().flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg() : thumbnail.rotate().png()).toBuffer();
                    } else {
                        var thumbnail = undefined;
                    }

                    await sharpImage.toFile('./cdn/images/temp/' + imageUrl + '.' + finalFormat) //to temp
                        .catch(err => {
                            console.error("could not temp save uploaded image:")
                            console.error(err);
                        });
                    var response = { url: imageUrl + '.' + finalFormat }
                    if (thumbnail) {
                        response.thumbnail = "data:image/" + finalFormat + ";base64," + thumbnail.toString('base64');
                    }
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify(response));
                } else {
                    console.log("image not a gif or a png or a jpg according to sharp!");
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify({ error: "filetype" }));
                    return;
                }
            } else {
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({ error: "filesize" }));
            }
        }
    })

    //Responds to post requests that inform the server that a post that images were uploaded for will not be posted by deleting those images.
    //Inputs: image file name
    //Outputs: the image presumably in the temp folder with that filename is deleted
    app.post("/cleartempimage", isLoggedInOrErrorResponse, function(req, res) {
        if (req.body.imageURL != "" && !req.body.imageURL.includes("/")) {
            fs.unlink("./cdn/images/temp/" + req.body.imageURL, function(e) {
                if (e) {
                    console.log("could not delete image " + "./cdn/images/temp/" + req.body.imageURL);
                    console.log(e);
                }
            });
        }
    })

    //Responds to post requests that create a new post.
    //Input: in req.body: the post's privacy level, filenames for its images, descriptions for its images, the post body, and a communityid
    //if it's a community post.
    //Outputs: all that stuff is saved as a new post document (with the body of the post parsed to turn urls and tags and @s into links). Or, redirect
    //if not logged in.
    app.post("/createpost", isLoggedInOrRedirect, async function(req, res) {

        var parsedResult = await helper.parseText(JSON.parse(req.body.postContent), req.body.postContentWarnings, true, true, true);

        if (req.body.communityId) {
            var privacy = (await Community.findById(req.body.communityId)).settings.visibility;
        } else {
            var privacy = req.body.postPrivacy;
        }

        for (var inline of parsedResult.inlineElements) {
            if (inline.type == "image(s)") {
                //calling this function also moves the images out of temp storage and saves documents for them in the images collection in the database
                var horizOrVertics = await helper.finalizeImages(inline.images, (req.body.communityId ? "community" : user), req.user._id, privacy, req.user.settings.imageQuality);
                inline.imageIsHorizontal = horizOrVertics.isHorizontal;
                inline.imageIsVertical = horizOrVertics.isVertical;
            }
        }

        newPostUrl = shortid.generate();
        let postCreationTime = new Date();
        var postPrivacy = req.body.postPrivacy;

        if (!(parsedResult.inlineElements.length || parsedResult.text.trim())) { //in case someone tries to make a blank post with a custom ajax post request. storing blank posts = not to spec
            res.status(400).send('bad post op');
            return;
        }

        function savePost() { //todo: combine code for community and non-community posts, there's a lot that's duplicated that doesn't need to be
            //non-community post
            if (!req.body.communityId) {
                var post = new Post({
                    type: 'original',
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: newPostUrl,
                    privacy: postPrivacy,
                    timestamp: postCreationTime,
                    lastUpdated: postCreationTime,
                    rawContent: req.body.postContent,
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(sanitizeHtml(req.body.postContentWarnings, sanitizeHtmlOptions)),
                    imageVersion: 3,
                    inlineElements: parsedResult.inlineElements,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }]
                });

                var newPostId = post._id;
                post.save()
                    .then(async () => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": newPostId }, "$set": { "lastUpdated": postCreationTime } }, { upsert: true, new: true }, function(error, result) { if (error) return });
                        });
                        if (postPrivacy == "private") {
                            console.log("This post is private!")
                            // Make sure to only notify mentioned people if they are trusted
                            Relationship.find({
                                    from: req.user.email,
                                    value: "trust"
                                }, { 'to': 1 })
                                .then((emails) => {
                                    let emailsArray = emails.map(({
                                        to
                                    }) => to)
                                    parsedResult.mentions.forEach(function(mention) {
                                        User.findOne({ username: mention })
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
                        } else if (postPrivacy == "public") {
                            console.log("This post is public!")
                            // This is a public post, notify everyone
                            parsedResult.mentions.forEach(function(mention) {
                                if (mention != req.user.username) { //don't get notified from mentioning yourself
                                    User.findOne({ username: mention })
                                        .then((user) => {
                                            if (user) {
                                                notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                            }
                                        })
                                }
                            });
                        }
                        //the client will now ask for posts just older than this, which means this new post will be right at the top of the response
                        res.status(200).send("" + (postCreationTime.getTime() + 1));
                    })
                    .catch((err) => {
                        console.log("Error creating new post: " + err)
                    });

                //community post
            } else {
                let communityId = req.body.communityId;

                const post = new Post({
                    type: 'community',
                    community: communityId,
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: newPostUrl,
                    privacy: 'public',
                    timestamp: postCreationTime,
                    lastUpdated: postCreationTime,
                    rawContent: req.body.postContent,
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(req.body.postContentWarnings),
                    imageVersion: 3,
                    inlineElements: parsedResult.inlineElements,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }],
                });

                var newPostId = post._id;
                post.save()
                    .then(async () => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": newPostId } }, { upsert: true, new: true }, function(error, result) {
                                if (error) return
                            });
                        });
                        // Notify everyone mentioned that belongs to this community
                        parsedResult.mentions.forEach(function(mention) {
                            if (mention != req.user.username) { //don't get notified from mentioning yourself
                                User.findOne({
                                        username: mention,
                                        communities: { $in: [communityId] }
                                    })
                                    .then((user) => {
                                        notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                    })
                            }
                        });
                        Community.findOneAndUpdate({ _id: communityId }, {
                            $set: { lastUpdated: new Date() }
                        }).then(community => {
                            console.log("Updated community!")
                        })
                        //the client will now ask for posts just older than this, which means this new post will be right at the top of the response
                        res.status(200).send("" + (postCreationTime.getTime() + 1));
                    })
                    .catch((err) => {
                        console.log("Database error when attempting to save new post: " + err)
                    });
            }
        }
        savePost();
    });

    //Responds to requests that delete posts.
    //Inputs: id of post to delete (in req.params)
    //Outputs: delete each image, delete each tag, delete the boosted versions, delete each comment image, delete notifications it caused, delete the post document.
    app.post("/deletepost/:postid", isLoggedInOrRedirect, function(req, res) {
        Post.findOne({ "_id": req.params.postid })
            .then((post) => {

                if (!post.author._id.equals(req.user._id)) {
                    res.status(400).send("you are not the owner of this post which you are attempting to delete. i know how you feel, but this is not allowed");
                    return;
                }

                if (post.imageVersion < 3 || !post.imageVersion) {
                    for (const image of post.images) {
                        if (post.imageVersion == 2) {
                            fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                if (err) console.log("Image deletion error " + err)
                            })
                        } else {
                            fs.unlink(global.appRoot + '/public/images/uploads/' + image, (err) => {
                                if (err) console.log("Image deletion error " + err)
                            })
                        }
                        Image.deleteOne({ "filename": image });
                    }

                } else {
                    for (const ie of post.inlineElements) {
                        if (ie.type == "image(s)") {
                            for (const image of ie.images) {
                                fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                    if (err) console.log("Image deletion error " + err)
                                })
                                Image.deleteOne({ "filename": image });
                            }
                        }
                    }
                }

                // Delete tags (does not currently fix tag last updated time)
                if (post.tags) {
                    post.tags.forEach((tag) => {
                        Tag.findOneAndUpdate({ name: tag }, { $pull: { posts: req.params.postid } })
                            .then((tag) => {
                                console.log("Deleted tag: " + tag)
                            })
                            .catch((err) => {
                                console.log("Database error: " + err)
                            })
                    })
                }

                // Delete boosts
                if (post.type == "original" && post.boosts) {
                    post.boosts.forEach((boost) => {
                        Post.deleteOne({ "_id": boost })
                            .then((boost) => {
                                console.log("Deleted boost: " + boost)
                            })
                            .catch((err) => {
                                console.log("Database error: " + err)
                            })
                    })
                }

                function deleteImagesRecursive(postOrComment) {
                    if (postOrComment.inlineElements && postOrComment.inlineElements.length) {
                        for (const il of postOrComment.inlineElements) {
                            if (il.type == "image(s)") {
                                for (const image of il.images) {
                                    fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                        if (err) console.log("Image deletion error " + err)
                                    });
                                    Image.deleteOne({ "filename": image });
                                }
                            }
                        }
                    } else if (postOrComment.images && postOrComment.images.length) {
                        for (const image of postOrComment.images) {
                            fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                if (err) console.log("Image deletion error " + err)
                            });
                            Image.deleteOne({ "filename": image });
                        }
                    }

                    if (postOrComment.comments && postOrComment.comments.length) {
                        for (var comment of postOrComment.comments) {
                            deleteImagesRecursive(comment);
                        }
                    }
                    if (postOrComment.replies && postOrComment.replies.length) {
                        for (var reply of postOrComment.replies) {
                            deleteImagesRecursive(reply);
                        }
                    }
                }

                deleteImagesRecursive(post);

                // Delete notifications
                User.update({}, {
                        $pull: {
                            notifications: {
                                subjectId: post._id
                            }
                        }
                    }, { multi: true })
                    .then(response => {
                        console.log(response)
                    })
            })
            .then(() => {
                Post.deleteOne({ "_id": req.params.postid })
                    .then(() => {
                        res.sendStatus(200);
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            });
    });

    //Responds to post requests which create a comment.
    //Inputs: comment body, filenames of comment images, descriptions of comment images
    //Outputs: makes the comment document (with the body parsed for urls, tags, and @mentions), embeds a comment document in its post document,
    //moves comment images out of temp. Also, notify the owner of the post, people subscribed to the post, and everyone who was mentioned.
    app.post("/createcomment/:postid/:commentid", isLoggedInOrErrorResponse, async function(req, res) {
        commentTimestamp = new Date();
        var commentId = mongoose.Types.ObjectId();

        var rawContent = sanitize(req.body.commentContent);
        var parsedResult = await helper.parseText(JSON.parse(rawContent), false, true, true, true);

        if (!(parsedResult.inlineElements.length || parsedResult.text.trim())) {
            res.status(400).send('bad post op');
            return;
        }

        var comment = {
            _id: commentId,
            authorEmail: req.user.email,
            author: req.user._id,
            timestamp: commentTimestamp,
            rawContent: rawContent,
            parsedContent: parsedResult.text,
            mentions: parsedResult.mentions,
            tags: parsedResult.tags,
        };

        Post.findOne({ "_id": req.params.postid })
            .populate('author')
            .then(async (post) => {

                if (post.communityId) {
                    var postType = "community";
                    var postPrivacy = (await Community.findById(post.communityId)).settings.visibility;
                } else {
                    var postType = "user";
                    var postPrivacy = post.privacy;
                }

                for (var inline of parsedResult.inlineElements) {
                    if (inline.type == "image(s)") {
                        //calling this function also moves the images out of temp storage and saves documents for them in the images collection in the database
                        var horizOrVertics = await helper.finalizeImages(inline.images, postType, req.user._id, postPrivacy, req.user.settings.imageQuality);
                        inline.imageIsHorizontal = horizOrVertics.isHorizontal;
                        inline.imageIsVertical = horizOrVertics.isVertical;
                    }
                }

                comment.inlineElements = parsedResult.inlineElements;
                var contentHTML = await helper.renderHTMLContent(comment)
                comment.cachedHTML = {fullContentHTML: contentHTML};

                numberOfComments = 0;
                var depth = undefined;
                commentParent = false;
                if (req.params.commentid == 'undefined') {
                    depth = 1;
                    // This is a top level comment with no parent (identified by commentid)
                    post.comments.push(comment);

                    // Count total comments
                    function countComments(array) {
                        array.forEach((element) => {
                            if (!element.deleted) {
                                numberOfComments++;
                            }
                            if (element.replies) {
                                var replies = countComments(element.replies)
                                if (replies) {
                                    return replies;
                                }
                            }
                        })
                        return numberOfComments;
                    }
                    post.numberOfComments = countComments(post.comments);
                } else {
                    // This is a child level comment so we have to drill through the comments
                    // until we find it
                    commentParent = undefined;

                    function findNested(array, id, depthSoFar = 2) {
                        var foundElement = false;
                        array.forEach((element) => {
                            if (element._id && element._id.equals(id)) {
                                if (depthSoFar > 5) {
                                    res.status(403).send(">:^(");
                                    return undefined;
                                } else {
                                    depth = depthSoFar;
                                    element.replies.push(comment);
                                    foundElement = element;
                                    commentParent = element;
                                }
                            }
                            if (!element.deleted) {
                                numberOfComments++;
                            }
                            if (element.replies) {
                                var found = findNested(element.replies, id, depthSoFar + 1)
                                if (found) {
                                    foundElement = element;
                                    commentParent = element;
                                    return found;
                                }
                            }
                        })
                        return foundElement;
                    }
                    var target = findNested(post.comments, req.params.commentid);
                    if (target) {
                        post.numberOfComments = numberOfComments;
                    }
                }
                if (!depth) {
                    //if depth was left undefined then it was found to be invalid (i.e. > 5), let's get out of here
                    return;
                }
                var postPrivacy = post.privacy;
                post.lastUpdated = new Date();
                // Add user to subscribed users for post
                if ((!post.author._id.equals(req.user._id) && post.subscribedUsers.includes(req.user._id.toString()) === false)) { // Don't subscribe to your own post, or to a post you're already subscribed to
                    post.subscribedUsers.push(req.user._id.toString());
                }
                post.save()
                    .then(async () => {

                        //Notify any and all interested parties
                        User.findOne({ _id: post.author })
                            .then((originalPoster) => {
                                //remove duplicates from subscribed/unsubscribed users
                                subscribedUsers = post.subscribedUsers.filter((v, i, a) => a.indexOf(v) === i);
                                unsubscribedUsers = post.unsubscribedUsers.filter((v, i, a) => a.indexOf(v) === i);

                                //NOTIFY EVERYONE WHO IS MENTIONED

                                //we're never going to notify the author of the comment about them mentioning themself
                                workingMentions = parsedResult.mentions.filter(m => m != req.user.username);

                                if (post.type == "community") {
                                    workingMentions.forEach(function(mentionedUsername) {
                                        User.findOne({
                                            username: mentionedUsername
                                        }).then((mentionedUser) => {
                                            //within communities: notify the mentioned user if this post's community is one they belong to
                                            if (mentionedUser.communities.some(c => c.toString() == post.community.toString())) {
                                                notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                            }
                                        }).catch(err => {
                                            console.log("could not find document for mentioned user " + mentionedUsername + ", error:");
                                            console.log(err);
                                        })
                                    })
                                } else {
                                    if (postPrivacy == "private") {
                                        workingMentions.forEach(mentionedUsername => {
                                            User.findOne({
                                                username: mentionedUsername
                                            }).then(mentionedUser => {
                                                // Make sure to only notify mentioned people if they are trusted by the post's author (and can therefore see the post).
                                                // The post's author is implicitly trusted by the post's author
                                                if (mentionedUser._id.equals(originalPoster._id)) {
                                                    notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                    return; //no need to go down there and check for relationships and stuff
                                                }
                                                Relationship.findOne({
                                                    fromUser: originalPoster._id,
                                                    toUser: mentionedUser._id,
                                                    value: "trust"
                                                }, {
                                                    _id: 1
                                                }).then(theRelationshipExists => {
                                                    if (theRelationshipExists) {
                                                        notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                    }
                                                })
                                            }).catch(err => {
                                                console.log("could not find document for mentioned user " + mention + ", error:");
                                                console.log(err);
                                            })
                                        })
                                    } else if (postPrivacy == "public") {
                                        workingMentions.forEach(function(mention) {
                                            User.findOne({
                                                    username: mention
                                                })
                                                .then((mentionedGuy) => {
                                                    //notify everyone
                                                    notifier.notify('user', 'mention', mentionedGuy._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                }).catch(err => {
                                                    console.log("could not find document for mentioned user " + mention + ", error:");
                                                    console.log(err);
                                                })
                                        });
                                    }
                                }

                                // NOTIFY THE POST'S AUTHOR
                                // Author doesn't need to know about their own comments, and about replies on your posts they're not subscribed to, and if they're @ed they already got a notification above
                                if (!originalPoster._id.equals(req.user._id) && (post.unsubscribedUsers.includes(originalPoster._id.toString()) === false) && (!parsedResult.mentions.includes(originalPoster.username))) {
                                    console.log("Notifying post author of a reply")
                                    notifier.notify('user', 'reply', originalPoster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url + '#comment-' + comment._id, 'post')
                                }

                                // NOTIFY THE PARENT COMMENT'S AUTHOR
                                // Author doesn't need to know about their own child comments, and about replies on your posts they're not subscribed to, and if they're @ed they already got a notification above, and if they're the post's author as well as the parent comment's author (they got a notification above for that too)
                                // First check if this comment even HAS a parent
                                if (commentParent) {
                                    parentCommentAuthor = commentParent.author;
                                    if (!parentCommentAuthor._id.equals(req.user._id) &&
                                        (post.unsubscribedUsers.includes(parentCommentAuthor._id.toString()) === false) &&
                                        (!parsedResult.mentions.includes(parentCommentAuthor.username)) &&
                                        (!originalPoster._id.equals(parentCommentAuthor._id))) {
                                        console.log("Notifying parent comment author of a reply")
                                        notifier.notify('user', 'commentReply', parentCommentAuthor._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url + '#comment-' + commentParent._id, 'post')
                                    }
                                }

                                //NOTIFY PEOPLE WHO BOOSTED THE POST
                                if (post.boostsV2.length > 0) {
                                    var boosterIDs = [];
                                    post.populate('boostV2.booster', (err, populatedPost) => {
                                        if (err) {
                                            console.log('could not notify people who boosted post ' + post._id.toString() + " of a recent reply:");
                                            console.log(err);
                                        } else {
                                            populatedPost.boostsV2.forEach(boost => {
                                                boosterIDs.push(boost.booster._id.toString());
                                                //make sure we're not notifying the person who left the comment (this will be necessary if they left it on their own boosted post)
                                                //and make sure we're not notifying the post's author (necessary if they boosted their own post) (they'll have gotten a notification above)
                                                //and make sure we're not notifying anyone who was @ed (they'll have gotten a notification above),
                                                //or anyone who unsubscribed from the post
                                                if (!boost.booster._id.equals(req.user._id) &&
                                                    !boost.booster._id.equals(originalPoster._id) &&
                                                    !parsedResult.mentions.includes(boost.booster.username) &&
                                                    !post.unsubscribedUsers.includes(boost.booster._id.toString())) {
                                                    notifier.notify('user', 'boostedPostReply', boost.booster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                }
                                            })
                                        }
                                        //if there are boosters, we notify the other "subscribers" here, because here we have the full list of
                                        //boosters and can check the subscribers against it before notifying them
                                        var workingSubscribers = post.subscribedUsers.filter(u => !boosterIDs.includes(u));
                                        notifySubscribers(workingSubscribers);
                                    })
                                }

                                //NOTIFY THE OTHER SUBSCRIBERS (PEOPLE WHO WERE MENTIONED IN THE ORGINAL POST AND THOSE WHO COMMENTED ON IT)

                                //if there are boosts for this post, this was called a few lines up from here. otherwise, we do it now
                                if (post.boostsV2.length === 0) {
                                    notifySubscribers(post.subscribedUsers)
                                }

                                //checks each subscriber for trustedness if this is a private post, notifies all of 'em otherwise
                                function notifySubscribers(subscriberList) {
                                    if (postPrivacy == "private") {
                                        subscriberList.forEach(subscriberID => {
                                            Relationship.findOne({
                                                fromUser: originalPoster._id,
                                                toUser: subscriberID,
                                                value: "trust"
                                            }, {
                                                _id: 1
                                            }).then(theRelationshipExists => {
                                                if (theRelationshipExists) {
                                                    notifySubscriber(subscriberID);
                                                }
                                            })
                                        })
                                    } else {
                                        subscriberList.forEach(subscriberID => {
                                            notifySubscriber(subscriberID);
                                        })
                                    }
                                }

                                function notifySubscriber(subscriberID) {
                                    if ((subscriberID != req.user._id.toString()) // Do not notify the comment's author about the comment
                                        &&
                                        (subscriberID != originalPoster._id.toString()) //don't notify the post's author (because they get a different notification, above)
                                        &&
                                        (post.unsubscribedUsers.includes(subscriberID) === false) //don't notify unsubscribed users
                                        &&
                                        (commentParent ? subscriberID != parentCommentAuthor._id.toString() : true) // don't notify parent comment author, if it's a child comment (because they get a different notification, above)
                                    ) {
                                        console.log("Notifying subscribed user");
                                        User.findById(subscriberID).then((subscriber) => {
                                            if (!parsedResult.mentions.includes(subscriber.username)) { //don't notify people who are going to be notified anyway bc they're mentioned in the new comment
                                                if (post.mentions.includes(subscriber.username)) {
                                                    notifier.notify('user', 'mentioningPostReply', subscriberID, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                } else {
                                                    notifier.notify('user', 'subscribedReply', subscriberID, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                }
                                            }
                                        }).catch(err => {
                                            console.log("could not find subscribed user " + subscriberID + ", error:")
                                            console.log(err);
                                        })
                                    }
                                }

                            }).catch(err => {
                                console.log("can't find author of commented-upon post, error:");
                                console.log(err);
                            })

                        if (req.user.imageEnabled) {
                            var image = req.user.image
                        } else {
                            var image = 'cake.svg'
                        }
                        if (req.user.displayName) {
                            var name = '<span class="author-display-name"><a href="/' + req.user.username + '">' + req.user.displayName + '</a></span><span class="author-username">@' + req.user.username + '</span>';
                        } else {
                            var name = '<span class="author-username"><a href="/' + req.user.username + '">@' + req.user.username + '</a></span>';
                        }

                        hbs.render('./views/partials/comment_dynamic.handlebars', {
                                image: image,
                                name: name,
                                username: req.user.username,
                                timestamp: moment(commentTimestamp).fromNow(),
                                content: contentHTML,
                                comment_id: commentId.toString(),
                                post_id: post._id.toString(),
                                depth: depth
                            })
                            .then(async html => {
                                var result = {
                                    comment: html
                                }
                                res.contentType('json');
                                res.send(JSON.stringify(result));
                            })
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            })
    });

    //Responds to post requests that delete comments.
    //Input: postid and commentid.
    //Output: deletes each of the comment's images and removes the comment's document from the post. Then, updates the post's lastUpdated field to be
    //that of the new most recent comment's (or the time of the post's creation if there are no comments left) with the relocatePost function. Also
    //updates numberOfComments.
    app.post("/deletecomment/:postid/:commentid", isLoggedInOrRedirect, function(req, res) {
        Post.findOne({ "_id": req.params.postid })
            .then((post) => {
                commentsByUser = 0;
                latestTimestamp = 0;
                numberOfComments = 0;

                function findNested(array, id, parent) {
                    var foundElement;
                    var parentElement = (parent ? parent : post)
                    array.forEach((element) => {
                        if (!element.deleted) {
                            numberOfComments++;
                        }
                        if ((element.author.toString() == req.user._id.toString()) && !element.deleted) {
                            commentsByUser++;
                        }
                        if (element.timestamp > latestTimestamp) {
                            latestTimestamp = element.timestamp;
                        }
                        element.numberOfSiblings = (parent ? parentElement.replies.length - 1 : post.comments.length - 1);
                        element.parent = parentElement;
                        if (element._id && element._id.equals(id)) {
                            foundElement = element;
                            commentsByUser--;
                            numberOfComments--;
                            console.log('numberOfComments', numberOfComments)
                        }
                        if (element.replies) {
                            var found = findNested(element.replies, id, element)
                            if (found) {
                                foundElement = found;
                            }
                        }
                    })
                    return foundElement;
                }

                var target = findNested(post.comments, req.params.commentid);
                if (target) {
                    post.numberOfComments = numberOfComments;
                }

                //i'll be impressed if someone trips this one, comment ids aren't displayed for comments that the logged in user didn't make
                if (!target.author.equals(req.user._id) && post.author.toString() != req.user._id.toString()) {
                    res.status(400).send("you do not appear to be who you would like us to think that you are! this comment ain't got your brand on it");
                    return;
                }

                if (target.images && target.images.length) {
                    for (const image of target.images) {
                        fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                            if (err) console.log("Image deletion error " + err)
                        })
                        Image.deleteOne({ "filename": image });
                    }
                } else if (target.inlineElements && target.inlineElements.length) {
                    for (const ie of target.inlineElements) {
                        if (ie.type == "image(s)") {
                            for (const image of ie.images) {
                                fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                    if (err) console.log("Image deletion error " + err)
                                })
                                Image.deleteOne({ "filename": image });
                            }
                        }
                    }
                }

                // Check if target has children
                if (target.replies && target.replies.length) {
                    // We feel sorry for the children - just wipe the target's memory
                    target.parsedContent = "";
                    target.rawContent = "";
                    target.deleted = true;
                } else {
                    // There are no children, the target can be destroyed
                    target.remove();
                    if (target.numberOfSiblings == 0 && target.parent.deleted) {
                        // There are also no siblings, and the element's parent
                        // has been deleted, so we can even destroy that!
                        target.parent.remove();
                    }
                }

                post.save()
                    .then((comment) => {
                        // todo: check if post's lastUpdated is changed somewhere? relocatePost(ObjectId(req.params.postid))?
                        post.lastUpdated = latestTimestamp;
                        //unsubscribe the author of the deleted comment from the post if they have no other comments on it
                        if (commentsByUser == 0) {
                            post.subscribedUsers = post.subscribedUsers.filter((v, i, a) => {
                                return v != req.user._id.toString();
                            })
                            post.save().catch(err => {
                                console.error(err)
                            })
                        }
                        // if (!target.some((v, i, a) => {
                        //         return v.author.toString() == req.user._id.toString();
                        //     })) {
                        //     post.subscribedUsers = post.subscribedUsers.filter((v, i, a) => {
                        //         return v != req.user._id.toString();
                        //     })
                        //     post.save().catch(err => {
                        //         console.error(err)
                        //     })
                        // }
                        result = {
                            numberOfComments: numberOfComments
                        }
                        res.contentType('json').send(JSON.stringify(result));
                    })
                    .catch((error) => {
                        console.error(error)
                    })
            })
            .catch((err) => {
                console.log("Database error: " + err)
            })
    });

    //Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/createboost/:postid', isLoggedInOrRedirect, function(req, res) {
        boostedTimestamp = new Date();
        Post.findOne({
                '_id': req.params.postid
            }, {
                boostsV2: 1,
                lastUpdated: 1,
                privacy: 1,
                unsubscribedUsers: 1,
                author: 1,
                url: 1
            }).populate('author')
            .then((boostedPost) => {
                if (boostedPost.privacy != "public" || boostedPost.type == 'community') {
                    res.status(400).send("post is not public and therefore may not be boosted");
                    return;
                }
                var boost = new Post({
                    type: 'boost',
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: shortid.generate(),
                    privacy: 'public',
                    timestamp: boostedTimestamp,
                    lastUpdated: boostedTimestamp,
                    //add field back to schema so this works
                    boostTarget: boostedPost._id
                })
                boost.save().then(savedBoost => {
                    const boost = {
                        booster: req.user._id,
                        timestamp: boostedTimestamp,
                        boost: savedBoost._id
                    }
                    boostedPost.boostsV2 = boostedPost.boostsV2.filter(boost => {
                        return !boost.booster.equals(req.user._id)
                    })
                    boostedPost.boostsV2.push(boost);

                    // don't think so
                    //boostedPost.subscribedUsers.push(req.user._id.toString());

                    boostedPost.save().then(() => {
                        //don't notify the original post's author if they're creating the boost or are unsubscribed from this post
                        if (!boostedPost.unsubscribedUsers.includes(boostedPost.author._id.toString()) && !boostedPost.author._id.equals(req.user._id)) {
                            notifier.notify('user', 'boost', boostedPost.author._id, req.user._id, null, '/' + boostedPost.author.username + '/' + boostedPost.url, 'post')
                        }
                        res.redirect("back");
                    })
                })
            })
    })

    //Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/removeboost/:postid', isLoggedInOrRedirect, function(req, res) {
        Post.findOne({
                '_id': req.params.postid
            }, {
                boostsV2: 1,
                privacy: 1,
                author: 1,
                url: 1,
                timestamp: 1
            })
            .then((boostedPost) => {
                var boost = boostedPost.boostsV2.find(b => {
                    return b.booster.equals(req.user._id)
                });
                boostedPost.boostsV2 = boostedPost.boostsV2.filter(boost => {
                    return !boost.booster.equals(req.user._id)
                })
                Post.deleteOne({
                    _id: boost.boost
                }, function() {
                    console.log('delete')
                });
                boostedPost.save().then(() => {
                    res.redirect("back");
                })
            })
    })

    app.post('/createposteditor/:postid', isLoggedInOrRedirect, function(req, res) {

        isCommunityPost = false;

        Post.findOne({
            _id: req.params.postid
        })
        .then(async post => {
            if (post.author.equals(req.user._id)){
                // This post has been written by the logged in user - we good
                if (post.type == 'community') {
                    isCommunityPost = true;
                }
                var content = await helper.renderHTMLContent(post,true);
                hbs.render('./views/partials/posteditormodal.handlebars', {
                    contentWarnings: post.contentWarnings,
                    privacy: post.privacy,
                    isCommunityPost: isCommunityPost,
                    postID: post._id.toString()
                })
                .then(async html => {
                    var result = {
                        editor: html,
                        content: content
                    }
                    res.contentType('json');
                    res.send(JSON.stringify(result));
                })
            }
            else {
                res.send('Hold up there scout')
            }
        })
    })
};

function cleanTempFolder() {
    fs.readdir("./cdn/images/temp", function(err, files) {
        files.forEach(file => {
            if (file != ".gitkeep" && file != "") {
                fs.stat("./cdn/images/temp/" + file, function(err, s) {
                    if (Date.now() - s.mtimeMs > 3600000) {
                        fs.unlink("./cdn/images/temp/" + file, function(e) {
                            if (e) {
                                console.log("couldn't clean temp file " + file);
                                console.log(e);
                            }
                        })
                    }
                })
            }
        });
    });
    setTimeout(cleanTempFolder, 3600000);
}

setTimeout(cleanTempFolder, 3600000); //clean temp image folder every hour

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
    //next('route'); don't want this! the request has been handled by the redirect, we don't need to do anything else with it in another route
}

//For post requests where the jQuery code making the request will handle the response
function isLoggedInOrErrorResponse(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.send('nope');
    //next('route'); don't want this! the request has been handled by the error response, we don't need to do anything else with it in another route
}
