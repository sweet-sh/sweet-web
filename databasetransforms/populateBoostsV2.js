const User = require('../app/models/user');
const Post = require('../app/models/post');
var configDatabase = require('../config/database.js');
const shortid = require('shortid')
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

var numOfPushes = 0;

//populates the new post field boostsV2, which is an embedded array of boost documents
async function createBoostsField() {
    await Post.find({$or: [{type: 'original'}, {type: 'community'}]}).then(async posts => {
        for (const post of posts) {
            if (post.boosts.length != 0) {
                for (const boostId of post.boosts) {
                    await Post.findOne({
                        _id: boostId
                    }, {
                        author: 1,
                        timestamp: 1
                    }).then(async boost => {
                        if (!boost) {
                            post.boosts = post.boosts.filter(b => {
                                return b!=boostId
                            });
                            await post.save();
                            return;
                        }
                        //only one boost per booster needs to exist, so we only keep the most recent one.
                        //each successive boost should be more recent than the last, but, doesn't hurt that much to check.
                        //find if there is one from this booster already:
                        var boostV2WithThisAuthor = post.boostsV2.find(boostsV2 => {
                            return boostsV2.booster.equals(boost.author)
                        });
                        //if it is an older one, remove it and delete the boost document it points to
                        if (boostV2WithThisAuthor) {
                            if (boost.timestamp > boostV2WithThisAuthor.timestamp) {
                                await Post.deleteOne({
                                    _id: boostV2WithThisAuthor.boost
                                });
                                post.boosts = post.boosts.filter(bidstring=>{return bidstring!=boostV2WithThisAuthor._id.toString()})
                                post.boostsV2 = post.boostsV2.filter(boostV2 => {
                                    return !boostV2._id.equals(boostV2WithThisAuthor._id);
                                })
                                numOfPushes--;
                                //if there already exists a boostsV2 entry with the same time
                            } else if (boostV2WithThisAuthor.timestamp.getTime() == boost.timestamp.getTime()) {
                                boostV2WithThisAuthor.boost = boostId;
                                return;
                            }
                        }
                        var newboostV2 = {
                            booster: boost.author,
                            timestamp: boost.timestamp,
                            boost: boostId
                        };
                        post.boostsV2.push(newboostV2);
                        numOfPushes++;
                    })
                }
            } else if (post.boostsV2.length != 0) {
                for (boost of post.boostsV2) {
                    if (boost.timestamp.getTime() == post.timestamp.getTime()) {
                        post.boostsV2 = post.boostsV2.filter(b => {
                            return !b._id.equals(boost._id)
                        })
                        await post.save();
                    } else {
                        //if this boostsV2 entry isn't already pointing to a full boost document
                        if (!boost.boost) {
                            //if one already somehow exists for this entry, point this boost entry to it
                            var existingDocForThisBoost = await Post.findOne({
                                type: 'boost',
                                timestamp: boost.timestamp,
                                author: boost.booster
                            });
                            if (existingDocForThisBoost) {
                                boost.boost = existingDocForThisBoost._id;
                            } else {
                                var boostDocument = new Post({
                                    type: 'boost',
                                    authorEmail: post.authorEmail,
                                    author: post.author,
                                    url: shortid.generate(),
                                    privacy: 'public',
                                    timestamp: boost.timestamp,
                                    lastUpdated: boost.timestamp,
                                    boostTarget: post._id
                                });
                                await boostDocument.save().then(savedBoost => {
                                    boost.boost = savedBoost._id;
                                })
                            }
                        }
                    }
                }
            }
            //again, boosts should have been added in order, but it doesn't hurt to make sure
            post.boostsV2 = post.boostsV2.sort((a, b) => {
                b.timestamp - a.timestamp
            });
            //the post is now last updated at the time of the most recent comment or if there are no comments its creation time
            //comments should also be sorted but let's make sure
            if (post.comments.length > 0) {
                post.comments = post.comments.sort((a, b) => {
                    b.timestamp - a.timestamp
                });
                post.lastUpdated = post.comments[post.comments.length - 1].timestamp;
            } else {
                post.lastUpdated = post.timestamp;
            }
            await post.save().catch(err => {
                console.log(error)
            });
        };
    });
    console.log("boostV2s added to post documents: " + numOfPushes);
    if (await validateStuff()) {
        console.log("results validated!")
        //deleteOldBoostFields();
    } else {
        console.log("boostsV2 is populated but the above errors are detected in post documents vis-a-vis boosts");
        console.log("evaluate the errors, fix if possible, decide for yourself if things are alright and if you want to delete the old boost fields");
    }
}

//redundantly double-checks to make sure the above function made things happen correctly i guess
async function validateStuff() {
    var areWeGood = true;
    await Post.find({
        $or: [{
            type: 'original'
        }, {
            type: 'community'
        }]
    }).then(async posts => {
        for (const post of posts) {
            for (const boost of post.boostsV2) {
                if (boost.timestamp.getTime() == post.timestamp.getTime()) {
                    console.log("old implicit boost model still being used in post " + post._id.toString());
                    areWeGood = false;
                }
                if (!(await Post.findById(boost.boost))) {
                    console.log("boost " + boost._id.toString() + " not storing reference to valid boost document")
                    areWeGood = false;
                }
                if ((post.boostsV2.filter(b => {
                        return b.booster.equals(boost.booster)
                    })).length > 1) {
                    console.log("more than one boost per booster stored in post document " + post._id.toString())
                    areWeGood = false;
                }
                if ((post.boostsV2.filter(b => {
                    return b.boost.equals(boost.boost)
                    })).length > 1) {
                    console.log("more than one boost per boost document stored in post document " + post._id.toString())
                    areWeGood = false;
                }
                if ((post.boostsV2.filter(b => {
                    return b.timestamp == boost.timestamp
                    })).length > 1) {
                    console.log("boosts with duplicate timestamps stored in post document " + post._id.toString())
                    areWeGood = false;
                }
            }
        }
    })
    await Post.find({type:'boost'}).then(async boostPosts=>{
        for (bp of boostPosts){
            if(!(await Post.findById(bp.boostTarget))) {
                console.log("post of type boost "+bp._id.toString()+" has a target post "+bp.boostTarget.toString()+" that does not currently exist")
                areWeGood = false;
            }else if(!(await Post.findOne({'boostsV2.boost':bp._id}))){
                console.log("post of type boost "+bp._id.toString()+" is not recorded in a boostsV2 form");
                console.log("its target is "+bp.boostTarget);
                areWeGood = false;
            }
        }
    })
    //don't question this
    User.findOneAndUpdate({username: 'bigpredatorymollusk'}, {username: 'giantpredatorymollusk'}, () => {;});
    return areWeGood;
}

function deleteOldBoostFields() {
    //remove old "boosts" field
    Post.updateMany({}, {
        $unset: {
            boosts: ""
        }
    }).then(ok => {
        console.log("boosts field removed:");
        console.log(ok)
    });
    //remove "boosters" field, which probably doesn't exist in your database anyway
    Post.updateMany({}, {
        $unset: {
            boosters: ""
        }
    }).then(ok => {
        console.log("boosts field removed:");
        console.log(ok)
    });
}

createBoostsField().then(function () {
    process.exit()
});