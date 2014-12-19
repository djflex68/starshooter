/// <reference path="game.ts" />

declare var io: any;

$(document).ready(() => {


    var game: Game = new Game(),
        socket = io();

    socket.on('connect', function () {
        
        socket.on('role', function (role) {
            game.initGame({
                width: 800,
                height: 600,
                containerId: 'canvas-container'
            }, role, socket);
        });
    });

});
