var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
const fileType = require('file-type');
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

module.exports = function (app) {
    //Old image uploading function. Didn't distinguish between public and private images. No longer used
    app.post("/api/image", isLoggedInOrRedirect, function (req, res) {
        if (req.files.image) {
            if (req.files.image.size <= 10485760) {
                let imageFormat = fileType(req.files.image.data);
                let imageUrl = shortid.generate();
                if (imageFormat.mime == "image/gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        console.log(imageUrl + '.gif');
                        fs.writeFile('./public/images/uploads/' + imageUrl + '.gif', imageData, 'base64', function (err) {
                            if (err) {
                                return console.log(err);
                            }
                            getTags('https://sweet.sh/images/uploads/' + imageUrl + '.gif')
                                .then((tags) => {
                                    if (tags.auto) {
                                        imageTags = tags.auto.join(", ");
                                    } else {
                                        imageTags = ""
                                    }
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.gif',
                                        tags: imageTags
                                    }));
                                })
                                .catch(err => {
                                    console.error(err);
                                    imageTags = ""
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.gif',
                                        tags: imageTags
                                    }));
                                })
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({
                            error: "filesize"
                        }));
                    }
                } else if (imageFormat.mime == "image/jpeg" || imageFormat.mime == "image/png") {
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
                                    if (tags.auto) {
                                        imageTags = tags.auto.join(", ");
                                    } else {
                                        imageTags = ""
                                    }
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.jpg',
                                        tags: imageTags
                                    }));
                                })
                                .catch(err => {
                                    console.error(err);
                                    imageTags = ""
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.jpg',
                                        tags: imageTags
                                    }));
                                })
                        })
                        .catch(err => {
                            console.error(err);
                        });
                }
            } else {
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({
                    error: "filesize"
                }));
            }
        }
    })

    //New image upload reciever.
    //Inputs: image data.
    //Outputs: if the image is under the max size for its file type (currently 5 MB for .gifs and 10 MB for .jpgs) it is saved (if it's a .gif),
    //or saved as a 1200 pixel wide jpg with compression level 85 otherwise. Saves to the temp folder; when a post or comment is actually completed,
    //it's moved to the image folder that post images are loaded from upon being displayed. Or isLoggedInOrRedirect redirects you
    app.post("/api/image/v2", isLoggedInOrRedirect, function (req, res) {
        if (req.files.image) {
            if (req.files.image.size <= 10485760) {
                let imageFormat = fileType(req.files.image.data);
                let imageUrl = shortid.generate();
                if (imageFormat.mime == "image/gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        console.log(imageUrl + '.gif');
                        fs.writeFile('./cdn/images/temp/' + imageUrl + '.gif', imageData, 'base64', function (err) { //to temp
                            if (err) {
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
                            res.end(JSON.stringify({
                                url: imageUrl + '.gif',
                                tags: imageTags
                            }));
                            // })
                            // .catch(err => {
                            //   console.error(err);
                            //   imageTags = ""
                            //   res.setHeader('content-type', 'text/plain');
                            //   res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
                            // })
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({
                            error: "filesize"
                        }));
                    }
                } else if (imageFormat.mime == "image/jpeg" || imageFormat.mime == "image/png") {
                    sharp(req.files.image.data)
                        .resize({
                            width: 1200,
                            withoutEnlargement: true
                        })
                        .rotate()
                        .jpeg({
                            quality: 85
                        })
                        .toFile('./cdn/images/temp/' + imageUrl + '.jpg') //to temp
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
                            res.end(JSON.stringify({
                                url: imageUrl + '.jpg',
                                tags: imageTags
                            }));
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
    app.post("/createpost", isLoggedInOrRedirect, function (req, res) {

        newPostUrl = shortid.generate();
        let postCreationTime = new Date();
        var postPrivacy = req.body.postPrivacy;
        var postImages = JSON.parse(req.body.postImageURL).slice(0, 4); //in case someone sends us more with custom ajax request
        var postImageTags = [""]; //what
        var postImageDescriptions = JSON.parse(req.body.postImageDescription).slice(0, 4);

        let parsedResult = helper.parseText(req.body.postContent, req.body.postContentWarnings);

        if (!(postImages || parsedResult)) { //in case someone tries to make a blank post with a custom ajax post request. storing blank posts = not to spec
            res.status(400).send('bad post op');
        }

        //non-community post
        if (!req.body.communityId) {
            var post = new Post({
                type: 'original',
                authorEmail: loggedInUserData.email,
                author: loggedInUserData._id,
                url: newPostUrl,
                privacy: postPrivacy,
                timestamp: postCreationTime,
                lastUpdated: postCreationTime,
                rawContent: sanitize(req.body.postContent),
                parsedContent: parsedResult.text,
                numberOfComments: 0,
                mentions: parsedResult.mentions,
                tags: parsedResult.tags,
                contentWarnings: sanitize(sanitizeHtml(req.body.postContentWarnings, sanitizeHtmlOptions)),
                imageVersion: 2,
                images: postImages,
                imageTags: postImageTags,
                imageDescriptions: postImageDescriptions,
                subscribedUsers: [loggedInUserData._id]
            });

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
                            privacy: postPrivacy,
                            user: loggedInUserData._id
                        })
                        image.save();
                    }
                });
            }
            let newPostId = post._id;
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
                                from: loggedInUserData.email,
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

            //community post
        } else {
            let communityId = req.body.communityId;

            const post = new Post({
                type: 'community',
                community: communityId,
                authorEmail: loggedInUserData.email,
                author: loggedInUserData._id,
                url: newPostUrl,
                privacy: 'public',
                timestamp: new Date(),
                lastUpdated: new Date(),
                rawContent: sanitize(req.body.postContent),
                parsedContent: parsedResult.text,
                numberOfComments: 0,
                mentions: parsedResult.mentions,
                tags: parsedResult.tags,
                contentWarnings: sanitize(req.body.postContentWarnings),
                imageVersion: 2,
                images: postImages,
                imageTags: postImageTags,
                imageDescriptions: postImageDescriptions,
                subscribedUsers: [loggedInUserData._id]
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
                                user: loggedInUserData._id,
                                community: communityId
                            })
                            image.save();
                        })
                });
            }

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
                    // This is a public post, notify everyone in this community
                    parsedResult.mentions.forEach(function (mention) {
                        User.findOne({
                                username: mention,
                                communities: communityId
                            })
                            .then((user) => {
                                notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                            })
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
    });

    //Responds to requests that delete posts.
    //Inputs: id of post to delete (in req.params)
    //Outputs: delete each image, delete each tag, delete the boosted versions, delete each comment image, delete notifications it caused, delete the post document.
    app.post("/deletepost/:postid", isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                "_id": req.params.postid
            })
            .then((post) => {

                if (post.author._id.toString() != loggedInUserData._id.toString()) {
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
    app.post("/createcomment/:postid", isLoggedInOrErrorResponse, function (req, res) {
        console.log(req.body)
        let parsedResult = helper.parseText(req.body.commentContent);
        commentTimestamp = new Date();
        let postImages = JSON.parse(req.body.imageUrls).slice(0, 4); //in case someone tries to send us more images than 4
        if (!(postImages || parsedResult)) { //in case someone tries to make a blank comment with a custom ajax post request. storing blank comments = not to spec
            res.status(400).send('bad post op');
        }
        const comment = {
            authorEmail: loggedInUserData.email,
            author: loggedInUserData._id,
            timestamp: commentTimestamp,
            rawContent: sanitize(req.body.commentContent),
            parsedContent: parsedResult.text,
            mentions: parsedResult.mentions,
            tags: parsedResult.tags,
            images: postImages,
            imageDescriptions: JSON.parse(req.body.imageDescs).slice(0, 4)
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
                if ((post.author._id.toString() != loggedInUserData._id.toString() || post.subscribedUsers.includes(loggedInUserData._id.toString()) === false)) { // Don't subscribe to your own post, or to a post you're already subscribed to
                    post.subscribedUsers.push(loggedInUserData._id.toString());
                }
                post.save()
                    .then(() => {

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
                                        user: loggedInUserData._id
                                    })
                                    image.save();
                                }
                            });
                        }

                        User.findOne({
                                "_id": post.author._id
                            })
                            .then((user) => {
                                subscribedUsers = post.subscribedUsers.filter((v, i, a) => a.indexOf(v) === i);
                                unsubscribedUsers = post.unsubscribedUsers.filter((v, i, a) => a.indexOf(v) === i);

                                // REPLY NOTIFICATION (X REPLIED TO YOUR POST)

                                if (post.author._id.toString() != loggedInUserData._id.toString() && (post.unsubscribedUsers.includes(post.author._id.toString()) === false)) { // You don't need to know about your own comments, and about replies on your posts you're not subscribed to
                                    console.log("Notifying post author of a reply")
                                    notifier.notify('user', 'reply', user._id, req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'post')
                                }

                                // SUBSCRIBED NOTIFICATION (X REPLIED TO POST YOU ALSO REPLIED TO)

                                function notifySubscribedUsers() {
                                    if (postPrivacy == "private") {
                                        checkTrust = true;
                                    } else {
                                        checkTrust = false;
                                    }
                                    subscribedUsers.forEach(user => {
                                        // console.log("Checking if trustedUserIds contains " + user)
                                        // console.log(trustedUserIds.includes(user) === checkTrust);
                                        if ((user.toString() != loggedInUserData._id.toString()) // Do not notify yourself
                                            &&
                                            (user.toString() != post.author._id.toString()) //don't notify the post author (because they get a different notification, above)
                                            &&
                                            (post.unsubscribedUsers.includes(user.toString()) === false) //don't notify undubscribed users
                                            &&
                                            (trustedUserIds.includes(user.toString()) === checkTrust)) { //don't notify people who you don't trust if it's a private post
                                            console.log("Notifying subscribed users")
                                            User.findById(user).then((thisuser) => {
                                                if (!parsedResult.mentions.includes(thisuser.username)) { //don't notify people who are going to be notified anyway bc they're mentioned. this would be cleaner if user (and subscribedUsers) stored usernames instead of ids.
                                                    notifier.notify('user', 'subscribedReply', user.toString(), req.user._id, post._id, '/' + post.author.username + '/' + post.url, 'post')
                                                }
                                            })
                                        }
                                    })
                                }

                                // Stopgap code to check if people being notified of replies on a private post can actually view it (are trusted by the post's author)
                                if (postPrivacy == "private") {
                                    Relationship.find({
                                            from: post.author.email,
                                            value: "trust"
                                        }, {
                                            'to': 1
                                        })
                                        .then((emails) => {
                                            trustedUserEmails = emails.map(({
                                                to
                                            }) => to)
                                            User.find({
                                                    email: {
                                                        $in: trustedUserEmails
                                                    }
                                                }, "_id")
                                                .then(users => {
                                                    trustedUserIds = users.map(({
                                                        _id
                                                    }) => _id.toString())
                                                    notifySubscribedUsers();
                                                })
                                        });
                                } else {
                                    trustedUserIds = []
                                    notifySubscribedUsers();
                                }
                            })

                        // MENTIONS NOTIFICATION (X MENTIONED YOU IN A REPLY)

                        if (postPrivacy == "private") {
                            console.log("This comment is private!")
                            // Make sure to only notify mentioned people if they are trusted by the post's author (and can therefore see the post)
                            Relationship.find({
                                    from: post.author.email,
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
                        } else if (postPrivacy == "public") {
                            console.log("This comment is public!")
                            // This is a public post, notify everyone
                            parsedResult.mentions.forEach(function (mention) {
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
                        if (loggedInUserData.imageEnabled) {
                            image = loggedInUserData.image
                        } else {
                            image = 'cake.svg'
                        }
                        if (loggedInUserData.displayName) {
                            name = '<div class="author-display-name"><strong><a class="authorLink" href="/' + loggedInUserData.username + '">' + loggedInUserData.displayName + '</a></strong></div><div class="author-username"><span class="text-muted">@' + loggedInUserData.username + '</span></div>';
                        } else {
                            name = '<div class="author-username"><strong><a class="authorLink" href="/' + loggedInUserData.username + '">@' + loggedInUserData.username + '</a></strong></div>';
                        }

                        result = {
                            image: image,
                            name: name,
                            username: loggedInUserData.username,
                            timestamp: moment(commentTimestamp).fromNow(),
                            content: parsedResult.text,
                            comment_id: post.comments[post.numberOfComments - 1]._id.toString(),
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

                //i'll be impressed if someone trips this one, comment ids aren't displayed for comments that the logged in user didn't make
                if (post.comments.id(req.params.commentid).author._id.toString() != loggedInUserData._id.toString()) {
                    res.status(400).send("you do not appear to be who you would like us to think that you are! this comment ain't got your brand on it");
                    return;
                }

                post.comments.id(req.params.commentid).images.forEach((image) => {
                    fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                        if (err) console.log("Image deletion error " + err)
                    })
                    Image.deleteOne({
                        "filename": image
                    })
                })
                post.comments.id(req.params.commentid).remove();
                post.numberOfComments = post.comments.length;
                post.save()
                    .then((comment) => {
                        relocatePost(ObjectId(req.params.postid));
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

    //Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/createboost/:postid', isLoggedInOrRedirect, function (req, res) {
        newPostUrl = shortid.generate();
        boostedTimestamp = new Date();
        Post.findOne({
                '_id': req.params.postid
            })
            .populate('author')
            .then((boostedPost) => {
                if (boostedPost.privacy != "public") {
                    res.status(400).send("post is not public and therefore may not be boosted");
                    return;
                }
                const boost = new Post({
                    type: 'boost',
                    boostTarget: boostedPost._id,
                    authorEmail: loggedInUserData.email,
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
        loggedInUserData = req.user;
        // A potentially expensive way to update a user's last logged in timestamp (currently only relevant to sorting search results)
        currentTime = new Date();
        if ((currentTime - loggedInUserData.lastUpdated) > 3600000) { // If the timestamp is older than an hour
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
    if (req.isAuthenticated()) {
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
    Post.aggregate([{
                "$match": {
                    "_id": postid
                }
            },
            {
                "$unwind": "$comments"
            },
            {
                "$sort": {
                    "comments.timestamp": -1
                }
            },
            {
                "$group": {
                    "_id": "$_id",
                    "latest_timestamp": {
                        "$first": "$comments"
                    }
                }
            }
        ])
        .then(result => {
            if (result.length) {
                Post.findOneAndUpdate({
                        _id: postid
                    }, {
                        $set: {
                            lastUpdated: result[0].latest_timestamp.timestamp
                        }
                    }, {
                        returnNewDocument: true
                    })
                    .then(updatedPost => {
                        console.log(updatedPost)
                    })
            } else {
                Post.findOneAndUpdate({
                    _id: postid
                }, {
                    $set: {
                        lastUpdated: timestamp
                    }
                }, {
                    returnNewDocument: true
                })
            }
        })
        .catch(error => {
            console.error(error);
        })
}