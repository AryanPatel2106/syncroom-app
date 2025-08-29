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

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 5000;
const saltRounds = 10;

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};
if (process.env.NODE_ENV === 'production') {
  dbConfig.ssl = { rejectUnauthorized: false };
}
const db = new Pool(dbConfig);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'syncroom_uploads',
    resource_type: "auto",
    public_id: (req, file) => Date.now() + '-' + file.originalname,
  },
});

const upload = multer({ storage: storage });

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

// This middleware is now used for API routes
const isAuthenticatedAPI = (req, res, next) => {
  if (req.session.user) next();
  else res.status(401).json({ error: 'Not authenticated' });
};

const checkGroupRoleAPI = (roles) => async (req, res, next) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;
    try {
        const result = await db.query( "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId] );
        if (result.rows.length > 0 && roles.includes(result.rows[0].role)) {
            req.userRole = result.rows[0].role;
            next();
        } else {
            res.status(403).json({ error: 'Permission denied' });
        }
    } catch (err) {
        console.error("Role check error:", err);
        res.status(500).json({ error: 'Server error' });
    }
};

// --- API ROUTES ---

// Check session status
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ user: null });
    }
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const result = await db.query( "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username", [username, email, hash] );
    req.session.user = result.rows[0];
    res.status(201).json({ user: req.session.user });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await bcrypt.compare(password, user.password)) {
        req.session.user = { id: user.id, username: user.username };
        res.json({ user: req.session.user });
      } else { res.status(401).json({ error: "Incorrect password" }); }
    } else { res.status(404).json({ error: "User not found" }); }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.status(200).json({ message: 'Logged out' }));
});

