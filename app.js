require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const connectPgSimple = require('connect-pg-simple');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 5000;
const saltRounds = 10;

// DATABASE CONFIGURATION
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};
if (process.env.NODE_ENV === 'production') {
  dbConfig.ssl = { rejectUnauthorized: false };
}
const db = new Pool(dbConfig);

// MULTER CONFIGURATION
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// MIDDLEWARE
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

const sessionStore = new (connectPgSimple(session))({
    pool: db,
    createTableIfMissing: true,
});
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

const isAuthenticated = (req, res, next) => {
  if (req.session.user) next();
  else res.redirect('/login');
};

// **THE FIX IS HERE**
// This middleware now correctly finds the user's role and attaches it to the request object.
const checkGroupRole = (roles) => async (req, res, next) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;
    try {
        const result = await db.query(
            "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
            [groupId, userId]
        );
        if (result.rows.length > 0 && roles.includes(result.rows[0].role)) {
            // This line was missing, causing the crash. It is now fixed.
            req.userRole = result.rows[0].role;
            next();
        } else {
            res.status(403).send("You do not have permission to perform this action.");
        }
    } catch (err) {
        console.error("Role check error:", err);
        res.status(500).send("Server error");
    }
};

// ROUTES
app.get('/', (req, res) => res.render('home', { user: req.session.user }));
app.get('/login', (req, res) => res.render('login', { user: req.session.user }));
app.get('/register', (req, res) => res.render('register', { user: req.session.user }));

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const result = await db.query( "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username", [username, email, hash] );
    req.session.user = result.rows[0];
    res.redirect('/groups');
  } catch (err) {
    console.error("Registration error:", err);
    res.redirect('/register');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        req.session.user = { id: user.id, username: user.username };
        res.redirect('/groups');
      } else { res.send("Incorrect password"); }
    } else { res.send("User not found"); }
  } catch (err) {
    console.error("Login error:", err);
    res.redirect('/login');
  }
});

