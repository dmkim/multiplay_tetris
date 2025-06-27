const startButton = document.getElementById('start-button');
const winnerMessage = document.getElementById('winner-message');
const createRoomButton = document.getElementById('create-room-button');
const joinRoomButton = document.getElementById('join-room-button');
const roomCodeInput = document.getElementById('room-code-input');
const menu = document.getElementById('menu');
const gameLobby = document.getElementById('game-lobby');
const lobbyMessage = document.getElementById('lobby-message');
const readyButton = document.getElementById('ready-button');

const socket = io();

let player1 = null;
let player2 = null;
let animationFrameId;
let localPlayerId = null;
let isHost = false;

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const COLORS = [
    null,
    '#FF0D72', // T
    '#0DC2FF', // I
    '#0DFF72', // O
    '#F538FF', // L
    '#FF8E0D', // J
    '#FFE138', // S
    '#3877FF'  // Z
];

const SHAPES = [
    [],
    [[1, 1, 1], [0, 1, 0]], // T
    [[2, 2, 2, 2]], // I
    [[3, 3], [3, 3]], // O
    [[4, 0, 0], [4, 4, 4]], // L
    [[0, 0, 5], [5, 5, 5]], // J
    [[0, 6, 6], [6, 6, 0]], // S
    [[7, 7, 0], [0, 7, 7]]  // Z
];

class Game {
    constructor(playerId) {
        this.playerId = playerId;
        this.canvas = document.getElementById(`tetris-board-${playerId}`);
        this.context = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById(`next-canvas-${playerId}`);
        this.nextContext = this.nextCanvas.getContext('2d');
        this.scoreElement = document.getElementById(`score-${playerId}`);
        this.levelElement = document.getElementById(`level-${playerId}`);
        this.controlsElement = document.getElementById(`controls-${playerId}`);

        this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;
        this.levelUpTimer = 0;
        this.gameOver = false;

        this.piece = this.createPiece();
        this.nextPiece = this.createPiece();

        this.updateScore();
        this.drawNextPiece();
        this.updateControlsDisplay();
    }

    drawSquare(x, y, color, ctx = this.context) {
        ctx.fillStyle = color;
        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = '#333';
        ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }

    drawBoard() {
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (this.board[row][col]) {
                    this.drawSquare(col, row, COLORS[this.board[row][col]]);
                } else {
                    this.context.fillStyle = '#000';
                    this.context.fillRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    this.context.strokeStyle = '#111';
                    this.context.strokeRect(col * BLOCK_SIZE, row * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }
    }

    drawPiece(piece, ctx = this.context) {
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    this.drawSquare(piece.x + x, piece.y + y, COLORS[value], ctx);
                }
            });
        });
    }

    drawNextPiece() {
        this.nextContext.fillStyle = '#f8f8f8';
        this.nextContext.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        const shape = this.nextPiece.shape;
        const x = (this.nextCanvas.width / BLOCK_SIZE - shape[0].length) / 2;
        const y = (this.nextCanvas.height / BLOCK_SIZE - shape.length) / 2;

        shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value > 0) {
                    this.drawSquare(x + c, y + r, COLORS[value], this.nextContext);
                }
            });
        });
    }

    createPiece() {
        const typeId = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
        const shape = SHAPES[typeId];
        return {
            x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
            y: 0,
            shape: shape,
            color: COLORS[typeId]
        };
    }

    reset() {
        this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.dropInterval = 1000;
        this.levelUpTimer = 0;
        this.gameOver = false;
        this.piece = this.createPiece();
        this.nextPiece = this.createPiece();
        this.updateScore();
        this.drawNextPiece();
    }

    updateScore() {
        this.scoreElement.innerText = this.score;
        this.levelElement.innerText = this.level;
    }

    updateControlsDisplay() {
        if (this.playerId === localPlayerId) {
            this.controlsElement.innerHTML = `
                <p>←, A: 왼쪽</p>
                <p>→, D: 오른쪽</p>
                <p>↓, S: 아래</p>
                <p>↑, W: 회전</p>
            `;
        } else {
            this.controlsElement.innerHTML = `
                <p>상대방 조작</p>
            `;
        }
    }

    loop(time = 0) {
        if (this.gameOver) return;

        const deltaTime = time - this.lastTime;
        this.lastTime = time;

        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.pieceDrop();
        }

        this.levelUpTimer += deltaTime;
        if (this.levelUpTimer > 10000) { // 10 seconds
            this.level++;
            this.dropInterval *= 0.9;
            this.levelUpTimer = 0;
            this.updateScore();
        }

        this.drawBoard();
        this.drawPiece(this.piece);

        if (this.playerId === localPlayerId) {
            socket.emit('gameUpdate', {
                board: this.board,
                piece: this.piece,
                nextPiece: this.nextPiece,
                score: this.score,
                level: this.level
            });
        }
    }

    pieceDrop() {
        this.piece.y++;
        if (this.collide()) {
            this.piece.y--;
            this.merge();
            this.piece = this.nextPiece;
            this.nextPiece = this.createPiece();
            this.drawNextPiece();
            this.clearLines();
            if (this.collide()) {
                this.gameOver = true;
                socket.emit('gameOver', { winner: this.playerId === 1 ? 2 : 1 });
                checkWinner();
            }
        }
        this.dropCounter = 0;
    }

    collide() {
        for (let y = 0; y < this.piece.shape.length; y++) {
            for (let x = 0; x < this.piece.shape[y].length; x++) {
                if (
                    this.piece.shape[y][x] !== 0 &&
                    (this.board[this.piece.y + y] && this.board[this.piece.y + y][this.piece.x + x]) !== 0
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    merge() {
        this.piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.board[this.piece.y + y][this.piece.x + x] = value;
                }
            });
        });
    }

    rotate() {
        const originalShape = this.piece.shape;
        const newShape = originalShape[0].map((_, colIndex) =>
            originalShape.map(row => row[colIndex]).reverse()
        );

        const originalX = this.piece.x;
        let offset = 1;
        this.piece.shape = newShape;

        while (this.collide()) {
            this.piece.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > this.piece.shape[0].length) {
                this.piece.shape = originalShape;
                this.piece.x = originalX;
                return;
            }
        }
    }

    pieceMove(dir) {
        this.piece.x += dir;
        if (this.collide()) {
            this.piece.x -= dir;
        }
    }

    clearLines() {
        let lines = 0;
        outer: for (let y = ROWS - 1; y >= 0; y--) {
            for (let x = 0; x < COLS; x++) {
                if (this.board[y][x] === 0) {
                    continue outer;
                }
            }

            const row = this.board.splice(y, 1)[0].fill(0);
            this.board.unshift(row);
            y++;
            lines++;
        }

        if (lines > 0) {
            this.score += lines * 10 * lines;
            this.linesCleared += lines;
            this.updateScore();
        }
    }
}

