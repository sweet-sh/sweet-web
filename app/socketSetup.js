module.exports = function(io) {
    io.on('connection', async (socket) => {
        var sidCookie = undefined;
        try {
            if (socket.handshake.headers.cookie && (sidCookie = socket.handshake.headers.cookie.match(/connect.sid=s%3A(.*?)\./)[1])) {
                var session = await Sessions.findById(sidCookie);
                var userID = JSON.parse(session.session).passport.user;
                socket.userID = userID;
                socket.join(userID);
                socket.on('post(s) loaded', function(postIDs){
                    socket.join(postIDs);
                })
            }
        } catch (err) {
            console.log("could not authenticate user through socket even though they had the appropriate cookie, maybe they just logged out or their session just expired or:", err);
        }
        if (socket.userID === undefined) {
            console.log("unauthenticated user connected to socket; what do");
        }
    })

    //return some fun functions for the other code to call
    return {
        notifyUser: async function(userID, notification) {
            io.to(userID).emit('notification', await hbs.render('./views/partials/notifications.handlebars', { loggedIn: true, justHTML: true, notifications: [notification] }));
        },
        commentDeleted: function(postID, commentID){
            io.to(postID).emit('comment deleted', postID, commentID);
        },
        //when calling this you can generally pass in `req.cookies.io` for socketID. any falsy value should be good for parentID if it's a top-level comment
        //this function assumes that postDocument has its community and author fields populated bc that's how it is right now in the createcomment route that calls this
        commentAdded: function(socketID, postDocument, parentID, commentHTML){
            var permissionToSee = false;
            io.of('/').in(postDocument._id.toString()).clients(async (error,clients)=>{
                for(var socket of clients){
                    if(socket!=socketID){ //don't need to give the comment to the client that just made the comment
                        if(postDocument.privacy == 'public' && (!postDocument.community || postDocument.community.visibility == 'public')){
                            permissionToSee = true;
                        }else if(postDocument.community){
                            permissionToSee = !!(await User.findOne({_id: socket.userID, communities: postDocument.community._id}));
                        }else if(postDocument.privacy == 'private'){
                            permissionToSee = !!(await Relationship.findOne({value:'trust',fromUser:postDocument.author._id,toUser:socket.userID}))
                        }
                        if(permissionToSee && io.sockets.connected[socket]){
                            io.sockets.connected[socket].emit('comment added', postDocument._id.toString(), parentID, commentHTML);
                        }
                    }
                }
            })
        }
    };
}