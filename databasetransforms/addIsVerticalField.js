const Post = require('../app/models/post');
const sharp = require('sharp');
const fs = require('fs')
const path = require('path')
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

//Populate the isVertical for our images (this is contained in the post document).

var addedFields = 0;

async function addIsVertical() {

    async function saveImageVerticality(image, imageHaver){
        if (fs.existsSync(path.resolve('../cdn/images/' + image))) {
            await sharp(path.resolve('../cdn/images/' + image)).metadata().then(async metadata => {
                imageHaver.imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? "vertical-image" : "");
                addedFields++;
            })
        } else {
            console.log("image " + path.resolve('../cdn/images/' + image) + " not found! isVertical field not added")
        }
    }

    await Post.updateMany({}, {
        $set: {
            imageIsVertical: []
        }
    });

    var allPosts = await Post.find({});
    for (post of allPosts) {
        if (post.imageIsVertical.length === 0) {
            for (image of post.images) {
                await saveImageVerticality(image, post);
            }

            async function nowForTheComments(comments){
                for (comment of comments){
                    comment.imageIsVertical = [];
                    for(commentImage of comment.images){
                        await saveImageVerticality(image, comment);
                    }
                    for(reply of comment.replies){
                        await nowForTheComments(comment.replies);
                    }
                }
            }

            await nowForTheComments(post.comments);
            await post.save();
        }
    }
}

addIsVertical().then(() => {
    console.log("added isVertical field for " + addedFields + " images");
    //process.exit()
});

//Populate the isHorizontal for our images (this is contained in the post document).

var addedFields = 0;

async function addIsHorizontal() {

    async function saveImageHorizontality(image, imageHaver){
        if (fs.existsSync(path.resolve('../cdn/images/' + image))) {
            await sharp(path.resolve('../cdn/images/' + image)).metadata().then(async metadata => {
                imageHaver.imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? "vertical-image" : "");
                imageHaver.imageIsHorizontal.push(((metadata.width / metadata.height) > 1.33) ? "horizontal-image" : "");
                addedFields++;
            })
        } else {
            console.log("image " + path.resolve('../cdn/images/' + image) + " not found! isHorizontal field not added")
        }
    }

    await Post.updateMany({}, {
        $set: {
            imageIsHorizontal: []
        }
    });

    var allPosts = await Post.find({});
    for (post of allPosts) {
        if (post.imageIsHorizontal.length === 0) {
            for (image of post.images) {
                await saveImageHorizontality(image, post);
            }

            async function nowForTheComments(comments){
                for (comment of comments){
                    comment.imageIsHorizontal = [];
                    for(commentImage of comment.images){
                        await saveImageHorizontality(image, comment);
                    }
                    for(reply of comment.replies){
                        await nowForTheComments(comment.replies);
                    }
                }
            }

            await nowForTheComments(post.comments);
            await post.save();
        }
    }
}

addIsHorizontal().then(() => {
    console.log("added isHorizontal field for " + addedFields + " images");
    //process.exit()
});
