const User = require('../app/models/user');
const Post = require('../app/models/post');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

//Create a field "boosters" from the old style "boosts." Forced to be synchronous so the count thing is accurate.
//Also works to validate "boosters" if it's already created but you want to check/repair it.

var numOfPushes = 0;

//stolen from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404?gi=27abcb930540
//regular foreach does not await async functions you give it, this does
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

async function createBoostersField() {
    await Post.find({},{boosts:1,boosters:1}).then(async posts => {
        await asyncForEach(posts, async function (post) {
            if(post.boosts.length!=0){
                await asyncForEach(post.boosts, async function (boostId) {
                    await Post.findOne({_id: boostId},{author:1}).then(boost => {
                        if (!post.boosters.includes(boost.author)) {
                            post.boosters.push(boost.author);
                            numOfPushes++;
                        }
                    });
                });
                await post.save().catch(err=>{console.log(error)});
            }
        });
    });
    console.log("boosters added to post documents: " + numOfPushes);
}

createBoostersField();