const Post = require('../app/models/post');
const sharp = require('sharp');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

//Populate the isVertical for our images (this is contained in the post document).

var addedFields = 0;

async function addIsVertical() {
    var allPosts = await Post.find({});
    for (post of allPosts) {
        for (image of post.images) {
            await sharp('../cdn/images/' + image.filename).metadata().then(async metadata => {
                post.imagesIsVertical.push(metadata.width / metadata.height < 0.75);
                addedFields++;
            })
        }
        await post.save();
    }
}

addIsVertical().then(() => {
    console.log("added isVertical field for " + addedFields + " images");
    process.exit()
});