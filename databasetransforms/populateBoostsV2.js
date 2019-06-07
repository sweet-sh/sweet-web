const User = require('../app/models/user');
const Post = require('../app/models/post');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

var numOfPushes = 0;

//stolen from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404?gi=27abcb930540
//regular foreach does not await async functions you give it, this does
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

//populates the new post field boostsV2, which is an embedded array of boost documents that works similarly to the embedded array of comments.
async function createBoostsField() {
    await Post.find({$or:[{type:'original'},{type:'community'}]},{author:1,timestamp:1,lastUpdated:1,comments:1,boosts:1,boostsV2:1}).then(async posts => {
        await asyncForEach(posts, async function (post) {
            //the first item in the boostsV2 field is always just the implicit one created by the post's author when they post it.
            if(post.boostsV2.length===0){
                post.boostsV2.push({booster: post.author, timestamp: post.timestamp});
                numOfPushes++;
            }
            //then, we go through the all of the references to boost posts stored in the post's boosts field to turn them into embedded documents. 
            if(post.boosts.length!=0){
                await asyncForEach(post.boosts, async function (boostId) {
                    await Post.findOne({_id: boostId},{author:1,timestamp:1}).then(boost => {
                        if(!boost){return;}
                        //only one boost per booster needs to exist, so we only keep the most recent one. 
                        //each successive boost should be more recent than the last, but, doesn't hurt that much to check.
                        //find if there is one from this booster already:
                        var boostV2WithThisAuthor = post.boostsV2.find(boostV2 => { return boostV2.booster.equals(boost.author)});
                        //if there is, filter it out and replace it if we've found a newer instance of that booster boosting the post
                        if(boostV2WithThisAuthor ){
                            if(boost.timestamp > boostV2WithThisAuthor.timestamp){
                                post.boostsV2 = post.boostsV2.filter(boostV2 => { return !boostV2.booster.equals(boost.author); })
                                var newboostV2 = {booster: boost.author, timestamp: boost.timestamp};
                                post.boostsV2.push(newboostV2);
                                numOfPushes++;
                            }
                        //if there is no other boost in boostsV2 from this booster we can just add it
                        }else{
                            var newboostV2 = {booster: boost.author, timestamp: boost.timestamp};
                            post.boostsV2.push(newboostV2);
                            numOfPushes++;
                        }
                    });
                });
            }
            //again, boosts should have been added in order, but it doesn't hurt to make sure
            post.boostsV2 = post.boostsV2.sort((a,b)=>{b.timestamp - a.timestamp});
            //the post is now last updated at the time of the most recent boost or comment
            //comments should also be sorted but let's make sure
            if(post.comments.length > 0){
                post.comments = post.comments.sort((a,b)=>{b.timestamp - a.timestamp});
                post.lastUpdated = Math.max(post.boostsV2[post.boostsV2.length-1].timestamp, post.comments[post.comments.length-1].timestamp);
            }else{
                post.lastUpdated = post.boostsV2[post.boostsV2.length-1].timestamp;
            }
            await post.save().catch(err=>{console.log(error)});
        });
    });
    console.log("boostV2s added to post documents: " + numOfPushes);
    if(await validateStuff(numOfPushes)){
        console.log("stuff validated!")
        deleteOldBoostPosts();
    }else{
        console.log("if the only errors above are equivalent old boost document and the deletion function was already run, then that make sense and you're fine")
        console.log("otherwise, errors detected in post documents vis-a-vis boosts, boostsV2 is populated but old boost information will not be auto-deleted for safety's sake");
        console.log("evaluate the errors, fix if possible, decide for yourself if things are alright and if you want to delete the old boost documents and fields");
    }
}

