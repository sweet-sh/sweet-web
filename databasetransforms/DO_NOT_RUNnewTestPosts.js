User = require('../app/models/user');
Post = require('../app/models/post');
ObjectId     = require('mongoose').Types.ObjectId;
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
        //each poster will have 20 regular posts
        var postTime = new Date()
        for (var i = 0; i < 20; i++) {
            var newpost = new Post({
                type: 'orginal',
                authorEmail: poster.email,
                author: poster.id,
                url: shortid.generate(),
                privacy: 'public',
                timestamp: postTime,
                lastUpdated: postTime,
                rawContent: '<p>assdfasdfkjl;adsjfkl;adsj</p>',
                parsedContent: '<p>assdfasdfkjl;adsjfkl;adsj</p>',
            })
            await newpost.save();
            originalPosts.push(newpost._id);
        }
    }

    for (const poster of posters) {
        //and 6 random boosts
        var boostTime = new Date()
        for (var i = 0; i < 6; i++) {
            var target = originalPosts[Math.floor(Math.random() * originalPosts.length)];
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
            await Post.findById(target).then(post=>{
                post.boostsV2.push({booster:poster.id, timestamp: boostTime, boost: newpost._id});
                post.save();
            })
        }
    }

    for (var i=0;i<20;i++){
        //and then add 20 random comments just for fun
        var commentTimestamp = new Date();
        const comment = {
            authorEmail: posters[Math.floor(Math.random()*4)].email,
            author: posters[Math.floor(Math.random()*4)].id,
            timestamp: commentTimestamp,
            rawContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
            parsedContent: "<p>adfjadskl;fjlk;adsjf;lksdj;alfkj</p>",
        };
        Post.findById(originalPosts[Math.floor(Math.random() * originalPosts.length)]).then(post=>{
            post.comments.push(comment);
            post.lastUpdated = commentTimestamp;
            post.save();
        })
    }
}

createPosts();