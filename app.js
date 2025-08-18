require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 5000;
const saltRounds = 10;

// ----------------- DATABASE -----------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ----------------- MULTER -----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ----------------- MIDDLEWARE -----------------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback_secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Auth middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  res.redirect('/login');
};

// ----------------- ROUTES -----------------
app.get('/', (req, res) => {
  res.render('home', { user: req.session.user });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existing = await db.query("SELECT * FROM users WHERE username=$1", [username]);
    if (existing.rows.length > 0) return res.send("Username already taken");

    const hash = await bcrypt.hash(password, saltRounds);
    await db.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, hash]);

    res.redirect('/login');
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).send("Server error");
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username=$1", [username]);
    if (result.rows.length === 0) return res.send("Invalid credentials");

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Invalid credentials");

    req.session.user = user;
    res.redirect('/groups');
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

// Groups page
app.get('/groups', isAuthenticated, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
    `, [req.session.user.id]);
    res.render('groups', { user: req.session.user, groups: result.rows });
  } catch (err) {
    console.error("Groups fetch error:", err);
    res.status(500).send("Server error");
  }
});

// Create group
app.post('/groups/create', isAuthenticated, async (req, res) => {
  const { group_name, group_key } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO groups (name, group_key) VALUES ($1, $2) RETURNING id",
      [group_name, group_key]
    );
    const groupId = result.rows[0].id;
    await db.query("INSERT INTO group_members (user_id, group_id) VALUES ($1, $2)",
      [req.session.user.id, groupId]);
    res.redirect('/groups');
  } catch (err) {
    console.error("Group create error:", err);
    res.status(500).send("Server error");
  }
});

// Join group
app.post('/groups/join', isAuthenticated, async (req, res) => {
  const { group_name, group_key } = req.body;
  try {
    const result = await db.query(
      "SELECT * FROM groups WHERE name=$1 AND group_key=$2",
      [group_name, group_key]
    );
    if (result.rows.length === 0) return res.send("Group not found or invalid key");

    const groupId = result.rows[0].id;
    await db.query(
      "INSERT INTO group_members (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [req.session.user.id, groupId]
    );
    res.redirect('/groups');
  } catch (err) {
    console.error("Group join error:", err);
    res.status(500).send("Server error");
  }
});

// Chat
app.get('/chat/:groupId', isAuthenticated, async (req, res) => {
  const { groupId } = req.params;
  try {
    const check = await db.query(
      "SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2",
      [groupId, req.session.user.id]
    );
    if (check.rows.length === 0) return res.status(403).send("Not a member");

    const group = await db.query("SELECT * FROM groups WHERE id=$1", [groupId]);
    if (group.rows.length === 0) return res.status(404).send("Group not found");

    const messages = await db.query(`
      SELECT m.*, u.username FROM messages m
      JOIN users u ON m.user_id=u.id
      WHERE m.group_id=$1 ORDER BY m.created_at ASC
    `, [groupId]);

    const files = await db.query("SELECT * FROM files WHERE group_id=$1", [groupId]);

    res.render('chat', {
      user: req.session.user,
      group: group.rows[0],
      messages: messages.rows,
      files: files.rows
    });
  } catch (err) {
    console.error("Chat fetch error:", err);
    res.status(500).send("Server error");
  }
});

// File upload
app.post('/chat/:groupId/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  const { groupId } = req.params;
  const filename = req.file.originalname;
  const filepath = '/uploads/' + req.file.filename;

  try {
    await db.query(
      "INSERT INTO files (group_id, user_id, filename, filepath) VALUES ($1, $2, $3, $4)",
      [groupId, req.session.user.id, filename, filepath]
    );
    res.redirect('/chat/' + groupId);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).send("Server error");
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ----------------- SOCKET.IO -----------------
io.on('connection', socket => {
  socket.on('joinRoom', room => socket.join(room));
  socket.on('chatMessage', async ({ room, userId, username, message }) => {
    try {
      await db.query(
        "INSERT INTO messages (group_id, user_id, message) VALUES ($1, $2, $3)",
        [room, userId, message]
      );
      io.to(room).emit('chatMessage', { user: username, message });
    } catch (err) {
      console.error("Socket insert error:", err);
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
