require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');

const User = require('./models/user');
const Group = require('./models/group');
const GroupMember = require('./models/groupMember');
const Message = require('./models/message');
const File = require('./models/file');
const Reaction = require('./models/reaction');
const Event = require('./models/event');
const CollabDoc = require('./models/collabDoc');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 5000;
const saltRounds = 10;

console.log('Attempting to connect to MongoDB. URI:', process.env.MONGODB_URI); // Debugging line

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

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

const sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
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

const checkGroupRole = (roles) => async (req, res, next) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;
    try {
        const member = await GroupMember.findOne({ groupId, userId });
        if (member && roles.includes(member.role)) {
            req.userRole = member.role;
            next();
        } else {
            res.status(403).send("You do not have permission for this group.");
        }
    } catch (err) {
        console.error("Role check error:", err);
        res.status(500).send("Server error");
    }
};

app.get('/', (req, res) => res.render('home', { user: req.session.user }));
app.get('/login', (req, res) => res.render('login', { user: req.session.user }));
app.get('/register', (req, res) => res.render('register', { user: req.session.user }));

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const user = await User.create({ username, email, password: hash });
    req.session.user = { id: user._id, username: user.username };
    res.redirect('/groups');
  } catch (err) {
    console.error("Registration error:", err);
    res.redirect('/register');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user) {
      if (await bcrypt.compare(password, user.password)) {
        req.session.user = { id: user._id, username: user.username };
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
    const groupMemberships = await GroupMember.find({ userId: req.session.user.id }).populate('groupId');
    const groups = groupMemberships
      .filter(gm => gm.groupId) // Filter out memberships where the group might have been deleted
      .map(gm => {
        const group = gm.groupId.toObject();
        group.id = group._id.toString();
        group.role = gm.role;
        return group;
      });
    res.render('groups', { user: req.session.user, groups: groups });
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
        const group = await Group.create({ name, key: hash });
        await GroupMember.create({ groupId: group._id, userId, role: 'owner' });
        res.redirect('/groups');
    } catch (err) {
        console.error("Group creation error:", err);
        res.status(500).send("Server error");
    }
});

