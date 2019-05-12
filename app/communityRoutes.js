const User            = require('../app/models/user');
const Relationship    = require('../app/models/relationship');
const Post    = require('../app/models/post');
const Tag    = require('../app/models/tag');
const Community    = require('../app/models/community');
const Vote    = require('../app/models/vote');
const Image    = require('../app/models/image');

var ObjectId = require('mongoose').Types.ObjectId;

var moment = require('moment');

const notifier = require('./notifier.js');

// var sanitizeHtml = require('sanitize-html');
//
// sanitizeHtmlOptions = {
//   allowedTags: [ 'em', 'strong', 'a', 'p', 'br', 'div', 'span' ],
//   allowedAttributes: {
//     'a': [ 'href', 'data-*', 'target', 'rel'  ]
//   }
// }

moment.updateLocale('en', {
    relativeTime : {
        future: "in %s",
        past:   "%s ago",
        s  : '1s',
        ss : '%ds',
        m:  "1m",
        mm: "%dm",
        h:  "1h",
        hh: "%dh",
        d:  "1d",
        dd: "%dd",
        M:  "1mon",
        MM: "%dmon",
        y:  "1y",
        yy: "%dy"
    }
});

const today = moment().clone().startOf('day');
const thisyear = moment().clone().startOf('year');

var sanitize = require('mongo-sanitize');
const sharp = require('sharp');
var shortid = require('shortid');
const fs = require('fs');

var Autolinker = require( 'autolinker' );

const schedule = require('node-schedule');

const expiryTimers = [];

