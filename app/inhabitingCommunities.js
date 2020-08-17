const mongoose = require('mongoose')
const sharp = require('sharp')
const nanoid = require('nanoid')
const schedule = require('node-schedule')
const fs = require('fs')
const moment = require('moment')
const helper = require('./utilityFunctionsMostlyText')
const CommunityPlaceholder = mongoose.model('Community Placeholder')
const Community = require('./models/community')
const Vote = require('./models/vote')
const User = require('./models/user')
const Post = require('./models/post')
const notifier = require('./notifier')

// this is never read from but it could be someday i guess
const expiryTimers = []

// set vote expiration timers when the server starts up
Vote.find({}).then(votes => {
  for (const vote of votes) {
    // account for votes that expired while server was down
    if (vote.expiryTime.getTime() < new Date() && vote.status !== 'expired') {
      vote.status = 'expired'
      vote.save()
      // account for currently active votes that need to be scheduled to expire
    } else if (vote.status === 'active') {
      const expireVote = schedule.scheduleJob(vote.expiryTime, function () {
        if (vote) {
          vote.status = 'expired'
          vote.save()
        }
      })
      expiryTimers.push(expireVote)
    }
  }
})

module.exports = function (app) {
  app.get('/api/community/getall/:page', isLoggedIn, function (req, res) {
    const postsPerPage = 10
    const page = req.params.page - 1

    Community.find()
      .sort('-lastUpdated')
      .skip(postsPerPage * page)
      .limit(postsPerPage)
      .then(communities => {
        if (!communities.length) {
          res.status(404)
            .send('Not found')
        } else {
          communities.forEach(community => community.excerpt = community.descriptionParsed.replace(/<[^>]+>/g, ' ').replace(/^(.{160}[^\s]*).*/, "$1..."))
          res.render('partials/communities', {
            layout: false,
            loggedInUserData: req.user,
            communities: communities
          })
        }
      })
  })

  app.get('/communities', isLoggedIn, function (req, res) {
    Community.find({
      members: req.user._id
    })
    .collation({
      locale: 'en'
    })
    .sort('name')
    .then((communities) => {
      communities.forEach(community => community.excerpt = community.descriptionParsed.replace(/<[^>]+>/g, ' ').replace(/^(.{160}[^\s]*).*/, "$1..."))
      res.render('communities', {
        loggedIn: true,
        loggedInUserData: req.user,
        communities: communities,
        activePage: 'communities'
      })
    })
    .catch((err) => {
      console.log('Error in profileData.')
      console.log(err)
    })
  })

  app.get('/community', function (req, res) {
    res.redirect('../communities')
  })

  app.get('/community/:slug', function (req, res) {
    const today = moment().clone().startOf('day')
    const thisyear = moment().clone().startOf('year')
    const isLoggedIn = req.isAuthenticated()
    let isMember = false
    let hasRequested = false
    let isBanned = false
    let isMuted = false
    Community.findOne({
      slug: req.params.slug
    })
      .populate('members')
      .populate('membershipRequests')
      .populate('bannedMembers')
      .populate('mutedMembers')
      .populate('welcomeMessageAuthor')
      .then(community => {
        if (community) {
          if (isLoggedIn) {
            const memberIds = community.members.map(a => a._id.toString())
            const bannedMemberIds = community.bannedMembers.map(a => a._id.toString())
            const mutedMemberIds = community.mutedMembers.map(a => a._id.toString())
            const membershipRequestIds = community.membershipRequests.map(a => a._id.toString())
            if (memberIds.includes(req.user._id.toString())) {
              isMember = true
            }
            if (membershipRequestIds.includes(req.user._id.toString())) {
              hasRequested = true
            }
            if (bannedMemberIds.includes(req.user._id.toString())) {
              isBanned = true
            }
            if (mutedMemberIds.includes(req.user._id.toString())) {
              isMuted = true
            }
            Vote.find({
              community: community._id,
              status: 'active'
            })
              .populate('creator')
              .sort('-timestamp')
              .then(votes => {
                votes.forEach(function (vote) {
                  if (mutedMemberIds.includes(vote.creator._id.toString())) {
                    vote.canDisplay = false
                  } else {
                    vote.canDisplay = true
                  }
                  if (moment(vote.timestamp).isSame(today, 'd')) {
                    vote.parsedTimestamp = moment(vote.timestamp).fromNow()
                  } else if (moment(vote.timestamp).isSame(thisyear, 'y')) {
                    vote.parsedTimestamp = moment(vote.timestamp).format('D MMM')
                  } else {
                    vote.parsedTimestamp = moment(vote.timestamp).format('D MMM YYYY')
                  }
                  vote.parsedExpiry = moment(vote.expiryTime).locale('en-GB').fromNow()
                  if (vote.reference === 'userban' || vote.reference === 'userunban' || vote.reference === 'usermute' || vote.reference === 'userunmute') {
                    vote.group = 'uservotes'
                    User.findOne({
                      _id: vote.proposedValue
                    })
                      .then(user => {
                        vote.userData = user
                      })
                  }
                })
                community.mutedMembers.forEach(member => {
                  if (bannedMemberIds.includes(member._id.toString())) { member.isBanned = true }
                })

                // Find the number of members who have been active on sweet in the last 2 weeks
                // and are not muted - these are members allowed to vote - then work out the
                // majority margin required for a vote to pass based on the number of those members
                const currentFortnight = moment().clone().subtract(14, 'days').startOf('day')
                const recentlyActiveMembers = community.members.filter((member) => {
                  return moment(member.lastUpdated).isBetween(currentFortnight, moment()) &&
                                        !mutedMemberIds.includes(member._id.toString())
                })
                const recentlyActiveMemberIds = recentlyActiveMembers.map(a => a._id.toString())
                const majorityMargin = helper.isOdd(recentlyActiveMembers.length) ? (recentlyActiveMembers.length / 2) + 0.5 : (recentlyActiveMembers.length / 2) + 1
                notifier.markRead(req.user._id, community._id)
                community.members.forEach((member) => {
                  if (recentlyActiveMemberIds.includes(member._id.toString())) {
                    member.isRecentlyActive = true
                  }
                })

                community.excerpt = community.descriptionParsed.replace(/<[^>]+>/g, ' ').replace(/^(.{160}[^\s]*).*/, "$1...");

                let metadata = {
                  title: community.name + ' · Sweet',
                  description: community.excerpt,
                  image: community.imageEnabled ? 'https://sweet-images.s3.amazonaws.com/' + community.image : 'https://sweet.sh/images/communities/cake.svg',
                  url: 'https://sweet.sh/community/' + community.slug
                }
                res.render('community', {
                  metadata: metadata,
                  loggedIn: isLoggedIn,
                  loggedInUserData: req.user,
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
          } else {
            community.excerpt = community.descriptionParsed.replace(/<[^>]+>/g, ' ').replace(/^(.{160}[^\s]*).*/, "$1...");
            let metadata = {
              title: community.name + ' · Sweet',
              description: community.excerpt,
              image: community.imageEnabled ? 'https://sweet-images.s3.amazonaws.com/' + community.image : 'https://sweet.sh/images/communities/cake.svg',
              url: 'https://sweet.sh/community/' + community.slug
            }
            res.render('community', {
              metadata: metadata,
              loggedIn: false,
              loggedInUserData: '',
              communityData: community,
              isMember: false,
              hasRequested: false,
              votes: '',
              majorityMargin: '',
              isBanned: false
            })
          }
        } else {
          res.status(404).redirect('/404')
        }
      })
  })

  app.get('/api/community/getbyid/:communityid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    }).then((community) => {
      res.redirect('/community/' + community.slug)
    })
  })

  app.post('/api/community/create', isLoggedIn, function (req, res) {
    console.log('Creating community')
    const newCommunityData = req.body
    const newCommunitySlug = helper.slugify(newCommunityData.communityName)
    Community.findOne({
      slug: newCommunitySlug
    })
      .then(async (community) => {
        if (community) {
          req.session.sessionFlash = {
            type: 'warning',
            message: 'A community with this URL (' + newCommunitySlug + ') already exists.',
            newCommunityData: newCommunityData
          }
          return res.redirect('back')
        } else {
          let imageEnabled = false
          const communityUrl = nanoid()
          if (req.files && req.files.imageUpload) {
            if (req.files.imageUpload.data.length > 10485760) {
              console.error('Community image too large!')
              req.session.sessionFlash = {
                type: 'warning',
                message: 'Image file too large. The file size limit is 10MB.',
                communityData: newCommunityData
              }
              return res.redirect('back')
            } else {
              console.log('Saving community image')
              imageEnabled = true
              // call S3 to upload file to specified bucket
              sharp(req.files.imageUpload.data)
              .resize({ width: 600, height: 600 })
              .jpeg({ quality: 70 })
              .toBuffer()
              .then(buffer => s3.putObject({
                  Body: buffer,
                  Bucket: s3Bucket,
                  Key: 'communities/' + communityUrl + '.jpg',
                  ACL: 'public-read'
                }).promise()
              )
              .catch(err => {
                console.log('Error processing community image with sharp')
                console.error(err)
              })
            }
          }
          const parsedDesc = (await helper.parseText(newCommunityData.communityDescription)).text
          const parsedRules = (await helper.parseText(newCommunityData.communityRules)).text

          const community = new Community({
            created: new Date(),
            name: newCommunityData.communityName,
            slug: newCommunitySlug,
            url: communityUrl,
            descriptionRaw: newCommunityData.communityDescription,
            descriptionParsed: parsedDesc,
            rulesRaw: newCommunityData.communityRules,
            rulesParsed: parsedRules,
            image: imageEnabled ? 'communities/' + communityUrl + '.jpg' : 'cake.svg',
            imageEnabled: imageEnabled,
            settings: {
              visibility: newCommunityData.communityVisibility,
              joinType: newCommunityData.communityJoinType,
              voteThreshold: 50,
              voteLength: newCommunityData.communityVoteLength
            },
            members: [req.user._id]
          })
          community.save()
            .then(community => {
              User.findOne({
                _id: req.user._id
              })
                .then(user => {
                  user.communities.push(community._id)
                  user.save()
                })
                .then(user => {
                  touchCommunity(community._id)
                  console.log('Created community!')
                  res.redirect('/community/' + newCommunitySlug)
                })
            })
        }
      })
  })

  app.post('/api/community/delete', isLoggedIn, function (req, res) {

  })

  app.post('/api/community/user/join/:communityid', isLoggedIn, async function (req, res) {
    const community = await Community.findOne({ _id: req.params.communityid })
    if (community.bannedMembers.includes(req.user._id)) {
      return res.sendStatus(403)
    }
    if (!community.members.some(v => v.equals(req.user._id))) {
      community.members.push(req.user._id)
      await community.save()
      touchCommunity(req.params.communityid)
    }
    const user = await User.findOne({ _id: req.user._id })
    if (!user.communities.some(v => v.toString() === req.params.communityid)) {
      user.communities.push(req.params.communityid)
      await user.save()
    }
    res.end('{"success" : "Updated Successfully", "status" : 200}')
  })

  app.post('/api/community/user/request/:communityid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then(community => {
        community.membershipRequests.push(req.user._id)
        community.save()
          .then(save => {
            community.members.forEach(member => {
              notifier.notify('community', 'request', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'request')
            })
            res.end('{"success" : "Updated Successfully", "status" : 200}')
          })
      })
  })

  app.post('/api/community/user/leave/:communityid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then(community => {
        community.members.pull(req.user._id)
        community.save()
      })
      .then(community => {
        User.findOne({
          _id: req.user._id
        })
          .then(user => {
            user.communities.pull(req.params.communityid)
            user.save()
          })
      })
      .then(success => {
        res.end('{"success" : "Updated Successfully", "status" : 200}')
      })
  })

  app.post('/api/community/user/mute/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then(community => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
        }
        const voteUrl = nanoid()
        const created = new Date()
        const expiryTime = moment(created).add((community.settings.voteLength ? community.settings.voteLength : 7), 'd')
        let votesNumber
        if (community.members.length - community.mutedMembers.length === 1) {
          // if there is only one member with permissions, start out with 0 votes total so that at least someone has to click on the 'vote' button to make it pass
          votesNumber = 0
        } else {
          // otherwise, assume that the person who created the vote is in favor of it and cause them to have voted for it
          votesNumber = 1
        }
        if (isMember) {
          const vote = new Vote({
            status: 'active',
            community: req.params.communityid,
            reference: 'usermute',
            proposedValue: req.params.userid,
            creatorEmail: req.user.email,
            creator: req.user._id,
            url: voteUrl,
            timestamp: created,
            lastUpdated: created,
            voteThreshold: 50,
            expiryTime: expiryTime,
            votes: votesNumber,
            voters: votesNumber === 1 ? [req.user._id] : []
          })
          vote.save()
            .then(vote => {
              const expireVote = schedule.scheduleJob(expiryTime, function () {
                Vote.findOne({
                  _id: vote._id
                })
                  .then(vote => {
                    vote.status = 'expired'
                    vote.save()
                  })
              })
              community.members.forEach(member => {
                notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
              })
              expiryTimers.push(expireVote)
              res.end('{"success" : "Updated Successfully", "status" : 200}')
            })
        } else {
          console.log('User not authorised to mute user.')
        }
      })
  })

  app.post('/api/community/user/unmute/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then((community) => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
        }
        const voteUrl = nanoid()
        const created = new Date()
        const expiryTime = moment(created).add((community.settings.voteLength ? community.settings.voteLength : 7), 'd')
        let votesNumber
        if (community.members.length - community.mutedMembers.length === 1) {
          // if there is only one member with permissions, start out with 0 votes total so that at least someone has to click on the 'vote' button to make it pass
          votesNumber = 0
        } else {
          // otherwise, assume that the person who created the vote is in favor of it and cause them to have voted for it
          votesNumber = 1
        }
        if (isMember) {
          const vote = new Vote({
            status: 'active',
            community: req.params.communityid,
            reference: 'userunmute',
            proposedValue: req.params.userid,
            creatorEmail: req.user.email,
            creator: req.user._id,
            url: voteUrl,
            timestamp: created,
            lastUpdated: created,
            voteThreshold: 50,
            expiryTime: expiryTime,
            votes: votesNumber,
            voters: votesNumber === 1 ? [req.user._id] : []
          })
          vote.save()
            .then(vote => {
              const expireVote = schedule.scheduleJob(expiryTime, function () {
                Vote.findOne({
                  _id: vote._id
                })
                  .then(vote => {
                    vote.status = 'expired'
                    vote.save()
                  })
              })
              expiryTimers.push(expireVote)
              community.members.forEach(member => {
                notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
              })
              res.end('{"success" : "Updated Successfully", "status" : 200}')
            })
        } else {
          console.log('User not authorised to unmute user.')
        }
      })
  })

  app.post('/api/community/user/ban/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then((community) => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
        }
        const voteUrl = nanoid()
        const created = new Date()
        const expiryTime = moment(created).add((community.settings.voteLength ? community.settings.voteLength : 7), 'd')
        let votesNumber
        if (community.members.length - community.mutedMembers.length === 1) {
          // if there is only one member with permissions, start out with 0 votes total so that someone has to at least click on the 'vote' button to make it pass
          votesNumber = 0
        } else {
          // otherwise, assume that the person who created the vote is in favor of it and cause them to have voted for it
          votesNumber = 1
        }
        if (isMember) {
          const vote = new Vote({
            status: 'active',
            community: req.params.communityid,
            reference: 'userban',
            proposedValue: req.params.userid,
            creatorEmail: req.user.email,
            creator: req.user._id,
            url: voteUrl,
            timestamp: created,
            lastUpdated: created,
            voteThreshold: 50,
            expiryTime: expiryTime,
            votes: votesNumber,
            voters: votesNumber === 1 ? [req.user._id] : []
          })
          vote.save()
            .then(vote => {
              const expireVote = schedule.scheduleJob(expiryTime, function () {
                Vote.findOne({
                  _id: vote._id
                })
                  .then(vote => {
                    vote.status = 'expired'
                    vote.save()
                  })
              })
              expiryTimers.push(expireVote)
              community.members.forEach(member => {
                notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
              })
              res.end('{"success" : "Updated Successfully", "status" : 200}')
            })
        } else {
          console.log('User not authorised to ban user.')
        }
      })
  })

  app.post('/api/community/user/unban/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then((community) => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
        }
        const voteUrl = nanoid()
        const created = new Date()
        const expiryTime = moment(created).add((community.settings.voteLength ? community.settings.voteLength : 7), 'd')
        let votesNumber
        if (community.members.length - community.mutedMembers.length === 1) {
          // if there is only one member with permissions, start out with 0 votes total so that at least someone has to click on the 'vote' button to make it pass
          votesNumber = 0
        } else {
          // otherwise, assume that the person who created the vote is in favor of it and cause them to have voted for it
          votesNumber = 1
        }
        if (isMember) {
          const vote = new Vote({
            status: 'active',
            community: req.params.communityid,
            reference: 'userunban',
            proposedValue: req.params.userid,
            creatorEmail: req.user.email,
            creator: req.user._id,
            url: voteUrl,
            timestamp: created,
            lastUpdated: created,
            voteThreshold: 50,
            expiryTime: expiryTime,
            votes: votesNumber,
            voters: votesNumber === 1 ? [req.user._id] : []
          })
          vote.save()
            .then(vote => {
              const expireVote = schedule.scheduleJob(expiryTime, function () {
                Vote.findOne({
                  _id: vote._id
                })
                  .then(vote => {
                    vote.status = 'expired'
                    vote.save()
                  })
              })
              expiryTimers.push(expireVote)
              community.members.forEach(member => {
                notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
              })
              res.end('{"success" : "Updated Successfully", "status" : 200}')
            })
        } else {
          console.log('User not authorised to unban user.')
        }
      })
  })

  app.post('/api/community/user/accept/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then(community => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
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
              res.end('{"success" : "Updated Successfully", "status" : 200}')
            })
        } else {
          console.log('User not authorised to approve request.')
        }
      })
  })

  app.post('/api/community/user/reject/:communityid/:userid', isLoggedIn, function (req, res) {
    Community.findOne({
      _id: req.params.communityid
    })
      .then(community => {
        const memberIds = community.members.map(a => a._id.toString())
        let isMember
        if (memberIds.includes(req.user._id.toString())) {
          isMember = true
        }
        if (isMember) {
          community.membershipRequests.pull(req.params.userid)
          community.save()
        } else {
          console.log('User not authorised to approve request.')
        }
        if (isMember) {
          notifier.notify('community', 'requestResponse', req.params.userid, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'rejected')
          res.end('{"success" : "Updated Successfully", "status" : 200}')
        }
      })
  })

  app.post('/api/community/vote/create/:communityid', isLoggedIn, async function (req, res) {
    const community = await Community.findOne({
      _id: req.params.communityid
    })
    if (!community.members.some(v => v.equals(req.user._id))) {
      return res.sendStatus(403)
    }
    let imageUrl
    if (req.body.reference === 'image') {
      imageUrl = nanoid() + '.jpg'
      if (req.files.proposedValue.data.length > 10485760) {
        console.error('Image too large!')
        req.session.sessionFlash = {
          type: 'warning',
          message: 'File too large. The file size limit is 10MB.'
        }
        return res.redirect('back')
      } else {
        sharp(req.files.proposedValue.data)
          .resize({
            width: 600,
            height: 600
          })
          .jpeg({
            quality: 70
          })
          .toBuffer()
          .then(buffer => s3.putObject({
              Body: buffer,
              Bucket: s3Bucket,
              Key: 'communities/staging/' + imageUrl,
              ACL: 'public-read'
            }).promise()
          )
          .catch(err => {
            console.log('Error processing community image with sharp')
            console.error(err)
          })
      }
    }
    const parsedReferences = {
      name: 'name',
      description: 'description',
      rules: 'rules',
      image: 'display image',
      visibility: 'post visibility',
      joinType: 'joining method',
      voteLength: 'vote length'
    }
    const parsedJoinType = {
      open: 'Open (anyone is free to join)',
      approval: 'Approval (requests to join must be approved by a current member)',
      closed: 'Closed (only invited users can join)'
    }
    const parsedVisibility = {
      public: 'Public (posts visible to all sweet users)',
      private: 'Private (posts visible only to members)'
    }
    const parsedVoteLength = {
      1: '1 day',
      3: '3 days',
      7: '7 days',
      14: '14 days',
      30: '30 days'
    }
    const parsedReference = parsedReferences[req.body.reference]
    let allowedChange = true // is there a change? and is it allowed?
    let proposedValue
    let parsedProposedValue
    if (req.body.reference === 'description' || req.body.reference === 'rules') {
      proposedValue = req.body.proposedValue
      parsedProposedValue = (await helper.parseText(req.body.proposedValue)).text
      if (req.body.reference === 'description') {
        allowedChange = (community.descriptionRaw !== proposedValue)
      } else {
        allowedChange = (community.rulesRaw !== proposedValue)
      }
    } else if (req.body.reference === 'joinType') {
      proposedValue = req.body.proposedValue
      parsedProposedValue = parsedJoinType[req.body.proposedValue]
      allowedChange = (parsedProposedValue && community.settings.joinType !== proposedValue) // parsedProposedValue will be undefined if req.body.proposedValue wasn't one of the allowed values
    } else if (req.body.reference === 'visibility') {
      proposedValue = req.body.proposedValue
      parsedProposedValue = parsedVisibility[req.body.proposedValue]
      allowedChange = (parsedProposedValue && community.settings.visibility !== proposedValue)
    } else if (req.body.reference === 'voteLength') {
      proposedValue = req.body.proposedValue
      parsedProposedValue = parsedVoteLength[req.body.proposedValue]
      allowedChange = (parsedProposedValue && community.settings.voteLength !== parseInt(proposedValue))
    } else if (req.body.reference === 'image') {
      proposedValue = 'communities/staging/' + imageUrl
      parsedProposedValue = 'communities/staging/' + imageUrl
    } else if (req.body.reference === 'name') { // this is where it gets complicated
      proposedValue = req.body.proposedValue
      parsedProposedValue = proposedValue
      const slug = helper.slugify(proposedValue)
      if (!parsedProposedValue || community.name === proposedValue) {
        // not using allowedChange for this non-change bc by the time we get to the code that reacts to allowedChange it will have already returned a duplicate name complaint
        req.session.sessionFlash = {
          type: 'warning',
          message: 'That vote would not change anything! But of course none ever seem to anyway'
        }
        return res.redirect('back')
      } else {
        allowedChange = true
        if (await Community.findOne({ slug: slug }) || await Community.findOne({ name: proposedValue })) {
          req.session.sessionFlash = {
            type: 'warning',
            message: 'The community name/url is unfortunately already taken...'
          }
          return res.redirect('back')
        }
        // first, create the placeholder; then, check if you've just created a duplicate (and remove one and cancel if that's the case.)
        // it's a bit weird, but it's bc we have no way of checking in advance if there already is one that guarantees there won't be
        // a placeholder with our proposed name created between our check and our creation of the new one (bc we don't know what code will
        // execute while we are awaiting the save of the new one.) i think this could still result in two changes to the same name being
        // proposed at the same time and both of them being rejected, but that's incredibly unlikely and also oh well
        const placeholder = new CommunityPlaceholder({
          name: proposedValue,
          slug: helper.slugify(proposedValue)
        })
        await placeholder.save()
        if ((await CommunityPlaceholder.find({ slug: slug })).length > 1 || (await CommunityPlaceholder.find({ name: proposedValue })).length > 1) {
          req.session.sessionFlash = {
            type: 'warning',
            message: 'That community name/url is reserved bc another community is currently voting on it, sorry!'
          }
          CommunityPlaceholder.deleteOne({ name: proposedValue }, function (err) { console.error(err) }) // the "true" makes it just delete one
          return res.redirect('back')
        }
      }
    }
    if (!allowedChange) {
      req.session.sessionFlash = {
        type: 'warning',
        message: 'That vote would not change anything! But of course none ever seem to anyway'
      }
      return res.redirect('back')
    }
    console.log(community)
    const voteUrl = nanoid()
    const created = new Date()
    const expiryTime = moment(created).add((community.settings.voteLength ? community.settings.voteLength : 7), 'd')
    let votesNumber
    if (community.members.length - community.mutedMembers.length === 1) {
      // if there is only one member with permissions, start out with 0 votes total so that they have to at least click on the 'vote' button to make it pass
      votesNumber = 0
    } else {
      votesNumber = 1
    }
    const vote = new Vote({
      status: 'active',
      community: req.params.communityid,
      reference: req.body.reference,
      parsedReference: parsedReference,
      proposedValue: proposedValue,
      parsedProposedValue: parsedProposedValue,
      creatorEmail: req.user.email,
      creator: req.user._id,
      url: voteUrl,
      timestamp: created,
      lastUpdated: created,
      voteThreshold: 50,
      expiryTime: expiryTime,
      votes: votesNumber,
      voters: votesNumber === 1 ? [req.user._id] : []
    })
    console.log(vote)
    vote.save()
      .then(vote => {
        const expireVote = schedule.scheduleJob(expiryTime, function () {
          Vote.findOne({
            _id: vote._id
          })
            .then(vote => {
              vote.status = 'expired'
              vote.save()
            })
        })
        expiryTimers.push(expireVote)
        community.members.forEach(member => {
          if (!member.equals(req.user._id)) {
            notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'created')
          }
        })
        touchCommunity(req.params.communityid)
        res.redirect('back')
      })
  })

  app.post('/api/community/vote/delete/:voteid', isLoggedIn, function (req, res) {
    Vote.findById(req.params.voteid).then(vote => {
      if (req.user._id.equals(vote.creator)) {
        Vote.findByIdAndRemove(req.params.voteid)
          .then(vote => {
            res.end('{"success" : "Updated Successfully", "status" : 200}')
          })
      } else {
        return res.sendStatus(403)
      }
    })
  })

  app.post('/api/community/vote/cast/:communityid/:voteid', isLoggedIn, function (req, res) {
    if (!req.user.communities.some(v => v.toString() === req.params.communityid)) {
      return res.sendStatus(403)
    }
    Vote.findOne({
      _id: req.params.voteid
    })
      .then(vote => {
        if (vote.voters.some(v => v.equals(req.user._id))) {
          return res.sendStatus(403)
        }
        vote.votes++
        vote.voters.push(req.user._id)
        vote.save()
          .then(vote => {
            Community
              .findOne({
                _id: req.params.communityid
              })
              .populate('members')
              .then(community => {
                const mutedMemberIds = community.mutedMembers.map(a => a._id.toString())
                // Find the number of members who have been active on sweet in the last 2 weeks
                // and are not muted - these are members allowed to vote - then work out the
                // majority margin required for a vote to pass based on the number of those members
                const currentFortnight = moment().clone().subtract(14, 'days').startOf('day')
                const recentlyActiveMembers = community.members.filter((member) => {
                  return moment(member.lastUpdated).isBetween(currentFortnight, moment()) &&
                                        !mutedMemberIds.includes(member._id.toString())
                })
                const majorityMargin = helper.isOdd(recentlyActiveMembers.length) ? (recentlyActiveMembers.length / 2) + 0.5 : (recentlyActiveMembers.length / 2) + 1

                if (vote.votes >= majorityMargin) {
                  console.log('Vote passed!')
                  let oldName
                  // TODO: This if/elif chain is a good candidate for a switch statement
                  if (vote.reference === 'visibility') {
                    community.settings[vote.reference] = vote.proposedValue
                    Image.find({
                      context: 'community',
                      community: community._id
                    }).then(images => {
                      console.log(images)
                      images.forEach(function (image) {
                        console.log(image)
                        image.privacy = vote.proposedValue
                        image.save()
                      })
                    })
                  } else if (vote.reference === 'joinType' || vote.reference === 'voteLength') {
                    community.settings[vote.reference] = vote.proposedValue
                  } else if (vote.reference === 'description' || vote.reference === 'rules') {
                    community[vote.reference + 'Raw'] = vote.proposedValue
                    community[vote.reference + 'Parsed'] = vote.parsedProposedValue
                  } else if (vote.reference === 'image') {
                    // Copy the S3 image object to a new location
                    // We give it a new filename otherwise S3 doesn't show an updated
                    // overwritten file immediately, which is confusing for users
                    const imageFilename = 'communities/' + nanoid() + '.jpg'
                    s3.copyObject({
                      Bucket: s3Bucket, 
                      CopySource: 'sweet-images/' + vote.proposedValue, // sweet-images/[communities/staging/filename.jpg]
                      Key: imageFilename, // [communities/newfilename.jpg]
                      ACL: 'public-read'
                    }).promise()
                    .then(() => 
                      // Delete the old object
                      s3.deleteObject({
                        Bucket: s3Bucket, 
                        Key: vote.proposedValue // [communities/staging/filename.jpg]
                      }).promise()
                    )
                    .catch((e) => console.error('Error moving community image from staging', e))
                    // Update image entry in the db
                    community[vote.reference] = imageFilename
                    community.imageEnabled = true
                  } else if (vote.reference === 'name') {
                    oldName = community.name
                    community.name = vote.proposedValue
                    CommunityPlaceholder.deleteOne({ name: vote.proposedValue }, function (err) { console.error(err) })
                    community.slug = helper.slugify(vote.proposedValue) // i guess i'm assuming the "slugify" function hasn't been modified since the vote was created
                  } else if (vote.reference === 'userban') {
                    community.members.pull(vote.proposedValue)
                    community.bannedMembers.push(vote.proposedValue)
                    User.findOne({
                      _id: vote.proposedValue
                    })
                      .then(user => {
                        user.communities.pull(req.params.communityid)
                        user.bannedCommunities.push(req.params.communityid)
                        user.save()
                      })
                  } else if (vote.reference === 'usermute') {
                    community.mutedMembers.push(vote.proposedValue)
                    User.findOne({
                      _id: vote.proposedValue
                    })
                      .then(user => {
                        user.mutedCommunities.push(req.params.communityid)
                        user.save()
                      })
                  } else if (vote.reference === 'userunban') {
                    community.bannedMembers.pull(vote.proposedValue)
                    User.findOne({
                      _id: vote.proposedValue
                    })
                      .then(user => {
                        user.bannedCommunities.pull(req.params.communityid)
                        user.save()
                      })
                  } else if (vote.reference === 'userunmute') {
                    community.mutedMembers.pull(vote.proposedValue)
                    User.findOne({
                      _id: vote.proposedValue
                    })
                      .then(user => {
                        user.mutedCommunities.pull(req.params.communityid)
                        user.save()
                      })
                  }
                  community.save()
                    .then(community => {
                      Vote.findOne({
                        _id: req.params.voteid
                      })
                        .then(vote => {
                          vote.status = 'passed'
                          vote.save()
                          if (vote.reference === 'userban') {
                            User.findOne({
                              _id: vote.proposedValue
                            })
                              .then(user => {
                                console.log(user)
                                Post.deleteMany({
                                  community: req.params.communityid,
                                  authorEmail: user.email
                                }, function (callback) {
                                  console.log(callback)
                                })
                                Vote.deleteMany({
                                  community: req.params.communityid,
                                  creatorEmail: user.email
                                }, function (callback) {
                                  console.log(callback)
                                })
                              })
                            community.members.forEach(member => {
                              notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'banned')
                            })
                            notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'banned')
                          } else if (vote.reference === 'userunban') {
                            community.members.forEach(member => {
                              notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unbanned')
                            })
                            notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unbanned')
                          } else if (vote.reference === 'usermute') {
                            console.log('User muted - sending notifications')
                            community.members.forEach(member => {
                              console.log('Notification sending to ' + member)
                              if (member.equals(vote.proposedValue)) {
                                notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'muted')
                              } else {
                                notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'muted')
                              }
                            })
                          } else if (vote.reference === 'userunmute') {
                            community.members.forEach(member => {
                              if (member.equals(vote.proposedValue)) {
                                notifier.notify('community', 'managementResponse', vote.proposedValue, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unmuted')
                              } else {
                                notifier.notify('community', 'management', member, vote.proposedValue, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'unmuted')
                              }
                            })
                          } else if (vote.reference === 'name') {
                            community.members.forEach(member => {
                              if (!member.equals(req.user._id)) {
                                notifier.notify('community', 'nameChange', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, oldName)
                              }
                            })
                          } else {
                            community.members.forEach(member => {
                              if (member.equals(vote.creator)) {
                                notifier.notify('community', 'yourVote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'passed')
                              } else {
                                notifier.notify('community', 'vote', member, req.user._id, req.params.communityid, '/api/community/getbyid/' + req.params.communityid, 'passed')
                              }
                            })
                          }
                          touchCommunity(req.params.communityid)
                          if (vote.reference === 'name') {
                            res.end('{"success" : "Updated Successfully", "status" : 302, "redirect": "/community/' + community.slug + '"}')
                          } else {
                            res.end('{"success" : "Updated Successfully", "status" : 200}')
                          }
                        })
                    })
                } else {
                  console.log('Vote cast.')
                  touchCommunity(req.params.communityid)
                  res.end('{"success" : "Updated Successfully", "status" : 200}')
                }
              })
          })
      })
  })

  app.post('/api/community/welcomemessage/update/:communityid', isLoggedIn, function (req, res) {
    function isCommunityMember (communityId) {
      return Community.findOne({
        _id: communityId
      })
        .then(community => {
          return community.members.some(member => {
            return req.user._id.equals(member)
          })
        })
    }

    Community.findOne({
      _id: req.params.communityid
    })
      .then(async function (community) {
        if (await isCommunityMember(community)) {
          community.welcomeMessageRaw = req.body.proposedValue
          community.welcomeMessageParsed = (await helper.parseText(req.body.proposedValue)).text
          community.welcomeMessageAuthor = req.user._id
          community.save()
            .then(result => {
              res.redirect('back')
            })
        } else {
          res.redirect('back')
        }
      })
  })

  app.post('/api/community/vote/withdraw/:communityid/:voteid', isLoggedIn, function (req, res) {
    Vote.findOne({
      _id: req.params.voteid
    })
      .then(vote => {
        if (!vote.voters.some(v => v.equals(req.user._id))) {
          return res.sendStatus(403)
        }
        vote.votes--
        vote.voters.pull(req.user._id)
        vote.save()
          .then(vote => {
            res.end('{"success" : "Updated Successfully", "status" : 200}')
          })
      })
  })
}

function touchCommunity (id) {
  Community.findOneAndUpdate({
    _id: id
  }, {
    $set: {
      lastUpdated: new Date()
    }
  }).then(community => {
    console.log('Updated community!')
  })
}

function isLoggedIn (req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.redirect('/')
}