app.post('/groups/join', isAuthenticated, async (req, res) => {
  const { name, key } = req.body;
  try {
    const group = await Group.findOne({ name });
    if (group) {
      if (await bcrypt.compare(key, group.key)) {
        await GroupMember.findOneAndUpdate(
            { groupId: group._id, userId: req.session.user.id },
            { groupId: group._id, userId: req.session.user.id, role: 'member' },
            { upsert: true }
        );
        res.redirect('/groups');
      } else { res.send("Incorrect key"); }
    } else { res.send("Group not found"); }
  } catch (err) {
    console.error("Group join error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/groups/leave/:groupId', isAuthenticated, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.session.user.id;
    try {
        await GroupMember.deleteOne({ groupId, userId });
        res.redirect('/groups');
    } catch (err) {
        console.error("Leave group error:", err);
        res.status(500).send("Server error");
    }
});

app.post('/collab/:groupId/create', isAuthenticated, checkGroupRole(['owner', 'admin', 'member']), upload.single('docFile'), async (req, res) => {
    const { groupId } = req.params;
    const docName = req.file.originalname;
    const content = req.file.buffer.toString('utf-8');

    try {
        const newDoc = await CollabDoc.create({
            name: docName,
            groupId,
            content
        });

        // Post a message to the chat about the new session
        const message = `Started a new collaborative document: <a href="/collab/${newDoc._id}" class="text-blue-400 hover:underline">${newDoc.name}</a>`;
        const msg = await Message.create({
            groupId,
            userId: req.session.user.id,
            message,
            isCodeSnippet: false
        });
        
        const newMsg = { 
            id: msg._id, 
            message: msg.message, 
            user_id: req.session.user.id, 
            username: req.session.user.username, 
            created_at: msg.createdAt,
            is_code_snippet: false
        };
        io.to(`group-${groupId}`).emit('chatMessage', newMsg);

        res.redirect(`/chat/${groupId}`);
    } catch (err) {
        console.error("Collab doc creation error:", err);
        res.status(500).send("Server error");
    }
});

app.get('/collab/:docId', isAuthenticated, async (req, res) => {
    try {
        const doc = await CollabDoc.findById(req.params.docId);
        if (!doc) {
            return res.status(404).send('Document not found');
        }
        // Check if user is a member of the group associated with the doc
        const member = await GroupMember.findOne({ groupId: doc.groupId, userId: req.session.user.id });
        if (!member) {
            return res.status(403).send('You do not have access to this document.');
        }
        res.render('collab', { 
            user: req.session.user, 
            doc,
            wsUrl: process.env.YJS_WEBSOCKET_URL || 'ws://localhost:1234' 
        });
    } catch (err) {
        console.error("Collab doc fetch error:", err);
        res.status(500).send("Server error");
    }
});

app.get('/chat/:groupId', isAuthenticated, checkGroupRole(['owner', 'admin', 'member']), async (req, res) => {
  const { groupId } = req.params;
  try {
    const group = await Group.findById(groupId);
    if (!group) { return res.status(404).send("Group not found"); }
    
    const messages = await Message.find({ groupId }).populate('userId', 'username').populate('parentId', 'message userId');
    const reactions = await Reaction.find({ messageId: { $in: messages.map(m => m._id) } });
    const files = await File.find({ groupId }).populate('userId', 'username').sort({ createdAt: -1 });
    
    const populatedMessages = messages.map(m => {
        const parent = m.parentId;
        return {
            ...m._doc,
            username: m.userId.username,
            parent_message: parent ? parent.message : null,
            parent_username: parent ? parent.userId.username : null,
        }
    })

    res.render('chat', {
      user: req.session.user,
      group: group,
      messages: populatedMessages,
      files: files,
      reactions: reactions,
      userRole: req.userRole
    });
  } catch (err) {
    console.error("Chat fetch error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/chat/:groupId/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  const { groupId } = req.params;
  const filepath = req.file.path;
  const filename = req.file.originalname;
  const mimetype = req.file.mimetype;
  
  try {
    const file = await File.create({ groupId, userId: req.session.user.id, filename, filepath, mimetype });
    const newFile = { ...file._doc, username: req.session.user.username };
    io.to(`group-${groupId}`).emit('newFile', newFile);
    res.redirect('/chat/' + groupId);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).send("Server error");
  }
});

app.get('/chat/:groupId/manage', isAuthenticated, checkGroupRole(['owner', 'admin']), async (req, res) => {
    const { groupId } = req.params;
    try {
        const members = await GroupMember.find({ groupId }).populate('userId', 'username');
        const group = await Group.findById(groupId);
        const transformedMembers = members.map(m => ({ id: m.userId._id, username: m.userId.username, role: m.role }));
        res.render('manage_group', { user: { ...req.session.user, role: req.userRole }, members: transformedMembers, group: group, groupId: groupId });
    } catch (err) {
        console.error("Manage group error:", err);
        res.status(500).send("Server error");
    }
});

app.post('/chat/:groupId/manage/kick', isAuthenticated, checkGroupRole(['owner', 'admin']), async (req, res) => {
    const { groupId } = req.params;
    const { userIdToKick } = req.body;
    try {
        await GroupMember.deleteOne({ groupId, userId: userIdToKick, role: { $ne: 'owner' } });
        res.redirect(`/chat/${groupId}/manage`);
    } catch (err) { console.error("Kick user error:", err); res.status(500).send("Server error"); }
});

app.post('/chat/:groupId/manage/promote', isAuthenticated, checkGroupRole(['owner']), async (req, res) => {
    const { groupId } = req.params;
    const { userIdToPromote } = req.body;
    try {
        await GroupMember.updateOne({ groupId, userId: userIdToPromote, role: 'member' }, { role: 'admin' });
        res.redirect(`/chat/${groupId}/manage`);
    } catch (err) { console.error("Promote user error:", err); res.status(500).send("Server error"); }
});

// --- NEW: CALENDAR EVENT ROUTES ---
app.get('/chat/:groupId/events', isAuthenticated, checkGroupRole(['owner', 'admin', 'member']), async (req, res) => {
    const { groupId } = req.params;
    try {
        const events = await Event.find({ groupId }).populate('userId', 'username').sort({ event_date: 'asc' });
        res.json(events);
    } catch (err) {
        console.error("Fetch events error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/chat/:groupId/events/create', isAuthenticated, checkGroupRole(['owner', 'admin', 'member']), async (req, res) => {
    const { groupId } = req.params;
    const { title, description, event_date } = req.body;
    const userId = req.session.user.id;
    try {
        const event = await Event.create({ groupId, userId, title, description, event_date });
        const newEvent = { ...event._doc, username: req.session.user.username };
        io.to(`group-${groupId}`).emit('newEvent', newEvent);
        res.status(201).json(newEvent);
    } catch (err) {
        console.error("Create event error:", err);
        res.status(500).json({ error: "Server error" });
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

  socket.on('chatMessage', async ({ room, userId, username, message, parentId, isCodeSnippet, language }) => {
    try {
      const groupId = room.replace('group-', '');
      const msg = await Message.create({ groupId, userId, message, parentId, isCodeSnippet, language });
      
      let parentData = { parent_message: null, parent_username: null };
      if (parentId) {
          const parentResult = await Message.findById(parentId).populate('userId', 'username');
          if(parentResult) {
              parentData.parent_message = parentResult.message;
              parentData.parent_username = parentResult.userId.username;
          }
      }
      const newMsg = { id: msg._id, message: msg.message, user_id: userId, username, created_at: msg.createdAt, parent_message_id: parentId, is_code_snippet: isCodeSnippet, language, ...parentData };
      io.to(room).emit('chatMessage', newMsg);
    } catch (err) { console.error("Socket chat message error:", err); }
  });

  socket.on('typing', ({ room, username }) => {
    socket.to(room).emit('typing', { username });
  });

  socket.on('addReaction', async ({ messageId, userId, emoji }) => {
    try {
        await Reaction.findOneAndUpdate(
            { messageId, userId, emoji },
            { messageId, userId, emoji },
            { upsert: true }
        );
        const message = await Message.findById(messageId);
        if (message) {
            const room = `group-${message.groupId}`;
            io.to(room).emit('reactionAdded', { messageId, userId, emoji });
        }
    } catch (err) { console.error("Add reaction error:", err); }
  });

  socket.on('deleteMessage', async ({ room, messageId }) => {
    const groupId = room.replace('group-', '');
    try {
      const message = await Message.findById(messageId);
      if (!message) return;
      const messageAuthorId = message.userId;
      const member = await GroupMember.findOne({ groupId, userId });
      if (!member) return;
      const userRole = member.role;
      if (userId == messageAuthorId || ['owner', 'admin'].includes(userRole)) {
        await Message.deleteOne({ _id: messageId });
        io.to(room).emit('messageDeleted', messageId);
      }
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  socket.on('deleteFile', async ({ room, fileId, filepath }) => {
    const groupId = room.replace('group-', '');
    try {
        const file = await File.findById(fileId);
        if (!file) return;
        const fileAuthorId = file.userId;
        const member = await GroupMember.findOne({ groupId, userId });
        if (!member) return;
        const userRole = member.role;
        if (userId == fileAuthorId || ['owner', 'admin'].includes(userRole)) {
            const publicId = filepath.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(publicId);
            await File.deleteOne({ _id: fileId });
            io.to(room).emit('fileDeleted', { fileId, filepath });
        }
    } catch (err) {
        console.error("Delete file error:", err);
    }
  });

  // --- NEW: SOCKET EVENT FOR DELETING A CALENDAR EVENT ---
  socket.on('deleteEvent', async ({ room, eventId }) => {
      const groupId = room.replace('group-', '');
      try {
          const event = await Event.findById(eventId);
          if (!event) return;

          const eventAuthorId = event.userId;
          const member = await GroupMember.findOne({ groupId, userId });
          if (!member) return;
          const userRole = member.role;

          if (userId == eventAuthorId || ['owner', 'admin'].includes(userRole)) {
              await Event.deleteOne({ _id: eventId });
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

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
