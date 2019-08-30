var connectedUsers = {}; //object matching the ids of connected users to their sockets in an array so we can find them to send 'em their notifications later
var postsInView = {}; //object matching each post to an array of sockets which have loaded it so we can immediately find who to send events about any given post to

module.exports = function(io) {
    //add users to connectedUsers when they are connected. and remove when they aren't anymore
    io.on('connection', async (socket) => {
        var sidCookie = undefined;
        try {
            if (socket.handshake.headers.cookie && (sidCookie = socket.handshake.headers.cookie.match(/connect.sid=s%3A(.*?)\./)[1])) {
                var session = await Sessions.findById(sidCookie);
                var userID = JSON.parse(session.session).passport.user;
                if (connectedUsers[userID] === undefined) {
                    connectedUsers[userID] = [socket];
                } else {
                    connectedUsers[userID].push(socket);
                }
                socket.on('disconnect', function(reason) {
                    //console.log("socket disconnecting bc", reason);
                    connectedUsers[userID] = connectedUsers[userID].filter(v => v.id != socket.id);
                });
            }
        } catch (err) {
            console.log("could not authenticate user through socket even though they had the appropriate cookie, maybe they just logged out or their session just expired or:", err);
        }
        if (sidCookie === undefined) {
            console.log("logged out user connected to socket; what do");
        }
    })

    //return some fun functions for the other code to call
    return {
        notifyUser: async function(userID, notification) {
            for (var socket of connectedUsers[userID]) {
                socket.emit('notification', await hbs.render('./views/partials/notifications.handlebars', { loggedIn: true, justHTML: true, notifications: [notification] }));
            }
        },
        commentDeleted: function(postID, commentID){
            io.emit('comment deleted', postID, commentID);
        },
        commentAdded: function(socketID, postID, parentID, commentID, commentHTML){
            for(user in connectedUsers){
                for(socket of connectedUsers[user]){
                    if(socketID!=socket.id){//don't need to send the client that just made the comment the comment
                        socket.emit('comment added', postID, parentID, commentID, commentHTML);
                    }
                }
            }
        }
    };
}