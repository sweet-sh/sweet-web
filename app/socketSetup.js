var connectedUsers = {}; //object matching the ids of connected users to their sockets in an array so we can find them to send 'em their notifications later

module.exports = function(io) {
    //add users to connectedUsers when they are connected. and remove when they aren't anymore
    io.on('connection', async (socket) => {
        var userID = (JSON.parse((await Sessions.findById(socket.handshake.headers.cookie.match(/connect.sid=s%3A(.*?)\./)[1])).session).passport.user); //this is horrifying but, on the other hand, i'm a genius
        if (connectedUsers[userID] === undefined) {
            connectedUsers[userID] = [socket];
        } else {
            connectedUsers[userID].push(socket);
        }
        socket.on('disconnect', function(reason) {
            console.log("socket disconnecting bc", reason);
            connectedUsers[userID] = connectedUsers[userID].filter(v => v.id != socket.id);
        });
        socket.emit('found', true);
    })

    //return some fun functions for the other code to call
    return {
        notifyUser: async function(userID, notification) {
            for (var socket of connectedUsers[userID]) {
                socket.emit('notification', await hbs.render('./views/partials/notifications.handlebars', { loggedIn:true, justHTML: true, notifications: [notification] }));
            }
        }
    };
}