
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // { roomCode: { hostId: socket.id, players: [], ready: { player1: false, player2: false } } }

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('createRoom', (roomCode) => {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.isHost = true;
        rooms[roomCode] = { hostId: socket.id, players: [socket.id], ready: {},
        playerCount: 1 };
        console.log(`Room created: ${roomCode}`);
        socket.emit('roomCreated', roomCode);
    });

    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.playerCount === 1) {
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.isHost = false;
            room.players.push(socket.id);
            room.playerCount++;
            io.to(roomCode).emit('playerJoined', roomCode);
            console.log(`Player joined room: ${roomCode}`);
        } else {
            socket.emit('error', '방이 꽉 찼거나 존재하지 않습니다.');
        }
    });

    socket.on('gameUpdate', (data) => {
        socket.to(socket.roomCode).emit('gameUpdate', data);
    });

    socket.on('gameOver', (data) => {
        socket.to(socket.roomCode).emit('gameOver', data);
    });

    socket.on('ready', () => {
        const room = rooms[socket.roomCode];
        if (room) {
            if (socket.isHost) {
                room.ready.player1 = true;
            } else {
                room.ready.player2 = true;
            }
            io.to(socket.roomCode).emit('playerReady', { playerId: socket.isHost ? 1 : 2, isReady: true });

            if (room.ready.player1 && room.ready.player2) {
                io.to(room.hostId).emit('allPlayersReady');
            }
        }
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (room && socket.id === room.hostId && room.ready.player1 && room.ready.player2) {
            io.to(socket.roomCode).emit('startGame');
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        if (socket.roomCode) {
            const room = rooms[socket.roomCode];
            if (room) {
                if (socket.isHost) {
                    io.to(socket.roomCode).emit('playerLeft', '방장이 나갔습니다.');
                    delete rooms[socket.roomCode];
                } else {
                    room.playerCount--;
                    room.players = room.players.filter(id => id !== socket.id);
                    room.ready.player2 = false;
                    io.to(socket.roomCode).emit('playerLeft', '상대방이 나갔습니다.');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
