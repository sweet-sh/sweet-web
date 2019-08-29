// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

module.exports = function(app) {

    //New image upload reciever.
    //Inputs: image data.
    //Outputs: if the image is under the max size for its file type (currently 5 MB for .gifs and 10 MB for .jpgs) it is saved (if it's a .gif),
    //or resized, compressed, maybe flattened, and saved according to the user's image upload settings. Saves to the temp folder; when a post or comment is actually completed,
    //it's moved to the image folder that post images are loaded from upon being displayed. A thumbnail version is also saved in the thumbnails object, for retrieval through the
    //below function at /api/image/thumbnailretrieval/:id. A response is sent back with the image's future filename, which identifies it so it can be folded into the saved post when
    //the post is submitted, and also the url for retrieving the thumbnail.
    var thumbnails = {}; //stores array buffers with unique keys and the types of the images they represent at id+"type"
    var thumbID = 0; //used to create unique keys in the thumbnails object for each successive generated thumbnail; incremented every time it's used
    app.post("/api/image/v2", isLoggedInOrErrorResponse, async function(req, res) {
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

                    //send the client a thumbnail bc a) maybe the image is being rotated according to exif data or is a png with transparency being removed, and b) bc using a really small thumbnail in the browser speeds subsequent front-end interactions way up, at least on my phone
                    //IN THEORY we should just be able to .clone() sharpImage and operate on the result of that instead of making this new object for the thumbnail, but i'll be damned if i can get that to behave, i get cropped images somehow
                    var thumbnail = sharp(req.files.image.data).resize({ height: 200, withoutEnlargement: true });
                    thumbnail = await (finalFormat == "jpeg" ? thumbnail.rotate().flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg() : thumbnail.rotate().png()).toBuffer();
                    thumbnails[""+thumbID] = thumbnail;
                    thumbnails[thumbID+"type"] = finalFormat;
                    setTimeout(function(){delete thumbnails[""+thumbID];delete thumbnails[thumbID+"type"]},30000) //client has 30 seconds to retrieve the thumbnail
                    var response = { url: imageUrl + '.' + finalFormat };
                    if(thumbnail){
                        response.thumbnail = "/api/image/thumbnailretrieval/"+thumbID++;
                    }

                    await sharpImage.toFile('./cdn/images/temp/' + imageUrl + '.' + finalFormat) //to temp
                        .catch(err => {
                            console.error("could not temp save uploaded image:")
                            console.error(err);
                        });

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

    app.get("/api/image/thumbnailretrieval/:id",function(req,res){
        if(thumbnails[req.params.id]){
            res.setHeader('content-type', 'image/'+thumbnails[req.params.id+"type"]);
            res.end(thumbnails[req.params.id]);
            delete thumbnails[req.params.id];
            delete thumbnails[req.params.id+"type"];
            console.log(Object.keys(thumbnails));
        }else{
            res.sendStatus(404);
        }
    })

    //Responds to post requests that inform the server that a post that images were uploaded for will not be posted by deleting those images.
    //Inputs: image file name
    //Outputs: the image presumably in the temp folder with that filename is deleted
    app.post("/cleartempimage", isLoggedInOrErrorResponse, function(req, res) {
        if (req.body.imageURL.match(/^(\w|-){7,14}.(jpeg|jpg|png|gif)$/)) { //makes sure the incoming imageURL matches the shortid format and then a . and then an image extension
            fs.unlink("./cdn/images/temp/" + req.body.imageURL, function(e) {
                if (e) {
                    console.log("could not delete image " + "./cdn/images/temp/" + req.body.imageURL);
                    console.log(e);
                }
            });
        }
        res.sendStatus(200);
    })

    //Responds to post requests that create a new post.
    //Input: if the post contains no inlineElements, a simple string with its html contents. otherwise, an array of paragraphs and inline element objects ready to be parsed by the function
    //parseText calls to parse it.
    //Outputs: all that stuff is saved as a new post document (with the body of the post parsed to turn urls and tags and @s into links). Or, error response if not logged in.
    app.post("/createpost", isLoggedInOrErrorResponse, async function(req, res) {

        var parsedResult = await helper.parseText(JSON.parse(req.body.postContent));

        //don't save mentions or tags for draft posts, this means that notifications and tag adding will be deferred until the post is published and at that point
        //all of the mentions and tags will register as "new" and so the right actions will occur then
        if(req.body.isDraft){
            parsedResult.mentions = [];
            parsedResult.tags = [];
        }

        if (req.body.communityId) {
            var imagePrivacy = (await Community.findById(req.body.communityId)).settings.visibility;
        } else if(req.body.isDraft){
            var imagePrivacy = "private"; //this should already be stored in req.body.postPrivacy but just in case
        }else{
            var imagePrivacy = req.body.postPrivacy;
        }

        for (var inline of parsedResult.inlineElements) {
            if (inline.type == "image(s)") {
                //calling this function also moves the images out of temp storage and saves documents for them in the images collection in the database
                var horizOrVertics = await helper.finalizeImages(inline.images, (req.body.communityId ? "community" : req.body.isDraft ? "draft" : "original"), req.body.communityId, req.user._id, imagePrivacy, req.user.settings.imageQuality);
                inline.imageIsHorizontal = horizOrVertics.imageIsHorizontal;
                inline.imageIsVertical = horizOrVertics.imageIsVertical;
            }
        }

        var newPostUrl = shortid.generate();
        let postCreationTime = new Date();

        if (!(parsedResult.inlineElements.length || parsedResult.text.trim())) { //in case someone tries to make a blank post with a custom ajax post request. storing blank posts = not to spec
            res.status(400).send('bad post op');
            return;
        }
        var isCommunityPost = !!req.body.communityId;

        var post = new Post({
            type: isCommunityPost ? 'community' : req.body.isDraft ? 'draft' : 'original',
            community: isCommunityPost ? req.body.communityId : undefined,
            authorEmail: req.user.email,
            author: req.user._id,
            url: newPostUrl,
            privacy: isCommunityPost ? 'public' : req.body.isDraft ? "private" : req.body.postPrivacy,
            timestamp: postCreationTime,
            lastUpdated: postCreationTime,
            rawContent: req.body.postContent,
            parsedContent: parsedResult.text,
            numberOfComments: 0,
            mentions: parsedResult.mentions,
            tags: parsedResult.tags,
            contentWarnings: req.body.postContentWarnings,
            imageVersion: 3,
            inlineElements: parsedResult.inlineElements,
            subscribedUsers: [req.user._id]
        });

        var newPostId = post._id;

        for (mention of parsedResult.mentions) {
            if (mention != req.user.username) {
                User.findOne({ username: mention }).then(async mentioned => {
                    if (isCommunityPost) {
                        if (mentioned.communities.some(v=>v.equals(post.community))) {
                            notifier.notify('user', 'mention', mentioned._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post');
                        }
                    } else if (req.body.postPrivacy == "private") {
                        if (await Relationship.findOne({ value: 'trust', fromUser: req.user._id, toUser: mentioned._id })) {
                            notifier.notify('user', 'mention', mentioned._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post');
                        }
                    } else {
                        notifier.notify('user', 'mention', mentioned._id, req.user._id, post._id, '/' + req.user.username + '/' + newPostUrl, 'post')
                    }
                })
            }
        }

        for (tag of parsedResult.tags) {
            Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": newPostId.toString() }, "$set": { "lastUpdated": postCreationTime } }, { upsert: true, new: true }, function(error, result) { if (error) return });
        }

        if (isCommunityPost) {
            Community.findOneAndUpdate({ _id: req.body.communityId }, { $set: { lastUpdated: new Date() } })
        }

        await post.save();
        res.status(200).send("" + (postCreationTime.getTime() + 1));
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

                // Delete tags (does not currently fix tag last updated time)
                if (post.tags) {
                    post.tags.forEach((tag) => {
                        Tag.findOneAndUpdate({ name: tag }, { $pull: { posts: req.params.postid } })
                            .then((tag) => {
                                console.log("Deleted post from tag: " + tag)
                            })
                            .catch((err) => {
                                console.log("Database error while attempting to delete post from tag: " + err)
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
                                console.log("Database error while attempting to delete boost while deleting post: " + err)
                            })
                    })
                }

                // Delete notifications
                User.update({}, { $pull: { notifications: { subjectId: post._id } } }, { multi: true }).then(response => { console.log(response) })
            })
            .then(() => {
                Post.deleteOne({ "_id": req.params.postid })
                    .then(() => {
                        res.sendStatus(200);
                    })
                    .catch((err) => {
                        console.log("Error while attempting to delete post: " + err)
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

        var rawContent = req.body.commentContent;
        var parsedResult = await helper.parseText(JSON.parse(rawContent));

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
                    var postType = "original";
                    var postPrivacy = post.privacy;
                }

                for (var inline of parsedResult.inlineElements) {
                    if (inline.type == "image(s)") {
                        //calling this function also moves the images out of temp storage and saves documents for them in the images collection in the database
                        var horizOrVertics = await helper.finalizeImages(inline.images, postType, post.communityId, req.user._id, postPrivacy, req.user.settings.imageQuality);
                        inline.imageIsHorizontal = horizOrVertics.imageIsHorizontal;
                        inline.imageIsVertical = horizOrVertics.imageIsVertical;
                    }
                }

                comment.inlineElements = parsedResult.inlineElements;
                var contentHTML = await helper.renderHTMLContent(comment)
                comment.cachedHTML = { fullContentHTML: contentHTML };

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
                var commentsByUser = 0;
                var latestTimestamp = 0;
                var numberOfComments = 0;
                var target = undefined;

                function findNested(array, id, parent) {
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
                        element.numberOfSiblings = (parent.replies ? parent.replies.length - 1 : post.comments.length - 1);
                        element.parent = parent;
                        if (!target && element._id && element._id.equals(id)) {
                            target = element;
                            commentsByUser--;
                            numberOfComments--;
                            console.log('numberOfComments', numberOfComments)
                        }
                        if (element.replies) {
                            findNested(element.replies, id, element)
                        }
                    })
                }

                findNested(post.comments, req.params.commentid, post);
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
    });

    //Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/createboost/:postid/:location', isLoggedInOrRedirect, async function(req, res) {
        boostedTimestamp = new Date();
        if (req.params.location != 'userfeed') { // This post will be boosted into a specific location (i.e. a community), rather than the user's regular feed
            boostCommunity = await Community.findById(req.params.location);
            if (!boostCommunity.members.some(member => member.equals(req.user._id))) {
                res.status(400).send("You're not a member of the community where you want to boost this post");
                return;
            }
        }
        Post.findOne({
                '_id': req.params.postid
            }, {
                boostsV2: 1,
                lastUpdated: 1,
                privacy: 1,
                unsubscribedUsers: 1,
                author: 1,
                url: 1
            }).populate('author').populate('community')
            .then((boostedPost) => {
                if (boostedPost.privacy != "public" || (boostedPost.community && boostedPost.community.settings.visibility != "public")) {
                    res.status(400).send("post is not public, or is posted in a closed community, and therefore may not be boosted");
                    return;
                }
                var boost = new Post({
                    type: 'boost',
                    community: (req.params.location != 'userfeed' ? boostCommunity._id : null),
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: shortid.generate(),
                    privacy: 'public',
                    timestamp: boostedTimestamp,
                    lastUpdated: boostedTimestamp,
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

    //Responds to a post request that removes a boosted post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/removeboost/:postid', isLoggedInOrRedirect, function(req, res) {
        Post.findOne({ '_id': req.params.postid }, { boostsV2: 1, privacy: 1, author: 1, url: 1, timestamp: 1 })
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
        Post.findOne({
                _id: req.params.postid
            })
            .then(async post => {
                if (post.author.equals(req.user._id)) {
                    // This post has been written by the logged in user - we good
                    var isCommunityPost = (post.type == 'community');
                    var content = await helper.renderHTMLContent(post, true);
                    hbs.render('./views/partials/posteditormodal.handlebars', {
                            contentWarnings: post.contentWarnings,
                            privacy: post.privacy,
                            isCommunityPost: isCommunityPost,
                            isDraft: post.type=="draft",
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
                } else {
                    res.send('Hold up there scout')
                }
            })
    })

    app.post('/saveedits/:postid', isLoggedInOrErrorResponse, async function(req, res) {
        var post = await Post.findById(req.params.postid);
        if (!post.author._id.equals(req.user._id)) {
            return res.sendStatus(403);
        }
        var parsedPost = await helper.parseText(JSON.parse(req.body.postContent));
        if (!(parsedPost.inlineElements.length || parsedPost.text.trim())) {
            //ignore the edit if it results in an empty post; it's an invalid request, the client side code also works to prevent this
            return res.sendStatus(403);
        }

        post.lastEdited = new Date();
        post.rawContent = req.body.postContent;
        post.parsedContent = parsedPost.text;

        //don't save mentions or tags for draft posts, this means that notifications and tag adding will be deferred until the post is published and at that point
        //all of the mentions and tags will register as "new" and so the right actions will occur then
        if(req.body.isDraft){
            parsedPost.mentions = [];
            parsedPost.tags = [];
        }

        //process images added to/deleted from the post, retrieve/find orientations. its spaghetti, i know. the imageIsVertical and imageIsHorizontal database fields should
        //really be combined into a single imageOrientationType field that just stores either 'vertical-image', 'horizontal-image', or a blank string for each image.
        //it would be a lot simpler, if computationally wasteful, to just re-compute the orientation of every image for every image instead of doing all of this to keep track
        //of how it was stored for images already in the post in potentially a completely different format and image order; if this code gives too much trouble probably just switch to that.

        //create lookup tables: oldHorizontalImages[imageFileName] will contain the value of imageIsHorizontal corresponding to that filename, and the same for vertical ones
        var horizontalityLookup = {};
        var verticalityLookup = {};
        var oldPostImages = [];
        if (post.images && post.images.length) {
            oldPostImages = post.images;
            if (post.imageIsHorizontal && post.imageIsVertical) {
                oldPostImages.map((v, i) => {
                    horizontalityLookup[v] = post.imageIsHorizontal[i];
                    verticalityLookup[v] = post.imageIsVertical[i];
                })
            }
        } else if (post.inlineElements && post.inlineElements.length) {
            post.inlineElements.filter(element => element.type == "image(s)").map(imagesElement => imagesElement.images.map(
                (imageFilename, i) => {
                    oldPostImages.push(imageFilename);
                    if (imagesElement.imageIsHorizontal && imagesElement.imageIsVertical) {
                        horizontalityLookup[imageFilename] = imagesElement.imageIsHorizontal[i];
                        verticalityLookup[imageFilename] = imagesElement.imageIsVertical[i];
                    }
                }))
        }
        if (post.community) {
            var imagePrivacy = (await Community.findById(post.community)).settings.visibility;
            var imagePrivacyChanged = false;
        } else if(req.body.isDraft){
            var imagePrivacy = "private";
            var imagePrivacyChanged = false;
        } else {
            var imagePrivacy = req.body.postPrivacy;
            var imagePrivacyChanged = !(imagePrivacy == post.privacy);
        }
        //finalize each new image with the helper function; retrieve the orientation of the already existing ones from the lookup table by their filename.
        //change the privacy of old image documents if the post's privacy changed.
        var currentPostImages = [];
        for (e of parsedPost.inlineElements) {
            if (e.type == "image(s)") {
                e.imageIsVertical = [];
                e.imageIsHorizontal = [];
                for (var i = 0; i < e.images.length; i++) {
                    currentPostImages.push(e.images[i]);
                    if (!oldPostImages.includes(e.images[i])) {
                        var horizOrVertic = await helper.finalizeImages([e.images[i]], post.type, post.community, req.user._id.toString(), imagePrivacy, req.user.settings.imageQuality);
                        e.imageIsVertical.push(horizOrVertic.imageIsVertical[0]);
                        e.imageIsHorizontal.push(horizOrVertic.imageIsHorizontal[0]);
                    } else if (!post.imageVersion || post.imageVersion < 2) {
                        //finalize images that were previously stored in /public/images/uploads so that there's only one url scheme that needs to be used with inlineElements.
                        var horizOrVertic = await helper.finalizeImages([e.images[i]], post.type, post.community, req.user._id.toString(), imagePrivacy, req.user.settings.imageQuality, global.appRoot + '/public/images/uploads/');
                        e.imageIsVertical.push(horizOrVertic.imageIsVertical[0]);
                        e.imageIsHorizontal.push(horizOrVertic.imageIsHorizontal[0]);
                    } else {
                        e.imageIsVertical.push(verticalityLookup[e.images[i]]);
                        e.imageIsHorizontal.push(horizontalityLookup[e.images[i]]);
                        if (imagePrivacyChanged) {
                            var imageDoc = await Image.findOne({ filename: e.images[i] });
                            imageDoc.privacy = imagePrivacy;
                            await imageDoc.save();
                        }
                    }
                }
            }
        }

        var deletedImages = oldPostImages.filter(v => !currentPostImages.includes(v));
        for (image of deletedImages) {
            Image.deleteOne({ filename: image });
            fs.unlink(global.appRoot + ((!post.imageVersion || post.imageVersion < 2) ? '/public/images/uploads/' : '/cdn/images/') + image, (err) => { if(err){console.error('could not delete unused image from edited post:\n' + err) }});
        }

        post.inlineElements = parsedPost.inlineElements;
        post.imageVersion = 3;
        post.images = undefined;
        post.imageDescriptions = undefined;
        post.imageIsHorizontal = undefined;
        post.imageIsVertical = undefined;
        post.embeds = undefined;

        var newMentions = parsedPost.mentions.filter(v => !post.mentions.includes(v));
        for (mention of newMentions) {
            if (mention != req.user.username) {
                User.findOne({ username: mention }).then(async mentioned => {
                    if (post.community) {
                        if (mentioned.communities.some(v=>v.equals(post.community))) {
                            notifier.notify('user', 'mention', mentioned._id, req.user._id, newPostId, '/' + req.user.username + '/' + post.url, 'post');
                        }
                    } else if (req.body.postPrivacy == "private") {
                        if (await Relationship.findOne({ value: 'trust', fromUser: req.user._id, toUser: mentioned._id })) {
                            notifier.notify('user', 'mention', mentioned._id, req.user._id, newPostId, '/' + req.user.username + '/' + post.url, 'post');
                        }
                    } else {
                        notifier.notify('user', 'mention', mentioned._id, req.user._id, post._id, '/' + req.user.username + '/' + post.url, 'post')
                    }
                })
            }
        }
        post.mentions = parsedPost.mentions;

        var newTags = parsedPost.tags.filter(v => !post.tags.includes(v));
        for (const tag of newTags) {
            Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": post._id.toString() }, "$set": { "lastUpdated": new Date() } }, { upsert: true, new: true }, function(error, result) { if (error) console.error('could not update tag upon post editing\n' + error) });
        }
        var deletedTags = post.tags.filter(v => !parsedPost.tags.includes(v))
        for (const tag of deletedTags) {
            Tag.findOneAndUpdate({ name: tag }, { "$pull": { "posts": post._id.toString() } }).catch(err => console.error('could not remove edited post ' + post._id.toString() + ' from tag ' + tag + '\n' + err));

        }
        post.tags = parsedPost.tags;

        //if the post is in a community, the community's last activity timestamp could be updated here, but maybe not, idk

        var newHTML = await helper.renderHTMLContent(post);
        post.cachedHTML.fullContentHTML = newHTML;

        post.contentWarnings = req.body.postContentWarnings;

        if (req.body.postContentWarnings) {
            //this bit does not need to be stored in the database, it's rendered in the feed by the posts_v2 handlebars file and that's fine
            newHTML = '<aside class="content-warning">' + req.body.postContentWarnings + '</aside>' +
                '<div class="abbreviated-content content-warning-content" style="height:0">' + newHTML + '</div>' +
                '<button type="button" class="button grey-button content-warning-show-more uppercase-button" data-state="contracted">Show post</button>';
        }

        if(post.type == "draft" && !req.body.isDraft){
            var timePublished = new Date();
            post.timestamp = timePublished;
            post.lastUpdated = timePublished;
            post.lastEdited = undefined;
            post.type = "original";
            newHTML = '<p style="font-weight:300;font-style:italic;color:#ce1717;">This post was published!</p>'; //the color is $sweet-red from _colors.scss
        }

        if (post.type == "original") {
            post.privacy = req.body.postPrivacy;
        }else if(post.type == "draft"){
            post.privacy = "private"; //the client should send is this in req.body.postPrivacy but, just to be sure
        }else if(post.type == "community"){
            post.privacy = "public";
        }

        post.save().then(() => {
            res.contentType("text/html; charset=utf-8");
            res.status(200);
            res.send(newHTML);
        })
    })
};

//scan the temp folder every day and delete images that are more than a week old. just in case someone leaves their post editor open for that long. this generous
//time limit is enabled by the fact that the vast, vast majority of temp images are going to be specifically cleared by the /cleartempimage route above; the only
//images that are going to be picked up by this function are those uploaded by users whose device loses power, whose device loses internet connection and doesn't
//regain it before they close the tab, and maybe those that are using a really weird browser or extensions.
function cleanTempFolder() {
    fs.readdir("./cdn/images/temp", function(err, files) {
        files.forEach(file => {
            if (file != ".gitkeep" && file != "") {
                fs.stat("./cdn/images/temp/" + file, function(err, s) {
                    if (Date.now() - s.mtimeMs > 7*24*60*60*1000) {
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
}
cleanTempFolder();
setInterval(cleanTempFolder, 24*60*60*1000);

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