function gameLoop(time) {
    if (player1) player1.loop(time);
    if (player2) player2.loop(time);
    animationFrameId = requestAnimationFrame(gameLoop);
}

function checkWinner() {
    if (player1 && player2 && player1.gameOver && !player2.gameOver) {
        winnerMessage.innerText = 'Player 2가 승리했습니다!';
        stopGame();
    } else if (player1 && player2 && player2.gameOver && !player1.gameOver) {
        winnerMessage.innerText = 'Player 1이 승리했습니다!';
        stopGame();
    }
}

function stopGame() {
    cancelAnimationFrame(animationFrameId);
}

function resetGame() {
    if(player1) player1.reset();
    if(player2) player2.reset();
    winnerMessage.innerText = '';
}

createRoomButton.addEventListener('click', () => {
    const roomCode = Math.random().toString(36).substring(2, 8);
    socket.emit('createRoom', roomCode);
    localPlayerId = 1;
    isHost = true;
    document.body.classList.remove('participant');
    lobbyMessage.innerText = `방 코드: ${roomCode} (상대방 기다리는 중...)`;
    menu.style.display = 'none';
    gameLobby.style.display = 'block';
});

joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value;
    if (roomCode) {
        socket.emit('joinRoom', roomCode);
        localPlayerId = 2;
        isHost = false;
        document.body.classList.add('participant');
        lobbyMessage.innerText = `방 코드: ${roomCode} (방장 기다리는 중...)`;
        menu.style.display = 'none';
        gameLobby.style.display = 'block';
    } else {
        alert('방 코드를 입력해주세요.');
    }
});

readyButton.addEventListener('click', () => {
    socket.emit('ready');
    readyButton.disabled = true;
    lobbyMessage.innerText = '준비 완료! 상대방을 기다리는 중...';
});

startButton.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('roomCreated', (roomCode) => {
    console.log(`Room created with code: ${roomCode}`);
});

socket.on('playerJoined', (roomCode) => {
    lobbyMessage.innerText = `방 코드: ${roomCode} (상대방이 접속했습니다. 게임 준비를 눌러주세요.)`;
});

socket.on('playerReady', (data) => {
    const playerNum = data.playerId;
    const readyStatus = data.isReady;
    if (playerNum === 1) {
        lobbyMessage.innerText = `방장 준비: ${readyStatus ? '완료' : '대기'}`;
    } else {
        lobbyMessage.innerText = `참가자 준비: ${readyStatus ? '완료' : '대기'}`;
    }
});

socket.on('allPlayersReady', () => {
    if (isHost) {
        startButton.disabled = false;
        lobbyMessage.innerText = '모든 플레이어가 준비되었습니다. 게임 시작 버튼을 눌러주세요.';
    }
});

socket.on('startGame', () => {
    player1 = new Game(1);
    player2 = new Game(2);
    gameLobby.style.display = 'none';
    resetGame();
    gameLoop(0);
    startButton.blur();
});

socket.on('gameUpdate', (data) => {
    const opponentPlayer = localPlayerId === 1 ? player2 : player1;
    if (opponentPlayer) {
        opponentPlayer.board = data.board;
        opponentPlayer.piece = data.piece;
        opponentPlayer.nextPiece = data.nextPiece;
        opponentPlayer.score = data.score;
        opponentPlayer.level = data.level;
        opponentPlayer.updateScore();
        opponentPlayer.drawBoard();
        opponentPlayer.drawPiece(opponentPlayer.piece);
        opponentPlayer.drawNextPiece();
    }
});

socket.on('gameOver', (data) => {
    const winner = data.winner;
    winnerMessage.innerText = `Player ${winner}가 승리했습니다!`;
    stopGame();
});

socket.on('playerLeft', (message) => {
    winnerMessage.innerText = message;
    stopGame();
    // Optionally, reset game state or return to lobby
});

socket.on('error', (message) => {
    alert(message);
});

document.addEventListener('keydown', event => {
    const localPlayer = localPlayerId === 1 ? player1 : player2;
    if (localPlayer && !localPlayer.gameOver) {
        switch (event.key) {
            case 'a':
            case 'A':
                localPlayer.pieceMove(-1);
                break;
            case 'd':
            case 'D':
                localPlayer.pieceMove(1);
                break;
            case 's':
            case 'S':
                localPlayer.pieceDrop();
                break;
            case 'w':
            case 'W':
                localPlayer.rotate();
                break;
        }
    }
});

// Initial setup
// player1.drawBoard();
// player2.drawBoard();