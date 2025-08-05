const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = 5000;

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

// DB connection
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'Manvadind8962@',
  database: 'login_db'
});
db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected');
});

// Routes

// Home
app.get('/', (req, res) => {
  res.render('home', { user: req.session.user });
});

// Login & Register
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// Login logic
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      req.session.user = results[0];
      res.redirect('/groups');
    } else res.send('Invalid credentials');
  });
});

// Register logic
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      res.send('Username already taken');
    } else {
      db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], err => {
        if (err) throw err;
        res.redirect('/login');
      });
    }
  });
});

// List user's groups
app.get('/groups', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const userId = req.session.user.id;
  db.query(`SELECT g.* FROM \`groups\` g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?`, [userId], (err, groups) => {
    if (err) throw err;
    res.render('groups', { user: req.session.user, groups });
  });
});

// Create group
app.post('/groups/create', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { group_name, group_key } = req.body;
  db.query('INSERT INTO `groups` (name, group_key) VALUES (?, ?)', [group_name, group_key], (err, result) => {
    if (err) throw err;
    db.query('INSERT INTO group_members (user_id, group_id) VALUES (?, ?)', [req.session.user.id, result.insertId], err2 => {
      if (err2) throw err2;
      res.redirect('/groups');
    });
  });
});

// Join group
app.post('/groups/join', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { group_name, group_key } = req.body;
  db.query('SELECT * FROM `groups` WHERE name = ? AND group_key = ?', [group_name, group_key], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      const groupId = results[0].id;
      db.query('INSERT IGNORE INTO group_members (user_id, group_id) VALUES (?, ?)', [req.session.user.id, groupId], err2 => {
        if (err2) throw err2;
        res.redirect('/groups');
      });
    } else res.send('Group not found or invalid key');
  });
});

// Chat page: load previous messages + files
app.get('/chat/:groupId', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const groupId = req.params.groupId;
  db.query('SELECT * FROM `groups` WHERE id = ?', [groupId], (err, groupResults) => {
    if (err) throw err;
    if (groupResults.length > 0) {
      db.query(`SELECT m.*, u.username FROM messages m 
                JOIN users u ON m.user_id = u.id
                WHERE m.group_id = ? ORDER BY m.created_at ASC`, [groupId], (err2, messages) => {
        if (err2) throw err2;
        db.query('SELECT * FROM files WHERE group_id = ?', [groupId], (err3, files) => {
          if (err3) throw err3;
          res.render('chat', {
            user: req.session.user,
            group: groupResults[0],
            messages,
            files
          });
        });
      });
    } else res.send('Group not found');
  });
});

// File upload route
app.post('/chat/:groupId/upload', upload.single('file'), (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { groupId } = req.params;
  const userId = req.session.user.id;
  const filename = req.file.originalname;
  const filepath = '/uploads/' + req.file.filename;
  db.query('INSERT INTO files (group_id, user_id, filename, filepath) VALUES (?, ?, ?, ?)',
    [groupId, userId, filename, filepath], err => {
      if (err) throw err;
      res.redirect('/chat/' + groupId);
    });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) throw err;
    res.redirect('/');
  });
});

// Socket.IO
io.on('connection', socket => {
  socket.on('joinRoom', room => socket.join(room));
  socket.on('chatMessage', ({ room, userId, username, message }) => {
    db.query('INSERT INTO messages (group_id, user_id, message) VALUES (?, ?, ?)',
      [room, userId, message], err => {
        if (err) throw err;
        io.to(room).emit('chatMessage', { user: username, message });
      });
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
