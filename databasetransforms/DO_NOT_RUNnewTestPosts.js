User = require('../app/models/user');
Post = require('../app/models/post');
ObjectId = require('mongoose').Types.ObjectId;
var shortid = require('shortid');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

Post.deleteMany().then((ok) => {
    console.log('deleted ' + ok.n + ' old post documents');
});

var posters = [{
    id: new ObjectId("5cd6201acb0d5f23e465cb84"),
    email: "fakeemail1@email.email"
}, {
    id: new ObjectId("5cd6201acb0d5f23e465cb85"),
    email: "fakeemail2@email.email"
}, {
    id: new ObjectId("5cd6201acb0d5f23e465cb86"),
    email: "fakeemail2@email.email"
}, {
    id: new ObjectId("5cd6201bcb0d5f23e465cb87"),
    email: "fakeemail2@email.email"
}];


async function createPosts() {
    var originalPosts = [];
    for (const poster of posters) {
        //each poster will have 200 regular posts
        //distributed randomly over the past 48 hours
        for (var i = 0; i < 200; i++) {
            var postTime = (new Date()).setHours(new Date().getHours() - (Math.random() * 48));
            var newpost = new Post({
                type: 'original',
                authorEmail: poster.email,
                author: poster.id,
                url: shortid.generate(),
                privacy: 'public',
                timestamp: postTime,
                lastUpdated: postTime,
                rawContent: '<p>assdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
                parsedContent: '<p>assdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
            })
            await newpost.save();
            originalPosts.push(newpost._id);
        }
    }

    for (const poster of posters) {
        //and 50 random boosts
        for (var i = 0; i < 50; i++) {
            var boostTime = new Date();
            var target = originalPosts[Math.floor(Math.random() * originalPosts.length)];
            var targetPostDoc = await Post.findById(target);
            //keep anyone from boosting a post for the second time
            if (!targetPostDoc.boostsV2.some(b => {
                    return b.booster.equals(poster.id)
                })) {
                var newpost = new Post({
                    type: 'boost',
                    authorEmail: poster.email,
                    author: poster.id,
                    url: shortid.generate(),
                    privacy: 'public',
                    timestamp: boostTime,
                    lastUpdated: boostTime,
                    //add field back to schema so this works
                    boostTarget: target
                })
                await newpost.save();
                targetPostDoc.boostsV2.push({
                    booster: poster.id,
                    timestamp: boostTime,
                    boost: newpost._id
                });
                targetPostDoc.save();
            }
        }
    }

    for (var i = 0; i < 200; i++) {
        //and then add 200 random comments just for fun
        var commentTimestamp = new Date();
        const comment = {
            authorEmail: posters[Math.floor(Math.random() * 4)].email,
            author: posters[Math.floor(Math.random() * 4)].id,
            timestamp: commentTimestamp,
            rawContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
            parsedContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
        };
        Post.findById(originalPosts[Math.floor(Math.random() * originalPosts.length)]).then(post => {
            post.comments.push(comment);
            post.lastUpdated = commentTimestamp;
            post.save();
        })
    }
}

async function createBoostsV2Posts() {
    var originalPosts = [];
    for (const poster of posters) {
        //each poster will have 20 regular posts
        //distribute randomly over the past 48 hours
        for (var i = 0; i < 200; i++) {
            var postTime = (new Date()).setHours(new Date().getHours() - (Math.random() * 48));
            var newpost = new Post({
                type: 'original',
                authorEmail: poster.email,
                author: poster.id,
                url: shortid.generate(),
                privacy: 'public',
                timestamp: postTime,
                lastUpdated: postTime,
                rawContent: '<p>assdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
                parsedContent: '<p>assdfasdfkjl;adsjfkl;adsj' + originalPosts.length + '</p>',
                numberOfComments: 0
            })
            await newpost.save();
            originalPosts.push(newpost._id);
        }
    }

    for (const poster of posters) {
        //and 5 random boosts
        for (var i = 0; i < 50; i++) {
            var boostTime = new Date()
            var target = originalPosts[Math.floor(Math.random() * originalPosts.length)];
            await Post.findById(target).then(post => {
                post.boostsV2.push({
                    booster: poster.id,
                    timestamp: boostTime
                });
                post.lastUpdated = boostTime
                post.save();
            })
        }
    }

    for (var i = 0; i < 200; i++) {
        //and then add 20 random comments just for fun
        var commentTimestamp = new Date();
        const comment = {
            authorEmail: posters[Math.floor(Math.random() * 4)].email,
            author: posters[Math.floor(Math.random() * 4)].id,
            timestamp: commentTimestamp,
            rawContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
            parsedContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
        };
        Post.findById(originalPosts[Math.floor(Math.random() * originalPosts.length)]).then(post => {
            post.comments.push(comment);
            post.lastUpdated = commentTimestamp;
            post.numberOfComments++;
            post.save();
        })
    }
}


createPosts()