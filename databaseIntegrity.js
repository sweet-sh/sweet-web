const User = require('./app/models/user');
const Community = require('./app/models/community');
var configDatabase = require('./config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, { useNewUrlParser: true }); // connect to our database

//Check to see if there are any communities with someone who's a member acc to the user document but who is not in their "members" array

User.find({}).then(users => {
    users.forEach(function(user) {
        user.communities.forEach(function(commID) {
            Community.findOne({_id: commID}).then( community => {
                if(community.members.indexOf(user._id) == -1){
                    console.log("bad news: community \""+community.name+"\" does not have user \""+user.displayName+"\" in its members array");
                    /*console.log("fixing");
                    communities.members.push(user._id);
                    communities.save();*/
                }
            })
        });
      });
});

//Check to see if there are any members of a community (acc to the communities document) without the community in their "communities" array

Community.find({}).then(comms => {
    comms.forEach(function(comm) {
        comm.members.forEach(function(memberID) {
            User.findOne({_id: memberID}).then( user => {
                if(user.communities.indexOf(comm._id) == -1){
                    console.log("bad news: user \""+user.displayName+"\" does not have community \""+comm.name+"\" in their communities array");
                    /*console.log("fixing");
                    user.communities.push(comm._id);
                    user.save();*/
                }
            })
        });
      });
});