app.get('/api/groups', isAuthenticatedAPI, async (req, res) => {
  try {
    const result = await db.query( "SELECT g.id, g.name, gm.role FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = $1", [req.session.user.id] );
    res.json({ user: req.session.user, groups: result.rows });
  } catch (err) {
    console.error("Groups fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/groups/create', isAuthenticatedAPI, async (req, res) => {
    const { name, key } = req.body;
    const userId = req.session.user.id;
    try {
        const hash = await bcrypt.hash(key, saltRounds);
        const groupResult = await db.query( "INSERT INTO groups (name, key) VALUES ($1, $2) RETURNING id", [name, hash] );
        const groupId = groupResult.rows[0].id;
        await db.query( "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')", [groupId, userId] );
        res.status(201).json({ message: 'Group created' });
    } catch (err) {
        console.error("Group creation error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/groups/join', isAuthenticatedAPI, async (req, res) => {
  const { name, key } = req.body;
  try {
    const result = await db.query("SELECT * FROM groups WHERE name = $1", [name]);
    if (result.rows.length > 0) {
      const group = result.rows[0];
      if (await bcrypt.compare(key, group.key)) {
        await db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING", [group.id, req.session.user.id]);
        res.json({ message: 'Group joined' });
      } else { res.status(401).json({ error: "Incorrect key" }); }
    } else { res.status(404).json({ error: "Group not found" }); }
  } catch (err) {
    console.error("Group join error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/groups/leave/:groupId', isAuthenticatedAPI, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;
    try {
        await db.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
        res.json({ message: 'Left group' });
    } catch (err) {
        console.error("Leave group error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.get('/api/chat/:groupId', isAuthenticatedAPI, checkGroupRoleAPI(['owner', 'admin', 'member']), async (req, res) => {
  const { groupId } = req.params;
  try {
    const groupResult = await db.query("SELECT * FROM groups WHERE id = $1", [groupId]);
    if (groupResult.rows.length === 0) { return res.status(404).json({ error: "Group not found" }); }
    
    const messages = await db.query( `SELECT m.*, u.username, p.message as parent_message, p_u.username as parent_username FROM messages m JOIN users u ON m.user_id = u.id LEFT JOIN messages p ON m.parent_message_id = p.id LEFT JOIN users p_u ON p.user_id = p_u.id WHERE m.group_id = $1 ORDER BY m.created_at ASC`, [groupId] );
    const reactions = await db.query( `SELECT r.* FROM reactions r JOIN messages m ON r.message_id = m.id WHERE m.group_id = $1`, [groupId] );
    const files = await db.query("SELECT * FROM files WHERE group_id = $1 ORDER BY created_at DESC", [groupId]);
    
    res.json({
      user: req.session.user,
      group: groupResult.rows[0],
      messages: messages.rows,
      files: files.rows,
      reactions: reactions.rows,
      userRole: req.userRole
    });
  } catch (err) {
    console.error("Chat fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// File upload remains largely the same, but redirects to the SPA route
app.post('/chat/:groupId/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  const { groupId } = req.params;
  const filepath = req.file.path;
  const filename = req.file.originalname;
  const mimetype = req.file.mimetype;
  
  try {
    const result = await db.query( "INSERT INTO files (group_id, user_id, filename, filepath, mimetype) VALUES ($1, $2, $3, $4, $5) RETURNING *", [groupId, req.session.user.id, filename, filepath, mimetype] );
    const newFile = { ...result.rows[0], username: req.session.user.username };
    io.to(`group-${groupId}`).emit('newFile', newFile);
    res.redirect('/chat/' + groupId); // The client-side router will handle this
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).send("Server error");
  }
});

// Calendar routes remain the same as they were already API-like
app.get('/chat/:groupId/events', isAuthenticatedAPI, checkGroupRoleAPI(['owner', 'admin', 'member']), async (req, res) => {
    const { groupId } = req.params;
    try {
        const events = await db.query("SELECT e.*, u.username FROM events e JOIN users u ON e.user_id = u.id WHERE e.group_id = $1 ORDER BY e.event_date ASC", [groupId]);
        res.json(events.rows);
    } catch (err) {
        console.error("Fetch events error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/chat/:groupId/events/create', isAuthenticatedAPI, checkGroupRoleAPI(['owner', 'admin', 'member']), async (req, res) => {
    const { groupId } = req.params;
    const { title, description, event_date } = req.body;
    const userId = req.session.user.id;
    try {
        const result = await db.query(
            "INSERT INTO events (group_id, user_id, title, description, event_date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [groupId, userId, title, description, event_date]
        );
        const newEvent = { ...result.rows[0], username: req.session.user.username };
        io.to(`group-${groupId}`).emit('newEvent', newEvent);
        res.status(201).json(newEvent);
    } catch (err) {
        console.error("Create event error:", err);
        res.status(500).json({ error: "Server error" });
    }
});


// SOCKET.IO (remains the same)
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

  socket.on('chatMessage', async ({ room, userId, username, message, parentId, isCodeSnippet, language }) => {
    try {
      const result = await db.query( "INSERT INTO messages (group_id, user_id, message, parent_message_id, is_code_snippet, language) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at", [room.replace('group-', ''), userId, message, parentId, isCodeSnippet, language] );
      let parentData = { parent_message: null, parent_username: null };
      if (parentId) {
          const parentResult = await db.query(`SELECT m.message, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1`, [parentId]);
          if(parentResult.rows.length > 0) {
              parentData.parent_message = parentResult.rows[0].message;
              parentData.parent_username = parentResult.rows[0].username;
          }
      }
      const newMsg = { id: result.rows[0].id, message: message, user_id: userId, username, created_at: result.rows[0].created_at, parent_message_id: parentId, is_code_snippet: isCodeSnippet, language, ...parentData };
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

  socket.on('deleteMessage', async ({ room, messageId }) => {
    const groupId = room.replace('group-', '');
    try {
      const messageResult = await db.query("SELECT user_id FROM messages WHERE id = $1", [messageId]);
      if (messageResult.rows.length === 0) return;
      const messageAuthorId = messageResult.rows[0].user_id;
      const memberResult = await db.query("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
      if (memberResult.rows.length === 0) return;
      const userRole = memberResult.rows[0].role;
      if (userId == messageAuthorId || ['owner', 'admin'].includes(userRole)) {
        await db.query("DELETE FROM messages WHERE id = $1", [messageId]);
        io.to(room).emit('messageDeleted', messageId);
      }
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  socket.on('deleteFile', async ({ room, fileId, filepath }) => {
    const groupId = room.replace('group-', '');
    try {
        const fileResult = await db.query("SELECT user_id FROM files WHERE id = $1", [fileId]);
        if (fileResult.rows.length === 0) return;
        const fileAuthorId = fileResult.rows[0].user_id;
        const memberResult = await db.query("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
        if (memberResult.rows.length === 0) return;
        const userRole = memberResult.rows[0].role;
        if (userId == fileAuthorId || ['owner', 'admin'].includes(userRole)) {
            const publicId = filepath.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(publicId);
            await db.query("DELETE FROM files WHERE id = $1", [fileId]);
            io.to(room).emit('fileDeleted', { fileId, filepath });
        }
    } catch (err) {
        console.error("Delete file error:", err);
    }
  });

  socket.on('deleteEvent', async ({ room, eventId }) => {
      const groupId = room.replace('group-', '');
      try {
          const eventResult = await db.query("SELECT user_id FROM events WHERE id = $1", [eventId]);
          if (eventResult.rows.length === 0) return;
          const eventAuthorId = eventResult.rows[0].user_id;
          const memberResult = await db.query("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
          if (memberResult.rows.length === 0) return;
          const userRole = memberResult.rows[0].role;
          if (userId == eventAuthorId || ['owner', 'admin'].includes(userRole)) {
              await db.query("DELETE FROM events WHERE id = $1", [eventId]);
              io.to(room).emit('eventDeleted', eventId);
          }
      } catch (err) {
          console.error("Delete event error:", err);
      }
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


// --- NEW: CATCH-ALL ROUTE FOR SPA ---
// This should be the last route. It serves the main app shell.
app.get('*', (req, res) => {
    res.render('index'); // We will create this new file
});


server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

