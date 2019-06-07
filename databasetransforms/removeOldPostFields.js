const Post = require('../app/models/post');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

Post.find().then(posts=>{
    for (const post of posts){
        post.set('imageTags', undefined, { strict: false });
        post.set('images_v3', undefined, { strict: false });
        post.set('boosters', undefined, { strict: false });
        post.save()
    }
}).then(()=>{
    process.exit();
})