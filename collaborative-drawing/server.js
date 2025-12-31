const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // frontend URL
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// Store board states in memory
const boards = new Map(); // boardId => { actions: [], canvasData: null }
const userCursors = new Map(); // boardId => Map(socketId => { x, y, username, color })
const boardsUsers = {}; // boardId => [{ socketId, username, color }]

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins a board
  socket.on('joinBoard', ({ boardId, username }) => {
    socket.join(boardId);
    socket.boardId = boardId;
    socket.username = username;

    // Initialize board if needed
    if (!boards.has(boardId)) boards.set(boardId, { actions: [], canvasData: null });
    if (!userCursors.has(boardId)) userCursors.set(boardId, new Map());
    if (!boardsUsers[boardId]) boardsUsers[boardId] = [];

    // Assign color and add user
    const color = getUserColor(socket.id);
    boardsUsers[boardId].push({ socketId: socket.id, username, color });

    // Send board state to new user
    socket.emit('boardState', boards.get(boardId));

    // Notify all users in board
    io.to(boardId).emit('activeUsers', boardsUsers[boardId]);
    socket.to(boardId).emit('userJoined', { username });

    console.log(`${username} joined board ${boardId}`);
  });

  // Track user cursors
  socket.on('cursorMove', ({ x, y, boardId }) => {
    if (!userCursors.has(boardId)) return;
    const boardCursors = userCursors.get(boardId);
    boardCursors.set(socket.id, { x, y, username: socket.username, color: getUserColor(socket.id) });

    const cursorsObj = Object.fromEntries(
      Array.from(boardCursors.entries()).filter(([id]) => id !== socket.id)
    );

    socket.to(boardId).emit('userCursors', cursorsObj);
  });

  // Drawing events
  ['drawing', 'shape', 'erase', 'fill'].forEach(event => {
    socket.on(event, (data) => {
      const { boardId } = data;
      socket.to(boardId).emit(event, { ...data, username: socket.username });
      if (boards.has(boardId)) boards.get(boardId).actions.push({ type: event, data, timestamp: Date.now() });
    });
  });

  socket.on('clearCanvas', ({ boardId }) => {
    socket.to(boardId).emit('clearCanvas', { username: socket.username });
    if (boards.has(boardId)) {
      const board = boards.get(boardId);
      board.actions = [];
      board.canvasData = null;
    }
  });

  socket.on('saveBoard', ({ boardId, canvasData }) => {
    if (boards.has(boardId)) boards.get(boardId).canvasData = canvasData;
  });

  // User disconnects
  socket.on('disconnect', () => {
    const boardId = socket.boardId;
    if (boardId) {
      // Remove cursor
      if (userCursors.has(boardId)) userCursors.get(boardId).delete(socket.id);

      // Remove user from board
      if (boardsUsers[boardId]) {
        boardsUsers[boardId] = boardsUsers[boardId].filter(u => u.socketId !== socket.id);
        io.to(boardId).emit('activeUsers', boardsUsers[boardId]);
      }

      // Notify others
      socket.to(boardId).emit('userLeft', { username: socket.username });
    }

    console.log('User disconnected:', socket.id);
  });
});

// Assign a color to a user
function getUserColor(socketId) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B4D9', '#A8E6CF'];
  const hash = socketId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
