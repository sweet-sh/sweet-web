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

module.exports = function (app) {

    //New image upload reciever.
    //Inputs: image data.
    //Outputs: if the image is under the max size for its file type (currently 5 MB for .gifs and 10 MB for .jpgs) it is saved (if it's a .gif),
    //or saved as a 1200 pixel wide jpg with compression level 85 otherwise. Saves to the temp folder; when a post or comment is actually completed,
    //it's moved to the image folder that post images are loaded from upon being displayed. Or isLoggedInOrRedirect redirects you
    app.post("/api/image/v2", isLoggedInOrRedirect, async function (req, res) {
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
                    res.end(JSON.stringify({
                        error: "filetype"
                    }));
                    return;
                }
                var imageFormat = imageMeta.format;
                let imageUrl = shortid.generate();
                if (imageFormat == "gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        console.log(imageUrl + '.gif');
                        fs.writeFile('./cdn/images/temp/' + imageUrl + '.gif', imageData, 'base64', function (err) { //to temp
                            if (err) {
                                return console.log(err);
                            }
                            res.setHeader('content-type', 'text/plain');
                            res.end(JSON.stringify({
                                url: imageUrl + '.gif',
                            }));
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({
                            error: "filesize"
                        }));
                    }
                } else if (imageFormat == "jpeg" || imageFormat == "png") {
                    sharpImage = sharpImage.resize({
                            width: imageQualitySettings.resize,
                            withoutEnlargement: true
                        })
                        .rotate();
                    if (imageFormat == "png" && req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.flatten({
                            background: {
                                r: 255,
                                g: 255,
                                b: 255
                            }
                        });
                    }
                    if (imageFormat == "jpeg" || req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.jpeg({
                            quality: imageQualitySettings.jpegQuality
                        })
                    } else {
                        sharpImage = sharpImage.png();
                    }
                    sharpImage.toFile('./cdn/images/temp/' + imageUrl + '.' + imageFormat) //to temp
                        .then(image => {
                            res.setHeader('content-type', 'text/plain');
                            res.end(JSON.stringify({
                                url: imageUrl + '.' + imageFormat,
                            }));
                        })
                        .catch(err => {
                            console.error("could not temp save uploaded image:")
                            console.error(err);
                        });

                } else {
                    console.log("image not a gif or a png or a jpg according to sharp!");
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify({
                        error: "filetype"
                    }));
                    return;
                }
            } else {
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({
                    error: "filesize"
                }));
            }
        }
    })

    //Responds to post requests that inform the server that a post that images were uploaded for will not be posted by deleting those images.
    //Inputs: image file name
    //Outputs: the image presumably in the temp folder with that filename is deleted
    app.post("/cleartempimage", isLoggedInOrErrorResponse, function (req, res) {
        if (req.body.imageURL != "" && !req.body.imageURL.includes("/")) {
            fs.unlink("./cdn/images/temp/" + req.body.imageURL, function (e) {
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
    app.post("/createpost", isLoggedInOrRedirect, async function (req, res) {

        newPostUrl = shortid.generate();
        let postCreationTime = new Date();
        var postPrivacy = req.body.postPrivacy;
        var postImages = JSON.parse(req.body.postImageURL).slice(0, 4); //in case someone sends us more with custom ajax request
        var postImageDescriptions = JSON.parse(req.body.postImageDescription).slice(0, 4);
        var postImageQuality = req.user.settings.imageQuality;

        var imageIsVertical = [];
        for (image of postImages) {
            if (fs.existsSync(path.resolve('./cdn/images/temp/' + image))) {
                var metadata = await sharp(path.resolve('./cdn/images/temp/' + image)).metadata();
                imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? "vertical-image" : "");
            } else {
                console.log("image " + path.resolve('./cdn/images/temp/' + image) + " not found! Oh no")
                imageIsVertical.push("");
            }
        }

        if (!(postImages || parsedResult)) { //in case someone tries to make a blank post with a custom ajax post request. storing blank posts = not to spec
            res.status(400).send('bad post op');
            return;
        }

        var rawContent = sanitize(req.body.postContent);
        rawContent = sanitizeHtml(rawContent, {
            allowedTags: ['blockquote', 'ul', 'li', 'i', 'b', 'strong', 'a', 'p'],
            allowedAttributes: {
                'a': ['href']
            }
        });
        var parsedResult = helper.parseText(rawContent, req.body.postContentWarnings);

        function savePost(linkPreviewEnabled, linkPreviewMetadata) {
            // if (linkPreviewEnabled) {
            //     linkPreview = {
            //         url: linkPreviewMetadata.url,
            //         domain: url.parse(linkPreviewMetadata.url).hostname,
            //         title: linkPreviewMetadata.title,
            //         description: linkPreviewMetadata.description,
            //         image: linkPreviewMetadata.image,
            //     }
            // } else {
            //     linkPreview = {};
            // }
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
                    rawContent: rawContent,
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(sanitizeHtml(req.body.postContentWarnings, sanitizeHtmlOptions)),
                    imageVersion: 2,
                    images: postImages,
                    imageDescriptions: postImageDescriptions,
                    imageIsVertical: imageIsVertical,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }]
                    // linkPreview: linkPreview
                });

                // Parse images
                if (postImages) {
                    postImages.forEach(function (imageFileName) {
                        if (imageFileName) {
                            fs.renameSync("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                                if (e) {
                                    console.log("could not move " + imageFileName + " out of temp");
                                    console.log(e);
                                }
                            }) //move images out of temp storage
                            sharp('./cdn/images/' + imageFileName).metadata().then(metadata => {
                                image = new Image({
                                    context: "user",
                                    filename: imageFileName,
                                    privacy: postPrivacy,
                                    user: req.user._id,
                                    quality: postImageQuality,
                                    height: metadata.height,
                                    width: metadata.width
                                })
                                image.save();
                            })
                        }
                    });
                }
                var newPostId = post._id;
                post.save()
                    .then(() => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({
                                name: tag
                            }, {
                                "$push": {
                                    "posts": newPostId
                                },
                                "$set": {
                                    "lastUpdated": postCreationTime
                                }
                            }, {
                                upsert: true,
                                new: true
                            }, function (error, result) {
                                if (error) return
                            });
                        });
                        if (postPrivacy == "private") {
                            console.log("This post is private!")
                            // Make sure to only notify mentioned people if they are trusted
                            Relationship.find({
                                    from: req.user.email,
                                    value: "trust"
                                }, {
                                    'to': 1
                                })
                                .then((emails) => {
                                    let emailsArray = emails.map(({
                                        to
                                    }) => to)
                                    parsedResult.mentions.forEach(function (mention) {
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
                        } else if (postPrivacy == "public") {
                            console.log("This post is public!")
                            // This is a public post, notify everyone
                            parsedResult.mentions.forEach(function (mention) {
                                if (mention != req.user.username) { //don't get notified from mentioning yourself
                                    User.findOne({
                                            username: mention
                                        })
                                        .then((user) => {
                                            notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                        })
                                }
                            });
                        }
                        res.redirect('back');
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
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
                    rawContent: rawContent,
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(req.body.postContentWarnings),
                    imageVersion: 2,
                    images: postImages,
                    imageDescriptions: postImageDescriptions,
                    imageIsVertical: imageIsVertical,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }],
                    // linkPreview: linkPreview
                });

                // Parse images
                if (postImages) {
                    postImages.forEach(function (imageFileName) {
                        fs.rename("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                            if (e) {
                                console.log("could not move " + imageFileName + " out of temp");
                                console.log(e);
                            }
                        }) //move images out of temp storage
                        Community.findOne({
                                _id: communityId
                            })
                            .then(community => {
                                image = new Image({
                                    context: "community",
                                    filename: imageFileName,
                                    privacy: community.settings.visibility,
                                    user: req.user._id,
                                    community: communityId
                                })
                                image.save();
                            })
                    });
                }
                var newPostId = post._id;
                post.save()
                    .then(() => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({
                                name: tag
                            }, {
                                "$push": {
                                    "posts": newPostId
                                }
                            }, {
                                upsert: true,
                                new: true
                            }, function (error, result) {
                                if (error) return
                            });
                        });
                        // Notify everyone mentioned that belongs to this community
                        parsedResult.mentions.forEach(function (mention) {
                            if (mention != req.user.username) { //don't get notified from mentioning yourself
                                User.findOne({
                                        username: mention,
                                        communities: {
                                            $in: [communityId]
                                        }
                                    })
                                    .then((user) => {
                                        notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                    })
                            }
                        });
                        Community.findOneAndUpdate({
                            _id: communityId
                        }, {
                            $set: {
                                lastUpdated: new Date()
                            }
                        }).then(community => {
                            console.log("Updated community!")
                        })
                        res.redirect('back');
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            }
        }

        //get link preview for first link in content
        // contentURLMatch = parsedResult.text.match(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/);
        // if (contentURLMatch) {
        //     contentURL = contentURLMatch[2]
        //     got(contentURL)
        //     .then(({ body: html, url }) => {
        //         metascraper({ html, url })
        //             .then(metadata => {
        //                 savePost(true, metadata);
        //         })
        //     })
        // } else {
        //     savePost(false);
        // }
        savePost();
    });

    //Responds to requests that delete posts.
    //Inputs: id of post to delete (in req.params)
    //Outputs: delete each image, delete each tag, delete the boosted versions, delete each comment image, delete notifications it caused, delete the post document.
    app.post("/deletepost/:postid", isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                "_id": req.params.postid
            })
            .then((post) => {

                if (!post.author._id.equals(req.user._id)) {
                    res.status(400).send("you are not the owner of this post which you are attempting to delete. i know how you feel, but this is not allowed");
                    return;
                }

                // Delete images
                post.images.forEach((image) => {
                    if (post.imageVersion === 2) {
                        fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                            if (err) console.log("Image deletion error " + err)
                        })
                    } else {
                        fs.unlink(global.appRoot + '/public/images/uploads/' + image, (err) => {
                            if (err) console.log("Image deletion error " + err)
                        })
                    }
                    Image.deleteOne({
                        "filename": image
                    })
                })

                // Delete tags (does not currently fix tag last updated time)
                post.tags.forEach((tag) => {
                    Tag.findOneAndUpdate({
                            name: tag
                        }, {
                            $pull: {
                                posts: req.params.postid
                            }
                        })
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
                        Post.deleteOne({
                                "_id": boost
                            })
                            .then((boost) => {
                                console.log("Deleted boost: " + boost)
                            })
                            .catch((err) => {
                                console.log("Database error: " + err)
                            })
                    })
                }

                //delete comment images
                post.comments.forEach((comment) => {
                    if (comment.images) {
                        comment.images.forEach((image) => {
                            fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                if (err) console.log("Image deletion error " + err)
                            });
                            Image.deleteOne({
                                "filename": image
                            });
                        })
                    }
                });

                // Delete notifications
                User.update({}, {
                        $pull: {
                            notifications: {
                                subjectId: post._id
                            }
                        }
                    }, {
                        multi: true
                    })
                    .then(response => {
                        console.log(response)
                    })
            })
            .catch((err) => {
                console.log("Database error: " + err)
            })
            .then(() => {
                Post.deleteOne({
                        "_id": req.params.postid
                    })
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
    app.post("/createcomment/:postid/:commentid", isLoggedInOrErrorResponse, async function (req, res) {
        commentTimestamp = new Date();
        var commentId = mongoose.Types.ObjectId();
        let postImages = JSON.parse(req.body.imageUrls).slice(0, 4); //in case someone tries to send us more images than 4
        let imageDescriptions = JSON.parse(req.body.imageDescs).slice(0, 4); // ditto

        var imageIsVertical = [];
        for (image of postImages) {
            if (fs.existsSync(path.resolve('./cdn/images/temp/' + image))) {
                var metadata = await sharp(path.resolve('./cdn/images/temp/' + image)).metadata();
                imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? "vertical-image" : "");
            } else {
                console.log("image " + path.resolve('./cdn/images/temp/' + image) + " not found! Oh no")
                imageIsVertical.push("");
            }
        }

        var rawContent = sanitize(req.body.commentContent);
        rawContent = sanitizeHtml(rawContent, {
            allowedTags: ['blockquote', 'ul', 'li', 'i', 'b', 'strong', 'a', 'p'],
            allowedAttributes: {
                'a': ['href']
            }
        });
        var parsedResult = helper.parseText(rawContent);

        if (!(postImages || parsedResult.text)) { //in case someone tries to make a blank comment with a custom ajax post request. storing blank comments = not to spec
            res.status(400).send('bad post op');
            return;
        }

        const comment = {
            _id: commentId,
            authorEmail: req.user.email,
            author: req.user._id,
            timestamp: commentTimestamp,
            rawContent: rawContent,
            parsedContent: parsedResult.text,
            mentions: parsedResult.mentions,
            tags: parsedResult.tags,
            images: postImages,
            imageDescriptions: imageDescriptions,
            imageIsVertical: imageIsVertical
        };

        Post.findOne({
                "_id": req.params.postid
            })
            .populate('author')
            .then((post) => {
                numberOfComments = 0;
                var depth = undefined;
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
                                }
                            }
                            if (!element.deleted) {
                                numberOfComments++;
                            }
                            if (element.replies) {
                                var found = findNested(element.replies, id, depthSoFar + 1)
                                if (found) {
                                    foundElement = element;
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
                postPrivacy = post.privacy;
                post.lastUpdated = new Date();
                // Add user to subscribed users for post
                if ((!post.author._id.equals(req.user._id) && post.subscribedUsers.includes(req.user._id.toString()) === false)) { // Don't subscribe to your own post, or to a post you're already subscribed to
                    post.subscribedUsers.push(req.user._id.toString());
                }
                post.save()
                    .then(async () => {
                        // Parse images
                        if (postImages) {
                            postImages.forEach(function (imageFileName) {
                                if (imageFileName) {
                                    fs.rename("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                                        if (e) {
                                            console.log("could not move " + imageFileName + " out of temp");
                                            console.log(e);
                                        }
                                    }) //move images out of temp storage
                                    image = new Image({
                                        context: "user",
                                        filename: imageFileName,
                                        privacy: post.privacy,
                                        user: req.user._id
                                    })
                                    image.save();
                                }
                            });
                        }

                        //Notify any and all interested parties
                        User.findOne({
                                _id: post.author
                            })
                            .then((originalPoster) => {
                                //remove duplicates from subscribed/unsubscribed users
                                subscribedUsers = post.subscribedUsers.filter((v, i, a) => a.indexOf(v) === i);
                                unsubscribedUsers = post.unsubscribedUsers.filter((v, i, a) => a.indexOf(v) === i);

                                //NOTIFY EVERYONE WHO IS MENTIONED

                                //we're never going to notify the author of the comment about them mentioning themself
                                workingMentions = parsedResult.mentions.filter(m => m != req.user.username);

                                if (post.type == "community") {
                                    workingMentions.forEach(function (mentionedUsername) {
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
                                        workingMentions.forEach(function (mention) {
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
                                    notifier.notify('user', 'reply', originalPoster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
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
                            image = req.user.image
                        } else {
                            image = 'cake.svg'
                        }
                        if (req.user.displayName) {
                            name = '<span class="author-display-name"><a href="/' + req.user.username + '">' + req.user.displayName + '</a></span><span class="author-username">@' + req.user.username + '</span>';
                        } else {
                            name = '<span class="author-username"><a href="/' + req.user.username + '">@' + req.user.username + '</a></span>';
                        }

                        classNames = ['one-image', 'two-images', 'three-images', 'four-images'];
                        let commentImageGallery = function () {
                            html = '<div class="post-images ' + classNames[postImages.length - 1] + '">';
                            for (let i = 0; i < postImages.length; i++) {
                                html += ('<a href="/api/image/display/' + postImages[i] + '">') + '<img alt="' + imageDescriptions[i] + ' (posted by ' + req.user.username + ')" class="post-single-image" src="/api/image/display/' + postImages[i] + '" ' + '</a>';
                            }
                            html += (postImages.length > 0 ? '</div>' : '');
                            html += '</div></div>';
                            return html;
                        }
                        var fullImageUrls = []
                        for (img of postImages) {
                            fullImageUrls.push("/api/image/display/" + img);
                        }
                        commentHtml = hbs.render('./views/partials/comment_dynamic.handlebars', {
                                image: image,
                                name: name,
                                username: req.user.username,
                                timestamp: moment(commentTimestamp).fromNow(),
                                content: parsedResult.text,
                                comment_id: commentId.toString(),
                                post_id: post._id.toString(),
                                image_gallery: await hbs.render('./views/partials/imagegallery.handlebars', {
                                    images: fullImageUrls,
                                    post_id: commentId.toString(),
                                    imageDescriptions: imageDescriptions,
                                    imageIsVertical: imageIsVertical,
                                    author: {
                                        username: req.user.username
                                    }
                                }),
                                depth: depth
                            })
                            .then(html => {
                                result = {
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
    app.post("/deletecomment/:postid/:commentid", isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                "_id": req.params.postid
            })
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

                target.images.forEach((image) => {
                    fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                        if (err) console.log("Image deletion error " + err)
                    })
                    Image.deleteOne({
                        "filename": image
                    })
                })

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
                        // relocatePost(ObjectId(req.params.postid));
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
    app.post('/createboost/:postid', isLoggedInOrRedirect, function (req, res) {
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
    app.post('/removeboost/:postid', isLoggedInOrRedirect, function (req, res) {
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
                }, function () {
                    console.log('delete')
                });
                boostedPost.save().then(() => {
                    res.redirect("back");
                })
            })
    })
};

function cleanTempFolder() {
    fs.readdir("./cdn/images/temp", function (err, files) {
        files.forEach(file => {
            if (file != ".gitkeep" && file != "") {
                fs.stat("./cdn/images/temp/" + file, function (err, s) {
                    if (Date.now() - s.mtimeMs > 3600000) {
                        fs.unlink("./cdn/images/temp/" + file, function (e) {
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
    next('route');
}

//For post requests where the jQuery code making the request will handle the response
function isLoggedInOrErrorResponse(req, res, next) {
    if (req.isAuthenticated()) {
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
            } else {
                var parsedBody = JSON.parse(body);
                if (parsedBody.status.type != "error") {
                    var threshold = 60;
                    var tagList = {
                        auto: [],
                        all: []
                    }
                    var tags = parsedBody.result.tags;
                    for (var i = 0, ii = tags.length; i < ii; i++) {
                        var tag = tags[i],
                            t = tag.tag.en;
                        // Add first three tags to 'auto-suggest' array, along with any
                        // others over confidence threshold
                        if (tagList.auto.length < 3 || tag.confidence > threshold) {
                            tagList.auto.push(t);
                        }
                        tagList.all.push(t);
                    }
                    if (error) reject(error);
                    else resolve(tagList);
                } else {
                    tagList = {}
                    resolve(tagList)
                }
            }
        })
    })
}

//This function relocates posts on the timeline when a comment is deleted by changing lastUpdated (the post feed sorting field.)
//input: post id
//output: the post's lastUpdated field is set to either the timestamp of the new most recent comment or if there are no comments remaining the timestamp of the post
function relocatePost(postid) {
    Post.findById(postid).then(post => {
        if (post.comments.length) {
            Post.findOneAndUpdate({
                _id: postid
            }, {
                $set: {
                    lastUpdated: post.comments[post.comments.length - 1].timestamp
                }
            }).catch(err => {
                console.log('could not relocate post:')
                console.log(err)
            })
        } else {
            Post.findOneAndUpdate({
                _id: postid
            }, {
                $set: {
                    lastUpdated: post.timestamp
                }
            }).catch(err => {
                console.log('could not relocate post:')
                console.log(err)
            })
        }
    })
}