app.get('/groups', isAuthenticated, async (req, res) => {
  try {
    const result = await db.query( "SELECT g.id, g.name, gm.role FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = $1", [req.session.user.id] );
    res.render('groups', { user: req.session.user, groups: result.rows });
  } catch (err) {
    console.error("Groups fetch error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/groups/create', isAuthenticated, async (req, res) => {
    const { name, key } = req.body;
    const userId = req.session.user.id;
    try {
        const hash = await bcrypt.hash(key, saltRounds);
        const groupResult = await db.query( "INSERT INTO groups (name, key) VALUES ($1, $2) RETURNING id", [name, hash] );
        const groupId = groupResult.rows[0].id;
        await db.query( "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')", [groupId, userId] );
        res.redirect('/groups');
    } catch (err) {
        console.error("Group creation error:", err);
        res.status(500).send("Server error");
    }
});

app.post('/groups/join', isAuthenticated, async (req, res) => {
  const { name, key } = req.body;
  try {
    const result = await db.query("SELECT * FROM groups WHERE name = $1", [name]);
    if (result.rows.length > 0) {
      const group = result.rows[0];
      if (await bcrypt.compare(key, group.key)) {
        await db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING", [group.id, req.session.user.id]);
        res.redirect('/groups');
      } else { res.send("Incorrect key"); }
    } else { res.send("Group not found"); }
  } catch (err) {
    console.error("Group join error:", err);
    res.status(500).send("Server error");
  }
});

app.get('/chat/:groupId', isAuthenticated, checkGroupRole(['owner', 'admin', 'member']), async (req, res) => {
  const { groupId } = req.params;
  try {
    const groupResult = await db.query("SELECT * FROM groups WHERE id = $1", [groupId]);
    if (groupResult.rows.length === 0) { return res.status(404).send("Group not found"); }
    const messages = await db.query( `SELECT m.*, u.username, p.content as parent_content, p_u.username as parent_username FROM messages m JOIN users u ON m.user_id = u.id LEFT JOIN messages p ON m.parent_message_id = p.id LEFT JOIN users p_u ON p.user_id = p_u.id WHERE m.group_id = $1 ORDER BY m.created_at ASC`, [groupId] );
    const reactions = await db.query( `SELECT r.* FROM reactions r JOIN messages m ON r.message_id = m.id WHERE m.group_id = $1`, [groupId] );
    const files = await db.query("SELECT * FROM files WHERE group_id = $1", [groupId]);
    res.render('chat', {
      user: req.session.user,
      group: groupResult.rows[0],
      messages: messages.rows,
      files: files.rows,
      reactions: reactions.rows,
      userRole: req.userRole
    });
  } catch (err) {
    console.error("Chat fetch error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/chat/:groupId/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  const { groupId } = req.params;
  const { originalname, filename, mimetype } = req.file;
  const filepath = '/uploads/' + filename;
  try {
    const result = await db.query( "INSERT INTO files (group_id, user_id, filename, filepath, mimetype) VALUES ($1, $2, $3, $4, $5) RETURNING *", [groupId, req.session.user.id, originalname, filepath, mimetype] );
    io.to(`group-${groupId}`).emit('newFile', result.rows[0]);
    res.redirect('/chat/' + groupId);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).send("Server error");
  }
});

app.get('/chat/:groupId/manage', isAuthenticated, checkGroupRole(['owner', 'admin']), async (req, res) => {
    const { groupId } = req.params;
    try {
        const membersResult = await db.query( "SELECT u.id, u.username, gm.role FROM users u JOIN group_members gm ON u.id = gm.user_id WHERE gm.group_id = $1 ORDER BY u.username", [groupId] );
        const groupResult = await db.query("SELECT name FROM groups WHERE id = $1", [groupId]);
        res.render('manage_group', {
            user: { ...req.session.user, role: req.userRole }, // This now works correctly
            members: membersResult.rows,
            group: groupResult.rows[0],
            groupId: groupId
        });
    } catch (err) {
        console.error("Manage group error:", err);
        res.status(500).send("Server error");
    }
});

app.post('/chat/:groupId/manage/kick', isAuthenticated, checkGroupRole(['owner', 'admin']), async (req, res) => {
    const { groupId } = req.params;
    const { userIdToKick } = req.body;
    try {
        await db.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 AND role <> 'owner'", [groupId, userIdToKick]);
        res.redirect(`/chat/${groupId}/manage`);
    } catch (err) {
        console.error("Kick user error:", err); res.status(500).send("Server error");
    }
});

app.post('/chat/:groupId/manage/promote', isAuthenticated, checkGroupRole(['owner']), async (req, res) => {
    const { groupId } = req.params;
    const { userIdToPromote } = req.body;
    try {
        await db.query( "UPDATE group_members SET role = 'admin' WHERE group_id = $1 AND user_id = $2 AND role = 'member'", [groupId, userIdToPromote] );
        res.redirect(`/chat/${groupId}/manage`);
    } catch (err) {
        console.error("Promote user error:", err); res.status(500).send("Server error");
    }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// SOCKET.IO
const activeUsers = {};
io.on('connection', socket => {
  const userId = socket.handshake.query.userId;
  const username = socket.handshake.query.username;

  socket.on('joinRoom', room => {
    socket.join(room);
    if (!activeUsers[room]) activeUsers[room] = {};
    activeUsers[room][userId] = username;
    io.to(room).emit('updateUserList', Object.values(activeUsers[room]));
  });

  socket.on('chatMessage', async ({ room, userId, username, message, parentId }) => {
    try {
      const result = await db.query( "INSERT INTO messages (group_id, user_id, content, parent_message_id) VALUES ($1, $2, $3, $4) RETURNING id, created_at", [room.replace('group-', ''), userId, message, parentId] );
      let parentData = { parent_content: null, parent_username: null };
      if (parentId) {
          const parentResult = await db.query(`SELECT m.content, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`, [parentId]);
          if(parentResult.rows.length > 0) {
              parentData.parent_content = parentResult.rows[0].content;
              parentData.parent_username = parentResult.rows[0].username;
          }
      }
      const newMsg = { id: result.rows[0].id, content: message, user_id: userId, username, created_at: result.rows[0].created_at, parent_message_id: parentId, ...parentData };
      io.to(room).emit('chatMessage', newMsg);
    } catch (err) { console.error("Socket chat message error:", err); }
  });

  socket.on('typing', ({ room, username }) => {
    socket.to(room).emit('typing', { username });
  });

  socket.on('addReaction', async ({ messageId, userId, emoji }) => {
    try {
        await db.query( "INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id, emoji) DO NOTHING", [messageId, userId, emoji] );
        const groupResult = await db.query("SELECT group_id FROM messages WHERE id = $1", [messageId]);
        if (groupResult.rows.length > 0) {
            const room = `group-${groupResult.rows[0].group_id}`;
            io.to(room).emit('reactionAdded', { messageId, userId, emoji });
        }
    } catch (err) { console.error("Add reaction error:", err); }
  });

  socket.on('disconnect', () => {
    for (const room in activeUsers) {
      if (activeUsers[room] && activeUsers[room][userId]) {
        delete activeUsers[room][userId];
        io.to(room).emit('updateUserList', Object.values(activeUsers[room]));
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));