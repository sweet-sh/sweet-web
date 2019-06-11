const Image = require('../app/models/image');
const sharp = require('sharp');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

//Populate the height and width fields for our images.

var addedSizes = 0;

//stolen from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404?gi=27abcb930540
//regular foreach does not await async functions you give it, this does
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function addImageSizes() {
    await Image.find({}, {
        filename: 1
    }).then(async images => {
        await asyncForEach(images, async function (image) {
            await sharp('../cdn/images/' + image.filename).metadata().then(async metadata => {
                await Image.findOneAndUpdate({
                    filename: image.filename
                }, {
                    $set: {
                        width: metadata.width,
                        height: metadata.height
                    }
                })
                addedSizes++;
            }).catch(err=>{
                console.log('could not get size for image '+image.filename);
                console.log(err);
            })
        });
    });
    console.log("images with size added now: " + addedSizes);
}

addImageSizes();
