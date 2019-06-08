User = require('../app/models/user');
Post = require('../app/models/post');
ObjectId = require('mongoose').Types.ObjectId;
var shortid = require('shortid');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

var posters = [{
    id: new ObjectId("5cd6201acb0d5f23e465cb84"),
    email: "fakeemail1@email.email"
}, {
    id: new ObjectId("5cd6201acb0d5f23e465cb85"),
    email: "fakeemail2@email.email"
}, {
    id: new ObjectId("5cd6201acb0d5f23e465cb86"),
    email: "fakeemail3@email.email"
}, {
    id: new ObjectId("5cd6201bcb0d5f23e465cb87"),
    email: "fakeemail4@email.email"
}, {
    id: new ObjectId("5cd6201bcb0d5f23e465cb88"),
    email: "fakeemail5@email.email"
}, {
    id: new ObjectId("5ce5a5099d17930594ef7bb5"),
    email: "mitchjacov@gmail.com"
}];

var communities = [new ObjectId("5cd621612f6283211433c7e3"),new ObjectId("5cd74d957dc5bb34b4cf57b4")];


async function createPosts() {
    await Post.deleteMany().then((ok) => {
        console.log('deleted ' + ok.n + ' old post documents');
    });

    var originalPosts = [];
    for (const poster of posters) {
        //each poster will have 200 regular posts
        //distributed randomly over the past 48 hours
        for (var i = 0; i < 20000; i++) {
            var postTime = (new Date()).setHours(new Date().getHours() - (Math.random() * 4800));
            var newpost = new Post({
                type: 'original',
                authorEmail: poster.email,
                author: poster.id,
                url: shortid.generate(),
                privacy: 'public',
                timestamp: postTime,
                lastUpdated: postTime,
                rawContent: '<p>asdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
                parsedContent: '<p>asdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
                numberOfComments: 0
            })
			if(Math.random()<0.15){
				newpost.type = 'community';
				newpost.community = communities[Math.floor(Math.random()*2)];
			}
            await newpost.save().then(insertedPost => {
                originalPosts.push(insertedPost._id);
            });
        }
    }

    for (const poster of posters) {
        //and 50 random boosts
        for (var i = 0; i < 5000; i++) {
            var currentTime = new Date().getTime();
            var target = originalPosts[Math.floor(Math.random() * originalPosts.length)];
            var targetPostDoc = await Post.findById(target);
            //keep anyone from boosting a post for the second time
            if (targetPostDoc.type!="community" && !targetPostDoc.boostsV2.some(b => {
                    return b.booster.equals(poster.id)
                })) {
                var postTime = targetPostDoc.timestamp.getTime() + 10;
                var boostTime = Math.random() * (currentTime - postTime) + postTime;
                var newpost = new Post({
                    type: 'boost',
                    authorEmail: poster.email,
                    author: poster.id,
                    url: shortid.generate(),
                    privacy: 'public',
                    timestamp: boostTime,
                    lastUpdated: boostTime,
                    boostTarget: target
                })
                await newpost.save().then(savedPost=>{
                targetPostDoc.boostsV2.push({
                    booster: poster.id,
                    timestamp: boostTime,
                    boost: newpost._id
                });
                targetPostDoc.save();
				})
            }
        }
    }

    for (var i = 0; i < 20000; i++) {
        //and then add 200 random comments just for fun
        var currentTime = new Date().getTime();
        var commentAuthor = posters[Math.floor(Math.random() * 6)];
        Post.findById(originalPosts[Math.floor(Math.random() * originalPosts.length)]).then(post => {
            var postTime = post.timestamp.getTime();
            var commentTimestamp = new Date(Math.random() * (currentTime - postTime) + postTime);
            const comment = {
                authorEmail: commentAuthor.email,
                author: commentAuthor.id,
                timestamp: commentTimestamp,
                rawContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
                parsedContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
            };
            post.comments.push(comment);
            post.numberOfComments = post.comments.length;
            post.lastUpdated = commentTimestamp;
            post.save();
        })
    }
}

async function createBoostsV2Posts() {
    await Post.deleteMany().then((ok) => {
        console.log('deleted ' + ok.n + ' old post documents');
    });

    var originalPosts = [];
    for (const poster of posters) {
        //each poster will have 20000 regular posts
        //distribute randomly over the past 48 hours
        for (var i = 0; i < 20000; i++) {
            var postTime = (new Date()).setHours(new Date().getHours() - (Math.random() * 4800));
            var newpost = new Post({
                type: 'original',
                authorEmail: poster.email,
                author: poster.id,
                url: shortid.generate(),
                privacy: 'public',
                timestamp: postTime,
                lastUpdated: postTime,
                rawContent: '<p>afdasfasdadsdfasdfkjl;adsjfkl;adsj' + i + '</p>',
                parsedContent: '<p>afdasfasdadsdfasdfkjl;adsjfkl;adsj' + i + '</p>',
                numberOfComments: 0,
                boostsV2: [{
                    booster: poster.id,
                    timestamp: postTime
                }]
            })
			if(Math.random()<0.15){
				newpost.type = 'community';
				newpost.community = communities[Math.floor(Math.random()*2)];
			}
            await newpost.save().then(insertedPost => {
                originalPosts.push(insertedPost._id);
                if(originalPosts.length % 10000==0){
                    console.log("posts created: "+originalPosts.length)
                }
            });
        }
    }

    for (const poster of posters) {
        //and 5000 random boosts
        for (var k = 0; k < 5000; k++) {
            var currentTime = new Date().getTime();
            var targetIndex = Math.floor(Math.random() * originalPosts.length);
            var target = originalPosts[targetIndex];
            Post.findOne({
                _id: target
            }).then(post => {
                if (post && post.type!="community") {
                    if (!post.boostsV2.some(b => {
                            return b.booster.equals(poster.id)
                        })) {
                        var postTime = post.timestamp.getTime() + 10;
                        var boostTime = new Date(Math.random() * (currentTime - postTime) + postTime);
                        post.boostsV2.push({
                            booster: poster.id,
                            timestamp: boostTime
                        });
                        post.lastUpdated = boostTime;
                        post.save();
                    }
                } else {
                    console.log("post not found or is community");
                    console.log("id: " + target);
                    console.log("index: " + targetIndex);
                }
            }).catch(err => {
                console.log("boost no. " + i + " not created:");
                console.log(err);
            })
        }
    }

    for (var j = 0; j < 20000; j++) {
        //and then add 200 random comments just for fun
        var currentTime = new Date().getTime();
        var commentAuthor = posters[Math.floor(Math.random() * 6)];
        var targetIndex = Math.floor(Math.random() * originalPosts.length);
        var target = originalPosts[targetIndex];
        Post.findById(target).then(post => {
            var postTime = post.timestamp.getTime() + 10;
            var commentTimestamp = new Date(Math.random() * (currentTime - postTime) + postTime);
            const comment = {
                authorEmail: commentAuthor.email,
                author: commentAuthor.id,
                timestamp: commentTimestamp,
                rawContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj" + j + "</p>",
                parsedContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfk" + j + "</p>",
            };
            post.comments.push(comment);
            post.lastUpdated = commentTimestamp;
            post.numberOfComments = post.comments.length;
            post.save();
        })
    }
}

createBoostsV2Posts()
