connectedUsers = {}; //global object matching the ids of connected users to their sockets in an array so we can find them to send 'em their notifications later
function emitEvent(userID,event,data){
    for(var socket of connectedUsers[userID]){
        socket.emit(event,data);
    }
}
module.exports = function(io){
    io.on('connection', async (socket) => {
        var userID = (JSON.parse((await Sessions.findById(socket.handshake.headers.cookie.match(/connect.sid=s%3A(.*?)\./)[1])).session).passport.user); //this is horrifying but, on the other hand, i'm a genius
        if(connectedUsers[userID] === undefined){
            connectedUsers[userID]  = [socket];
        }else{
            connectedUsers[userID].push(socket);
        }
        socket.on('disconnect',function(reason){
            console.log("socket disconnecting bc",reason);
            connectedUsers[userID] = connectedUsers[userID].filter(v=>v.id!=socket.id);
        });
        emitEvent(userID,'found',true);
    })
}