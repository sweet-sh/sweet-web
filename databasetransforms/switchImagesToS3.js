var configDatabase = require('../config/database.js');
var mongoose = require('mongoose');
mongoose.connect(configDatabase.url, {
  useNewUrlParser: true
}); // connect to our database
const User = require('../app/models/user');
const Community = require('../app/models/community');


//stolen from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404?gi=27abcb930540
//regular foreach does not await async functions you give it, this does
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

async function changeUserImages() {
  await User.find({}, {
    image: 1
  }).then(async users => {
    await asyncForEach(users, async function (user) {
      if (user.image) {
        let a = user.image.split("/");
        let f = a[a.length - 1];
        user.image = 'users/' + f;
        user.save()
      }
    });
  });
}

async function changeCommunityImages() {
  await Community.find({}, {
    _id: 1,
    image: 1,
  }).then(async communities => {
    await asyncForEach(communities, async function (community) {
      if (community.image) {
        let a = community.image.split("/");
        let f = a[a.length - 1];
        community.image = 'communities/' + f;
        community.save()
      }
    });
  })
    .catch(error => {
      console.log(error)
    })
}

// changeUserImages();
changeCommunityImages();
