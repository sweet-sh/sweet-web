function markRead(userId, subjectId) {
  User.findOne({
    _id: userId
  }, 'notifications')
  .then(user => {
    user.notifications.forEach(notification => {
      if (notification.seen == false && notification.subjectId == subjectId){
        notification.seen = true;
      }
    })
    user.save();
  })
}

function notify(type, cause, notifieeID, sourceId, subjectId, url, context) {
  function buildNotification(){
    switch(type){
      case 'user':
        return User.findOne({
          _id: sourceId
        })
        .then(user => {
          image = '/images/' + (user.imageEnabled ? user.image : 'cake.svg');
          username = '@' + user.username;
          switch(cause){
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
            case 'mention':
              text = 'mentioned you in a ' + context + '.'
              break;
            case 'relationship':
              text = 'now ' + context + 's you.'
              break;
          }
          final = '<strong>' + username + '</strong> ' + text;
          return {
            image: image,
            text: final
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
            switch(cause){
              case 'request':
                text = '<strong>@' + user.username + '</strong> has asked to join <strong>' + community.name + '</strong>.'
                break;
              case 'requestResponse':
                text = 'Your request to join <strong>' + community.name + '</strong> has been ' + context + '.'
                break;
              case 'vote':
                text = 'A vote has been ' + context + ' in <strong>' + community.name + '</strong>.'
                break;
              case 'management':
                text = '<strong>@' + user.username + '</strong> has been ' + context + ' from <strong>' + community.name + '</strong>.'
                break;
              case 'managementResponse':
                text = 'You have been ' + context + ' from <strong>' + community.name + '</strong>.'
                break;
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
    .then(response => {
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
      .then(response => {
        User.findOne({
          _id: notifieeID
        })
        .then(sliceUser => {
          notificationsSlice = (sliceUser.notifications.length > 14 ? sliceUser.notifications.length-14 : 0);
          sliceUser.notifications = sliceUser.notifications.slice(notificationsSlice)
          sliceUser.save()
          .then(response => {
            console.log("Notification sent to " + sliceUser.username)
            return true;
          })
        })
      })
      .catch(error => {
        console.error(error)
        return false;
      })
    })
  })
  .catch(error => {
    console.error(error)
    return false;
  })
}

module.exports.markRead = markRead;
module.exports.notify = notify;