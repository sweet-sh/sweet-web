const Post = require('../app/models/post');
var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
    useNewUrlParser: true
}); // connect to our database


Post.updateMany({},{$unset:{imageTags:""}}).then(ok=>{console.log("imageTags field removed:"); console.log(ok)});
Post.updateMany({},{$unset:{images_v3:""}}).then(ok=>{console.log("images_v3 field removed:"); console.log(ok)});
Post.updateMany({},{$unset:{boosts:""}}).then(ok=>{console.log("boosts field removed:"); console.log(ok)});
Post.updateMany({},{$unset:{boosters:""}}).then(ok=>{console.log("boosters field removed:"); console.log(ok)});