//redundantly double-checks to make sure the above function makes things happen correctly i guess
async function validateStuff(n){
    var areWeGood = true;
    if(n==0){
        console.log("assuming you're re-running this bc no boostV2s were added, otherwise there is a problem");
    }else if((await Post.find({$or:[{type:'original'},{type:'boost'}]})).length != n){
        console.log("not as many boostV2 documents added as should have been")
        areWeGood = false;
    }
    User.findOneAndUpdate({username:'bigpredatorymollusk'},{username:'giantpredatorymollusk'},()=>{;});
    await Post.find({$or:[{type:'original'},{type:'community'}]},{author:1,timestamp:1,lastUpdated:1,comments:1,boosts:1,boostsV2:1}).then(async posts => {
        await asyncForEach(posts, async function (post) {
            if(post.boostsV2.length < 1){
                console.log(post._id.toString()+" has no boostsV2, not even the implicit authorial one");
                areWeGood = false;
            }
            if(post.boosts.length!=1){
                await asyncForEach(post.boosts, async function (boostId) {
                    await Post.findOne({_id: boostId},{author:1,timestamp:1}).then(boost => {
                        var boostsV2WithThisAuthor = post.boostsV2.filter(boostV2 => { return boostV2.booster.equals(boost.author)});
                        if(!boostsV2WithThisAuthor){
                            console.log(post._id.toString()+" does not store a boost from author "+boost.author.toString());
                            areWeGood = false;
                        }
                        boostsV2WithThisAuthor.forEach(boostV2=>{
                            if(boost.timestamp.getTime() > boostV2.timestamp.getTime()){
                                console.log(post._id.toString()+" does not store the most recent boost from author "+boost.author.toString());
                                areWeGood = false;
                            }
                        })
                    })
                })
            }
            for(var i=0;i<post.boostsV2.length;i++){
                if(i != post.boostsV2.length-1){
                    if(post.boostsV2.filter(boostV2=>{post.boostsV2[i].author==boostV2.author}).length>1){
                        console.log(post._id.toString()+" has more than one boostsV2 entry with the same author");
                        areWeGood = false;
                    }
                    if(post.boostsV2[i].timestamp.getTime() > post.boostsV2[i+1].timestamp.getTime()){
                        console.log(post._id.toString()+" has boostsV2 entries out of order");
                        areWeGood = false;
                    }else if(post.boostsV2[i].timestamp.getTime() == post.boostsV2[i+1].timestamp.getTime()){
                        console.log(post._id.toString()+" has boostsV2 entries with the same timestamp somehow");
                        areWeGood = false;
                    }
                }
                //look for equivalent old boosts document
                 //there won't be one if it's the implicit authorial one, so this first line stops it from logging that error
                if(!(i===0 && post.boostsV2[i].booster._id.equals(post.author) && post.boostsV2[i].timestamp.getTime() == post.timestamp.getTime())
                   && !(await Post.findOne({type:'boost',author:post.boostsV2[i].booster,timestamp:post.boostsV2[i].timestamp}))
                ){
                    console.log(post.boostsV2[i]._id.toString()+" in post "+post._id.toString()+" does not have an equivalent old boost document");
                    areWeGood = false;
                }
            }
            if(post.comments.length > 0){
                if(post.lastUpdated.getTime() != Math.max(post.boostsV2[post.boostsV2.length-1].timestamp,post.comments[post.comments.length-1].timestamp.getTime())){
                    console.log(post._id.toString()+" has incorrect lastUpdated date");
                    areWeGood = false;
                }
            }else{
                if(post.lastUpdated.getTime() != post.boostsV2[post.boostsV2.length-1].timestamp.getTime()){
                    console.log(post._id.toString()+" has incorrect lastUpdated date");
                    areWeGood = false;
                }
            }
        })
    })
    return areWeGood;
}

//once all boosts have been folded into their target posts as embedded documents, we don't need the seperate documents for them anymore!
function deleteOldBoostPosts(){
    //remove old "boosts" field
    Post.updateMany({},{$unset:{boosts:""}}).then(ok=>{console.log("boosts field removed:"); console.log(ok)});
    //remove "boosters" field, which probably doesn't exist in your database anyway
    Post.updateMany({},{$unset:{boosters:""}}).then(ok=>{console.log("boosts field removed:"); console.log(ok)});;
    //remove boost type posts
    console.log("deleting!!!");
    Post.deleteMany({type:'boost'}).then((ok)=>{
        console.log('deleted '+ok.n+' old boost documents');
    });
}

createBoostsField().then(function(){process.exit()});