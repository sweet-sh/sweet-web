module.exports = function(io) {
    io.on('connection', async (socket) => {
        var sidCookie = undefined;
        try {
            if (socket.handshake.headers.cookie && (sidCookie = socket.handshake.headers.cookie.match(/connect.sid=s%3A(.*?)\./)[1])) {
                var session = await Sessions.findById(sidCookie);
                var userID = JSON.parse(session.session).passport.user;
                socket.userID = userID;
                socket.join(userID); //places this socket in a "room" based on this id; all the sockets in this "room" will get this user's notifications (below)
            }
        } catch (err) {
            console.log("could not authenticate user through socket even though they had the appropriate cookie, maybe they just logged out or their session just expired or:", err);
        }
        if (socket.userID === undefined) {
            socket.userID = 'anonymous';
        }
        socket.on('post(s) loaded', function(postIDs) {
            socket.join(postIDs); //places this socket in a "room" based on the post id; all the sockets in this room will get comment/post events for this post (below)
        })
    })

    //return some fun functions for the other code to call
    return {
        notifyUser: async function(userID, notification) {
            var notifHTML = await hbs.render('./views/partials/notifications.handlebars', { loggedIn: true, justHTML: true, notifications: [notification] });
            io.in(userID.toString()).emit('notification', notifHTML);
        },
        commentDeleted: function(postID, commentID) {
            io.in(postID.toString()).emit('comment deleted', postID, commentID);
        },
        //when calling this you can generally pass in `req.cookies.io` for commenterClientID. any falsy value should be good for parentID if it's a top-level comment
        //this function assumes that postDocument has its community and author fields populated bc that's how it is right now in the createcomment route that calls this
        commentAdded: function(commenterClientID, postDocument, parentID, commentHTML) {
            io.of('/').in(postDocument._id.toString()).clients(async (error, clients) => {
                if (error) {
                    return console.error('could not retrieve sockets in room ' + postDocument._id.toString() + ' for new comment notification for that post, error:', error);
                }
                for (var clientID of clients) {
                    if (clientID != commenterClientID) { //don't need to give the comment to the client that just made the comment
                        var socket = io.sockets.connected[clientID];
                        var permissionToSee = false;
                        if (postDocument.privacy == 'public' && (!postDocument.community || postDocument.community.visibility == 'public')) {
                            permissionToSee = true;
                        } else if (socket.userID != 'anonymous' && postDocument.community) {
                            permissionToSee = !!(await User.findOne({ _id: socket.userID, communities: postDocument.community._id }));
                        } else if (socket.userID != 'anonymous' && postDocument.privacy == 'private') {
                            permissionToSee = !!(await Relationship.findOne({ value: 'trust', fromUser: postDocument.author._id, toUser: socket.userID }))
                        }
                        if (permissionToSee && socket) {
                            socket.emit('comment added', postDocument._id.toString(), parentID, commentHTML);
                        }
                    }
                }
            })
        },
        markNotifsRead: function(userID, readNotifsArray){
            io.in(userID.toString()).emit('notification(s) read', readNotifsArray);
        }
    };
}