module.exports = function(app, passport) {

  app.get('/api/community/getall/:page', isLoggedIn, function(req, res) {

    let postsPerPage = 10;
    let page = req.params.page-1;

    Community.find()
    .sort('-lastUpdated')
    .skip(postsPerPage * page)
    .limit(postsPerPage)
    .then(communities => {
      if (!communities.length){
        res.status(404)
        .send('Not found');
      }
      else {
        res.render('partials/communities', {
          layout: false,
          loggedInUserData: loggedInUserData,
          communities: communities
        });
      }
    })
  })

  app.get('/communities', isLoggedIn, function(req, res) {
    // User.findOne({
    //   _id: loggedInUserData._id
    // })
    // .populate('communities')
    // .then((user) => {
    Community.find({
      members: loggedInUserData._id
    }).sort('name')
    .then((communities) => {
      res.render('communities', {
        loggedIn: true,
        loggedInUserData: loggedInUserData,
        communities: communities,
        activePage: 'communities'
      })
    })
    .catch((err) => {
      console.log("Error in profileData.")
      console.log(err);
    });
  });

  app.get('/community/:slug', function(req, res) {
    if (req.isAuthenticated()){
      isLoggedIn = true;
      loggedInUserData = req.user;
    }
    else {
      isLoggedIn = false;
    }
    let isMember = false;
    let hasRequested = false;
    let isBanned = false;
    let isMuted = false;
    Community.findOne({
      slug: req.params.slug
    })
    .populate('members')
    .populate('membershipRequests')
    .populate('bannedMembers')
    .populate('mutedMembers')
    .then(community => {
      if (community){
        if (isLoggedIn){
          let memberIds = community.members.map(a => a._id.toString());
          let bannedMemberIds = community.bannedMembers.map(a => a._id.toString());
          let mutedMemberIds = community.mutedMembers.map(a => a._id.toString());
          let membershipRequestIds = community.membershipRequests.map(a => a._id.toString());
          if (memberIds.includes(loggedInUserData._id.toString())){
            isMember = true;
          }
          if (membershipRequestIds.includes(loggedInUserData._id.toString())){
            hasRequested = true;
          }
          if (bannedMemberIds.includes(loggedInUserData._id.toString())){
            isBanned = true;
          }
          if (mutedMemberIds.includes(loggedInUserData._id.toString())){
            isMuted = true;
          }
          Vote.find({
            community: community._id,
            status: 'active'
          })
          .populate('creator')
          .sort('-timestamp')
          .then(votes => {
            votes.forEach(function(vote){
              if (mutedMemberIds.includes(vote.creator._id.toString())){
                vote.canDisplay = false;
              }
              else {
                vote.canDisplay = true;
              }
              if (moment(vote.timestamp).isSame(today, 'd')) {
                vote.parsedTimestamp = moment(vote.timestamp).fromNow();
              }
              else if (moment(vote.timestamp).isSame(thisyear, 'y')) {
                vote.parsedTimestamp = moment(vote.timestamp).format('D MMM');
              }
              else {
                vote.parsedTimestamp = moment(vote.timestamp).format('D MMM YYYY');
              }
              vote.parsedExpiry = moment(vote.expiryTime).locale('en-GB').fromNow();
              if (vote.reference == "userban" || vote.reference == "userunban" || vote.reference == "usermute" || vote.reference == "userunmute"){
                vote.group = "uservotes";
                User.findOne({
                  _id: vote.proposedValue
                })
                .then(user => {
                  vote.userData = user;
                })
              }
            })
            community.mutedMembers.forEach(member => {
              if (bannedMemberIds.includes(member._id.toString()))
                member.isBanned = true;
            })
            let majorityMargin = helper.isOdd(community.votingMembersCount) ? (community.votingMembersCount / 2) + 0.5 : (community.votingMembersCount / 2) + 1
            notifier.markRead(loggedInUserData._id, community._id);
            res.render('community', {
              loggedIn: isLoggedIn,
              loggedInUserData: loggedInUserData,
              communityData: community,
              isMember: isMember,
              hasRequested: hasRequested,
              votes: votes,
              majorityMargin: majorityMargin,
              isBanned: isBanned,
              isMuted: isMuted,
              bannedMemberIds: bannedMemberIds
            })
          })
        }
        else {
          res.render('community', {
            loggedIn: false,
            loggedInUserData: "",
            communityData: community,
            isMember: false,
            hasRequested: false,
            votes: "",
            majorityMargin: "",
            isBanned: false
          })
        }
      }
      else {
        res.status(404).redirect('/404');
      }
    })
  });

  app.get('/api/community/getbyid/:communityid', isLoggedIn, function(req, res) {
      Community.findOne({
        _id: req.params.communityid
      }).then((community) => {
        res.redirect('/community/'+community.slug);
      })
  });

  app.post('/api/community/create', isLoggedIn, function(req, res) {
    console.log("Creating community")
    let newCommunityData = req.body;
    let newCommunitySlug = helper.slugify(newCommunityData.communityName);
    Community.findOne({
      slug: newCommunitySlug
    })
    .then(community => {
      if (community) {
        req.session.sessionFlash = {
          type: 'warning',
          message: 'A community with this URL (' + newCommunitySlug + ') already exists.',
          newCommunityData: newCommunityData
        }
      return res.redirect('back');
      }
      else {
        let imageEnabled = false;
        let imageUrl = "";
        let communityUrl = shortid.generate();
        if (req.files.imageUpload) {
          if (req.files.imageUpload.data.length > 3145728){
            console.error("Image too large!")
            req.session.sessionFlash = {
              type: 'warning',
              message: 'File too large. The file size limit is 3MB.',
              communityData: newCommunityData
            }
            return res.redirect('back');
          }
          else {
            console.log("Saving image")
            imageEnabled = true;
            sharp(req.files.imageUpload.data)
              .resize({
                width: 600,
                height: 600
              })
              .jpeg({
                quality: 70
              })
              .toFile('./public/images/communities/' + communityUrl + '.jpg')
              .catch(err => {
                console.error(err);
            });
          }
        }

        const community = new Community({
          created: new Date(),
          name: sanitize(newCommunityData.communityName),
          slug: newCommunitySlug,
          url: communityUrl,
          descriptionRaw: sanitize(newCommunityData.communityDescription),
          descriptionParsed: helper.parseText(newCommunityData.communityDescription).text,
          rulesRaw: sanitize(newCommunityData.communityRules),
          rulesParsed: helper.parseText(newCommunityData.communityRules).text,
          image: imageEnabled ? communityUrl + '.jpg' : 'cake.svg',
          imageEnabled: imageEnabled,
          settings: {
            visibility: newCommunityData.communityVisibility,
            joinType: newCommunityData.communityJoinType,
            voteThreshold: 50,
            voteLength: newCommunityData.communityVoteLength
          },
          members: [loggedInUserData._id]
        });
        community.save()
        .then(community => {
          User.findOne({
            _id: loggedInUserData._id
          })
          .then(user => {
            user.communities.push(community._id);
            user.save()
          })
          .then(user => {
            touchCommunity(community._id)
            console.log("Created community!")
            res.redirect('/community/' + newCommunitySlug)
          });
        })
      }
    })
  });

  app.post('/api/community/delete', isLoggedIn, function(req, res) {

  });
  app.post('/api/community/update', isLoggedIn, function(req, res) {

  });

  app.post('/api/community/user/join/:communityid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      community.members.push(loggedInUserData._id)
      community.save()
    })
    .then(community => {
      User.findOne({
        _id: loggedInUserData._id
      })
      .then(user => {
        user.communities.push(req.params.communityid)
        user.save()
      })
    })
    .then(success => {
      touchCommunity(req.params.communityid)
      res.end('{"success" : "Updated Successfully", "status" : 200}');
    })
  });

  app.post('/api/community/user/request/:communityid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      community.membershipRequests.push(loggedInUserData._id)
      community.save()
      .then(save => {
        community.members.forEach(member => {
          notifier.notify('community', 'request', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'request')
        })
        res.end('{"success" : "Updated Successfully", "status" : 200}');
      })
    })
  });

  app.post('/api/community/user/leave/:communityid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      community.members.pull(loggedInUserData._id)
      community.save()
    })
    .then(community => {
      User.findOne({
        _id: loggedInUserData._id
      })
      .then(user => {
        user.communities.pull(req.params.communityid)
        user.save()
      })
    })
    .then(success => {
      res.end('{"success" : "Updated Successfully", "status" : 200}');
    })
  });

  app.post('/api/community/user/mute/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      voteUrl = shortid.generate();
      created = new Date();
      expiryTime = created.setDate(created.getDate() + (community.settings.voteLength ? community.settings.voteLength : 7));
      if (community.members.length - community.mutedMembers.length === 1){
        // This vote automatically passes
        votesNumber = 0;
      }
      else {
        votesNumber = 1;
      }
      if (isMember) {
        const vote = new Vote({
          status: 'active',
          community: req.params.communityid,
          reference: 'usermute',
          proposedValue: req.params.userid,
          creatorEmail: loggedInUserData.email,
          creator: loggedInUserData._id,
          url: voteUrl,
          timestamp: created,
          lastUpdated: created,
          voteThreshold: 50,
          expiryTime: expiryTime,
          votes: votesNumber,
          voters: votesNumber == 1 ? [loggedInUserData._id] : [],
        })
        voteId = vote._id;
        vote.save()
        .then(vote => {
          var expireVote = schedule.scheduleJob(expiryTime, function(){
            Vote.findOne({
              _id: vote._id
            })
            .then(vote => {
              vote.status = "expired"
              vote.save();
            })
          });
          community.members.forEach(member => {
            notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
          })
          expiryTimers.push(expireVote);
          res.end('{"success" : "Updated Successfully", "status" : 200}');
        })
      }
      else {
        console.log("User not authorised to mute user.")
      }
    })
  })

  app.post('/api/community/user/unmute/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then((community) => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      voteUrl = shortid.generate();
      created = new Date();
      expiryTime = created.setDate(created.getDate() + (community.settings.voteLength ? community.settings.voteLength : 7));
      if (community.members.length - community.mutedMembers.length === 1){
        // This vote automatically passes
        votesNumber = 0;
      }
      else {
        votesNumber = 1;
      }
      if (isMember) {
        const vote = new Vote({
          status: 'active',
          community: req.params.communityid,
          reference: 'userunmute',
          proposedValue: req.params.userid,
          creatorEmail: loggedInUserData.email,
          creator: loggedInUserData._id,
          url: voteUrl,
          timestamp: created,
          lastUpdated: created,
          voteThreshold: 50,
          expiryTime: expiryTime,
          votes: votesNumber,
          voters: votesNumber == 1 ? [loggedInUserData._id] : [],
        })
        voteId = vote._id;
        vote.save()
        .then(vote => {
          var expireVote = schedule.scheduleJob(expiryTime, function(){
            Vote.findOne({
              _id: vote._id
            })
            .then(vote => {
              vote.status = "expired"
              vote.save();
            })
          });
          expiryTimers.push(expireVote);
          community.members.forEach(member => {
            notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
          })
          res.end('{"success" : "Updated Successfully", "status" : 200}');
        })
      }
      else {
        console.log("User not authorised to unmute user.")
      }
    })
  });

  app.post('/api/community/user/ban/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then((community) => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      voteUrl = shortid.generate();
      created = new Date();
      expiryTime = created.setDate(created.getDate() + (community.settings.voteLength ? community.settings.voteLength : 7));
      if (community.members.length - community.mutedMembers.length === 1){
        // This vote automatically passes
        votesNumber = 0;
      }
      else {
        votesNumber = 1;
      }
      if (isMember) {
        const vote = new Vote({
          status: 'active',
          community: req.params.communityid,
          reference: 'userban',
          proposedValue: req.params.userid,
          creatorEmail: loggedInUserData.email,
          creator: loggedInUserData._id,
          url: voteUrl,
          timestamp: created,
          lastUpdated: created,
          voteThreshold: 50,
          expiryTime: expiryTime,
          votes: votesNumber,
          voters: votesNumber == 1 ? [loggedInUserData._id] : [],
        })
        voteId = vote._id;
        vote.save()
        .then(vote => {
          var expireVote = schedule.scheduleJob(expiryTime, function(){
            Vote.findOne({
              _id: vote._id
            })
            .then(vote => {
              vote.status = "expired"
              vote.save();
            })
          });
          expiryTimers.push(expireVote);
          community.members.forEach(member => {
            notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
          })
          res.end('{"success" : "Updated Successfully", "status" : 200}');
        })
      }
      else {
        console.log("User not authorised to ban user.")
      }
    })
  });

  app.post('/api/community/user/unban/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then((community) => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      voteUrl = shortid.generate();
      created = new Date();
      expiryTime = created.setDate(created.getDate() + (community.settings.voteLength ? community.settings.voteLength : 7));
      if (community.members.length - community.mutedMembers.length === 1){
        // This vote automatically passes
        votesNumber = 0;
      }
      else {
        votesNumber = 1;
      }
      if (isMember) {
        const vote = new Vote({
          status: 'active',
          community: req.params.communityid,
          reference: 'userunban',
          proposedValue: req.params.userid,
          creatorEmail: loggedInUserData.email,
          creator: loggedInUserData._id,
          url: voteUrl,
          timestamp: created,
          lastUpdated: created,
          voteThreshold: 50,
          expiryTime: expiryTime,
          votes: votesNumber,
          voters: votesNumber == 1 ? [loggedInUserData._id] : [],
        })
        voteId = vote._id;
        vote.save()
        .then(vote => {
          var expireVote = schedule.scheduleJob(expiryTime, function(){
            Vote.findOne({
              _id: vote._id
            })
            .then(vote => {
              vote.status = "expired"
              vote.save();
            })
          });
          expiryTimers.push(expireVote);
          community.members.forEach(member => {
            notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
          })
          res.end('{"success" : "Updated Successfully", "status" : 200}');
        })
      }
      else {
        console.log("User not authorised to unban user.")
      }
    })
  });

  app.post('/api/community/user/accept/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      if (isMember) {
        community.members.push(req.params.userid)
        community.membershipRequests.pull(req.params.userid)
        community.save()
        User.findOne({
          _id: req.params.userid
        })
        .then(user => {
          user.communities.push(req.params.communityid)
          user.save()
          console.log("Notifyin' member " + user.username)
          notifier.notify('community', 'requestResponse', user._id, req.user._id, community._id, '/api/community/getbyid/' + community._id, 'approved')
          touchCommunity(req.params.communityid)
          res.end('{"success" : "Updated Successfully", "status" : 200}');
        })
      }
      else {
        console.log("User not authorised to approve request.")
      }
    })
  });

  app.post('/api/community/user/reject/:communityid/:userid', isLoggedIn, function(req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      let memberIds = community.members.map(a => a._id.toString());
      if (memberIds.includes(loggedInUserData._id.toString())){
        isMember = true;
      }
      if (isMember) {
        community.membershipRequests.pull(req.params.userid)
        community.save()
      }
      else {
        console.log("User not authorised to approve request.")
      }
      if (isMember) {
        notifier.notify('community', 'requestResponse', req.params.userid, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'rejected')
        res.end('{"success" : "Updated Successfully", "status" : 200}');
      }
    })
  });

  app.post('/api/community/vote/create/:communityid', isLoggedIn, function(req, res) {
    console.log(req.body)
    if (req.body.reference == "image"){
      imageUrl = shortid.generate() + '.jpg';
      if (req.files.proposedValue.data.length > 3145728){
        console.error("Image too large!")
        req.session.sessionFlash = {
          type: 'warning',
          message: 'File too large. The file size limit is 3MB.'
        }
        return res.redirect('back');
      }
      else {
        sharp(req.files.proposedValue.data)
          .resize({
            width: 600,
            height: 600
          })
          .jpeg({
            quality: 70
          })
          .toFile('./public/images/communities/staging/' + imageUrl)
          .catch(err => {
            console.error(err);
        });
      }
    }
    let parsedReferences = {
      name: "name",
      description: "description",
      rules: "rules",
      image: "display image",
      visibility: "post visibility",
      joinType: "joining method",
      voteLength: "vote length"
    }
    let parsedJoinType = {
      open: 'Open (anyone is free to join)',
      approval: 'Approval (requests to join must be approved by a current member)',
      closed: 'Closed (only invited users can join)'
    }
    let parsedVisibility = {
      public: 'Public (posts visible to all sweet users)',
      private: 'Private (posts visible only to members)'
    }
    let parsedVoteLength = {
      1: '1 day',
      3: '3 days',
      7: '7 days',
      14: '14 days',
      30: '30 days'
    }
    let parsedReference = parsedReferences[req.body.reference]
    if (req.body.reference == "description" || req.body.reference == "rules"){
      proposedValue = sanitize(req.body.proposedValue)
      parsedProposedValue = helper.parseText(req.body.proposedValue).text
    }
    else if (req.body.reference == "joinType"){
      proposedValue = sanitize(req.body.proposedValue)
      parsedProposedValue = parsedJoinType[req.body.proposedValue]
    }
    else if (req.body.reference == "visibility"){
      proposedValue = sanitize(req.body.proposedValue)
      parsedProposedValue = parsedVisibility[req.body.proposedValue]
    }
    else if (req.body.reference == "voteLength"){
      proposedValue = req.body.proposedValue
      parsedProposedValue = parsedVoteLength[req.body.proposedValue]
    }
    else if (req.body.reference == "image"){
      proposedValue = imageUrl
      parsedProposedValue = imageUrl
    }
    else if (req.body.reference == "name"){
      proposedValue = sanitize(req.body.proposedValue)
      parsedProposedValue = helper.parseText(req.body.proposedValue).text
    }
    Community.findOne({
      _id: req.params.communityid
    })
    .then(community => {
      voteUrl = shortid.generate();
      created = new Date();
      expiryTime = created.setDate(created.getDate() + (community.settings.voteLength ? community.settings.voteLength : 7));
      if (community.members.length - community.mutedMembers.length === 1){
        // This vote automatically passes
        votesNumber = 0;
      }
      else {
        votesNumber = 1;
      }
      const vote = new Vote({
        status: 'active',
        community: req.params.communityid,
        reference: req.body.reference,
        parsedReference: parsedReference,
        proposedValue: proposedValue,
        parsedProposedValue: parsedProposedValue,
        creatorEmail: loggedInUserData.email,
        creator: loggedInUserData._id,
        url: voteUrl,
        timestamp: created,
        lastUpdated: created,
        voteThreshold: 50,
        expiryTime: expiryTime,
        votes: votesNumber,
        voters: votesNumber == 1 ? [loggedInUserData._id] : [],
      })
      voteId = vote._id;
      vote.save()
      .then(vote => {
        var expireVote = schedule.scheduleJob(expiryTime, function(){
          Vote.findOne({
            _id: vote._id
          })
          .then(vote => {
            vote.status = "expired"
            vote.save();
          })
        });
        expiryTimers.push(expireVote);
        community.members.forEach(member => {
          notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
        })
        touchCommunity(req.params.communityid)
        res.redirect('back')
      })
    })
  });
  app.post('/api/community/vote/delete/:voteid', isLoggedIn, function(req, res) {
    Vote.findByIdAndRemove(req.params.voteid)
    .then(vote => {
      res.end('{"success" : "Updated Successfully", "status" : 200}');
    })
  });

  app.post('/api/community/vote/cast/:communityid/:voteid', isLoggedIn, function(req, res) {
    Vote.findOne({
      _id: req.params.voteid
    })
    .then(vote => {
      vote.votes++;
      vote.voters.push(loggedInUserData._id);
      vote.save()
      .then(vote => {
        Community.findOne({
          _id: req.params.communityid
        })
        .then(community => {
          let majorityMargin = helper.isOdd(community.votingMembersCount) ? (community.votingMembersCount / 2) + 0.5 : (community.votingMembersCount / 2) + 1
          if (vote.votes >= majorityMargin) {
            console.log("Vote passed!")
            if (vote.reference == "visibility"){
              community.settings[vote.reference] = vote.proposedValue;
              Image.find({context: "community", community: community._id}).then(images =>{
                console.log(images);
                images.forEach(function(image){
                  console.log(image);
                  image.privacy = vote.proposedValue;
                  image.save();
                })
              })
            }else if(vote.reference == "joinType" || vote.reference == "voteLength") {
              community.settings[vote.reference] = vote.proposedValue;
            }
            else if (vote.reference == "description" || vote.reference == "rules") {
              community[vote.reference + "Raw"] = vote.proposedValue;
              community[vote.reference + "Parsed"] = vote.parsedProposedValue;
            }
            else if (vote.reference == "image") {
              fs.rename(global.appRoot + "/public/images/communities/staging/" + vote.proposedValue, global.appRoot + "/public/images/communities/" + vote.proposedValue, function() {
                community[vote.reference] = vote.proposedValue;
                community['imageEnabled'] = true;
                community.save()
              })
            }
            else if (vote.reference == "name") {
              community[vote.reference] = vote.proposedValue;
            }
            else if (vote.reference == "userban") {
              community.members.pull(vote.proposedValue)
              community.bannedMembers.push(vote.proposedValue)
              User.findOne({
                _id: vote.proposedValue
              })
              .then(user => {
                user.communities.pull(req.params.communityid);
                user.bannedCommunities.push(req.params.communityid);
                user.save()
              })
            }
            else if (vote.reference == "usermute") {
              // community.members.pull(vote.proposedValue)
              community.mutedMembers.push(vote.proposedValue)
              User.findOne({
                _id: vote.proposedValue
              })
              .then(user => {
                user.mutedCommunities.push(req.params.communityid);
                user.save()
              })
            }
            else if (vote.reference == "userunban") {
              community.bannedMembers.pull(vote.proposedValue)
              User.findOne({
                _id: vote.proposedValue
              })
              .then(user => {
                user.bannedCommunities.pull(req.params.communityid);
                user.save()
              })
            }
            else if (vote.reference == "userunmute") {
              community.mutedMembers.pull(vote.proposedValue)
              User.findOne({
                _id: vote.proposedValue
              })
              .then(user => {
                user.mutedCommunities.pull(req.params.communityid);
                user.save()
              })
            }
            community.save()
            .then(community => {
              Vote.findOne({
                _id: req.params.voteid
              })
              .then(vote => {
                vote.status = "passed"
                vote.save()
                if (vote.reference == "userban"){
                  User.findOne({
                    _id: vote.proposedValue
                  })
                  .then(user => {
                    console.log(user)
                    Post.deleteMany({
                      community: req.params.communityid,
                      authorEmail: user.email
                    }, function(callback){
                      console.log(callback)
                    })
                    Vote.deleteMany({
                      community: req.params.communityid,
                      creatorEmail: user.email
                    }, function(callback){
                      console.log(callback)
                    })
                  });
                  community.members.forEach(member => {
                    notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'banned')
                  })
                  notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'banned')
                }
                if (vote.reference == "userunban"){
                  community.members.forEach(member => {
                    notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unbanned')
                  })
                  notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unbanned')
                }
                if (vote.reference == "usermute"){
                  console.log("User muted - sending notifications")
                  community.members.forEach(member => {
                    console.log("Notification sending to " + member)
                    notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'muted')
                  })
                  notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'muted')
                }
                if (vote.reference == "userunmute"){
                  community.members.forEach(member => {
                    notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unmuted')
                  })
                  notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unmuted')
                }
                else {
                  community.members.forEach(member => {
                    notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'passed')
                  })
                }
                touchCommunity(req.params.communityid)
                res.end('{"success" : "Updated Successfully", "status" : 200}');
              })
            })
          }
          else {
            console.log("Vote cast.")
            touchCommunity(req.params.communityid)
            res.end('{"success" : "Updated Successfully", "status" : 200}');
          }
        })
      })
    })
  });

  app.post('/api/community/vote/withdraw/:communityid/:voteid', isLoggedIn, function(req, res) {
    Vote.findOne({
      _id: req.params.voteid
    })
    .then(vote => {
      vote.votes--;
      vote.voters.pull(loggedInUserData._id);
      vote.save()
      .then(vote => {
        res.end('{"success" : "Updated Successfully", "status" : 200}');
      })
    })
  });

  app.post('/api/community/post/create/:communityid/:communityurl', isLoggedIn, function(req, res) {
    let communityId = req.params.communityid;
    let communityUrl = req.params.communityurl;
    newPostUrl = shortid.generate();
    var postImage = req.body.postImageUrl != "" ? [req.body.postImageUrl] : [];
    var postImageTags = req.body.postImageTags != "" ? [req.body.postImageTags] : [];
    var postImageDescription = req.body.postImageDescription != "" ? [req.body.postImageDescription] : [];

    let parsedResult = helper.parseText(req.body.postContent, req.body.postContentWarnings)

    const post = new Post({
      type: 'community',
      community: communityId,
      authorEmail:  loggedInUserData.email,
      author: loggedInUserData._id,
      url: newPostUrl,
      privacy: 'public',
      timestamp: new Date(),
      lastUpdated: new Date(),
      rawContent: sanitize(req.body.postContent),
      parsedContent: parsedResult.text,
      numberOfComments: 0,
      mentions: parsedResult.mentions,
      tags: parsedResult.tags,
      contentWarnings: sanitize(req.body.postContentWarnings),
      imageVersion: 2,
      images: postImage,
      imageTags: postImageTags,
      imageDescriptions: postImageDescription,
      subscribedUsers: [loggedInUserData._id]
    });
    let newPostId = post._id;

    // Parse images
    if (req.body.postImageUrl){
      fs.rename("./cdn/images/temp/"+req.body.postImageUrl, "./cdn/images/"+req.body.postImageUrl, function(e){
        if(e){
          console.log("could not move "+req.body.postImageUrl+" out of temp");
          console.log(e);
        }
      }) //move images out of temp storage
      Community.findOne({
        _id: communityId
      })
      .then(community => {
        image = new Image({
          context: "community",
          filename: postImage,
          privacy: community.settings.visibility,
          user: loggedInUserData._id,
          community: communityId
        })
        image.save();
      })
    }

    post.save()
    .then(() => {
      parsedResult.tags.forEach((tag) => {
        Tag.findOneAndUpdate({ name: tag }, { "$push": { "posts": newPostId } }, { upsert: true, new: true }, function(error, result) {
            if (error) return
        });
      });
      // This is a public post, notify everyone in this community
      parsedResult.mentions.forEach(function(mention){
        User.findOne({
          username: mention,
          communities: communityId
        })
        .then((user) => {
          notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
        })
      });
      touchCommunity(req.params.communityid)
      res.redirect('back');
    })
    .catch((err) => {
      console.log("Database error: " + err)
    });
  })
};

function touchCommunity(id) {
  Community.findOneAndUpdate(
    { _id: id },
    { $set: { lastUpdated: new Date() } }
  ).then(community => {
    console.log("Updated community!")
  })
}


function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()){
    loggedInUserData = req.user;
    return next();
  }
  res.redirect('/');
}
