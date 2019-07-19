function markRead(userId, subjectId) {
    User.findOne({
            _id: userId
        }, 'notifications')
        .then(user => {
            user.notifications.forEach(notification => {
                if (notification.seen == false && notification.subjectId == subjectId) {
                    notification.seen = true;
                }
            })
            user.save();
        })
}

function notify(type, cause, notifieeID, sourceId, subjectId, url, context) {
    function buildNotification() {
        switch (type) {
            case 'user':
                return User.findOne({
                        _id: sourceId
                    })
                    .then(user => {
                        image = '/images/' + (user.imageEnabled ? user.image : 'cake.svg');
                        username = '@' + user.username;
                        switch (cause) {
                            case 'reply':
                                text = 'replied to your post.'
                                break;
                            case 'boost':
                                text = 'boosted your post.'
                                break;
                            case 'subscribedReply':
                                text = 'replied to a post you have also replied to.'
                                break;
                            case 'mentioningPostReply':
                                text = 'replied to a post you were mentioned in.'
                                break;
                            case 'boostedPostReply':
                                text = 'replied to a post you boosted.'
                                break;
                            case 'commentReply':
                                text = 'replied to your comment.'
                                break;
                            case 'mention':
                                text = 'mentioned you in a ' + context + '.'
                                email = 'mentioned you on sweet 🙌'
                                break;
                            case 'relationship':
                                text = 'now ' + context + 's you.'
                                break;
                        }
                        final = '<strong>' + username + '</strong> ' + text;
                        emailText = username + ' ' + email;
                        return {
                            image: image,
                            text: final,
                            emailText: emailText
                        };
                    })
                break;
            case 'community':
                return User.findOne({
                        _id: sourceId
                    })
                    .then(user => {
                        return Community.findOne({
                                _id: subjectId
                            })
                            .then(community => {
                                image = '/images/communities/' + (community.imageEnabled ? community.image : 'cake.svg');
                                username = '@' + user.username;
                                switch (cause) {
                                    case 'request':
                                        text = '<strong>@' + user.username + '</strong> has asked to join <strong>' + community.name + '</strong>.'
                                        break;
                                    case 'requestResponse':
                                        text = 'Your request to join <strong>' + community.name + '</strong> has been ' + context + '.'
                                        break;
                                    case 'vote':
                                        text = 'A vote has been ' + context + ' in <strong>' + community.name + '</strong>.'
                                        break;
                                    case 'yourVote':
                                        text = 'Your vote has been ' + context + ' in <strong>' + community.name + '</strong>.'
                                        break;
                                    case 'management':
                                        text = '<strong>@' + user.username + '</strong> has been ' + context + ' from <strong>' + community.name + '</strong>.'
                                        break;
                                    case 'managementResponse':
                                        text = 'You have been ' + context + ' from <strong>' + community.name + '</strong>.'
                                        break;
                                    case 'nameChange':
                                        text = "The name of the community <strong>" + context + "</strong> has been changed to <strong>" + community.name + '</strong>.'
                                }
                                final = text;
                                return {
                                    image: image,
                                    text: final
                                };
                            })
                    })
                break;
        }
    }
    console.log("creating notification")
    User.findOne({
            _id: notifieeID
        })
        .then(notifiedUser => {
            buildNotification()
                .then(async response => {
                    //send the user push notifications if they have a subscribed browser
                    if (notifiedUser.pushNotifSubscriptions.length > 0) {
                        for (subbed of notifiedUser.pushNotifSubscriptions) {
                            const pushSubscription = JSON.parse(subbed);
                            const options = {
                                gcmAPIKey: ''
                            };
                            const payload = JSON.stringify({
                                body: response.text.replace(/<strong>/g, '').replace(/<\/strong>/g, ''),
                                imageURL: response.image.replace('.svg', '.png'), //we can't use svgs here, which cake.svg (the default profile image) is, this will use cake.png instead
                                link: url
                            })
                            webpush.sendNotification(pushSubscription, payload, options).catch(async err => {
                              console.log("push notification subscription not working, will be removed:")
                              console.log(err);
                              notifiedUser.pushNotifSubscriptions = notifiedUser.pushNotifSubscriptions.filter(v => v != subbed);
                              notifiedUser = await notifiedUser.save();
                            });
                        }
                    }
                    // send the user an email if it's a mention and they have emails for mentions enabled
                    if (notifiedUser.settings.sendMentionEmails == true && cause == "mention") {
                        emailer.sendSingleNotificationEmail(notifiedUser, response, url)
                    }
                    //if the most recent notification is a trust or follow, and the current is also a trust or follow from the same user, combine the two
                    var lastNotif = notifiedUser.notifications[notifiedUser.notifications.length - 1]
                    if (cause == 'relationship' && lastNotif.category == 'relationship' && lastNotif.url == url) {
                        if ((lastNotif.text.includes('follow') && context == 'trust') || (lastNotif.text.includes('trust') && context == 'follow')) {
                            notification = {
                                category: cause,
                                sourceId: sourceId,
                                subjectId: subjectId,
                                text: '<strong>' + username + '</strong> ' + 'now follows and trusts you.',
                                image: response.image,
                                url: url
                            }
                            notifiedUser.notifications[notifiedUser.notifications.length - 1] = notification;
                            notifiedUser.save().then(() => {
                                console.log('Notification sent to ' + notifiedUser.username)
                            })
                        }
                    } else {
                        notification = {
                            category: cause,
                            sourceId: sourceId,
                            subjectId: subjectId,
                            text: response.text,
                            image: response.image,
                            url: url
                        }
                        notifiedUser.notifications.push(notification);
                        notifiedUser.save()
                            .then((sliceUser) => {
                                notificationsSlice = (sliceUser.notifications.length > 60 ? sliceUser.notifications.length - 60 : 0);
                                sliceUser.notifications = sliceUser.notifications.slice(notificationsSlice)
                                sliceUser.save()
                                    .then(response => {
                                        console.log("Notification sent to " + sliceUser.username)
                                        return true;
                                    })
                                    .catch(error => {
                                        console.error(error)
                                        return false;
                                    })
                            })
                            .catch(error => {
                                console.error(error)
                                return false;
                            })
                    }
                }).catch(error => {
                    console.error(error)
                    return false;
                })
        })
        .catch(error => {
            console.error(error)
            return false;
        })
}

module.exports.markRead = markRead;
module.exports.notify = notify;