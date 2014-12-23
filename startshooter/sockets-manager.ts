
declare var io: any;
var io;
var sockets: any[] = [];
var scores: number[] = [0, 0];

function affectRole(socket) {
    if (sockets.length === 0) {
        socket.emit('role', 'left');
    } else if (sockets.length === 1) {
        socket.emit('role', 'right');
    } else {
        return;
    }

    sockets.push(socket);
}

export function initSocketIO(server){
    // Socket io
    io = require('socket.io')(server);
    
    io.on('connection', function (socket) {
        console.log('a user connected');

        if (sockets.length >= 2) {
            console.log("Too much connection");
            return;
        }

        affectRole(socket);

        socket.on('position', function (position) {
            socket.broadcast.emit('opponent-position', position);
        });

        socket.on('laser-fired', function () {
            socket.broadcast.emit('laser-fired');
        });

        socket.on('disconnect', function () {
            var index = sockets.indexOf(socket);
            sockets = sockets.splice(index, 1);
            console.log('User disconnected');
        });
    });
}
