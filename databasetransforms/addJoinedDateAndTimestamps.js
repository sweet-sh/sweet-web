const User = require('../app/models/user');
const Post = require('../app/models/post');
ObjectId = require('mongoose').Types.ObjectId;
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database

ObjectId.prototype.getTimestamp = function () {
    return new Date(parseInt(this.toString().slice(0, 8), 16) * 1000);
}

async function addJoinedDate() {
    var missingJoined = await User.find({
        joined: {
            $exists: false
        }
    });
    for (mj of missingJoined) {
        mj.joined = mj._id.getTimestamp();
        await mj.save()
    }
}

async function addTimestamp() {
    var missingTimestamp = await Post.find({
        timestamp: {
            $exists: false
        }
    });
    for (mt of missingTimestamp) {
        mt.timestamp = mt._id.getTimestamp();
        await mt.save()
    }
}

async function doThat() {
    await addJoinedDate()
    await addTimestamp()
}

doThat().then(()=>{console.log("added timestamps and joined dates");process.exit()})