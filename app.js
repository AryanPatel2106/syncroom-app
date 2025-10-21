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

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// --- Redis Adapter Setup for Scaling ---
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO Redis adapter connected.");
}).catch((err) => {
    console.error("Failed to connect Redis clients for Socket.IO adapter:", err);
});
// -----------------------------------------

// Yjs WebSocket server setup

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

const upload = multer({ storage: multer.memoryStorage() });

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
  
  try {
    // Upload to Cloudinary manually
    const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'syncroom_uploads', resource_type: 'auto' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(req.file.buffer);
    });

    const { originalname, mimetype } = req.file;
    const file = await File.create({ 
        groupId, 
        userId: req.session.user.id, 
        filename: originalname, 
        filepath: result.secure_url, 
        mimetype 
    });

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

app.post('/chat/:groupId/manage/demote', isAuthenticated, checkGroupRole(['owner']), async (req, res) => {
    const { groupId } = req.params;
    const { userIdToDemote } = req.body;
    try {
        await GroupMember.updateOne({ groupId, userId: userIdToDemote, role: 'admin' }, { role: 'member' });
        res.redirect(`/chat/${groupId}/manage`);
    } catch (err) { console.error("Demote user error:", err); res.status(500).send("Server error"); }
});

app.post('/chat/:groupId/delete', isAuthenticated, checkGroupRole(['owner']), async (req, res) => {
    const { groupId } = req.params;
    try {
        // This is a simplified deletion. In a real app, you'd want to handle this more carefully,
        // maybe archiving instead of deleting, and cleaning up all associated data.
        await Message.deleteMany({ groupId });
        await File.deleteMany({ groupId }); // You'd also delete from Cloudinary here
        await Event.deleteMany({ groupId });
        await GroupMember.deleteMany({ groupId });
        await Group.deleteOne({ _id: groupId });
        res.redirect('/groups');
    } catch (err) {
        console.error("Delete group error:", err);
        res.status(500).send("Server error");
    }
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
const activeUsers = {}; // In-memory store for active users per group

io.on('connection', (socket) => {
  let currentGroupId = null;
  let currentUserId = null;
  let currentUsername = null;

  socket.on('joinGroup', async ({ groupId, userId, username }) => {
    currentGroupId = groupId;
    currentUserId = userId;
    currentUsername = username;
    
    socket.join(groupId);

    if (!activeUsers[groupId]) {
      activeUsers[groupId] = new Map();
    }
    activeUsers[groupId].set(userId, username);

    io.to(groupId).emit('userList', Array.from(activeUsers[groupId].values()).map(name => ({ username: name })));
  });

  socket.on('chatMessage', async (data) => {
    if (!currentGroupId) return;

    try {
      const { message, parentMessageId, isCodeSnippet, language, priority = 'medium' } = data; // Default priority
      
      // --- QoS: Simple Priority Handling ---
      // In a real-world scenario, you might use separate queues or processing logic.
      // Here, we'll just log it and could add logic to delay low-priority messages under load.
      console.log(`Processing message with priority: ${priority}`);
      // ------------------------------------

      const msg = await Message.create({ 
        groupId: currentGroupId, 
        userId: currentUserId, 
        message, 
        parentId: parentMessageId,
        isCodeSnippet: isCodeSnippet || false,
        language: language || 'plaintext'
      });

      const populatedMessage = await Message.findById(msg._id)
        .populate('userId', 'username')
        .populate({
            path: 'parentId',
            populate: { path: 'userId', select: 'username' }
        });

      const result = {
        ...populatedMessage.toObject(),
        id: populatedMessage._id,
        username: populatedMessage.userId.username,
        user_id: populatedMessage.userId._id,
        parent_message: populatedMessage.parentId ? populatedMessage.parentId.message : null,
        parent_username: populatedMessage.parentId ? populatedMessage.parentId.userId.username : null,
      };

      io.to(currentGroupId).emit('chatMessage', { message: result });
    } catch (err) { 
      console.error("Socket chat message error:", err); 
    }
  });

  // --- Call Initiation ---
  socket.on('start-call', (data) => {
    // The user who started the call should not receive the notification
    // We emit to the general group chat room (data.groupId)
    socket.to(data.groupId).emit('call-started', { 
        from: socket.id, 
        username: data.username 
    });
  });

  // --- WebRTC Group Call Signaling ---
  socket.on('join-call', (data) => {
    const room = data.room;
    const otherUsers = [];
    const clients = io.sockets.adapter.rooms.get(room);
    if (clients) {
      for (const clientId of clients) {
        if (clientId !== socket.id) {
          otherUsers.push(clientId);
        }
      }
    }
    
    // Notify existing users about the new peer.
    socket.to(room).emit('new-peer', { peerId: socket.id });

    socket.join(room);
    
    // Send the list of existing peers to the new joiner
    socket.emit('existing-peers', otherUsers);
  });

  socket.on('webrtc-offer', (data) => {
    socket.to(data.to).emit('webrtc-offer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('webrtc-answer', (data) => {
    socket.to(data.to).emit('webrtc-answer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    socket.to(data.to).emit('webrtc-ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('leave-call', (room) => {
    socket.leave(room);
    socket.to(room).emit('peer-disconnected', socket.id);
  });
  // -----------------------------------------

  socket.on('typing', ({ isTyping }) => {
    if (currentGroupId) {
      socket.to(currentGroupId).emit('typing', { 
        userId: currentUserId, 
        username: currentUsername, 
        isTyping 
      });
    }
  });

  socket.on('deleteMessage', async ({ messageId }) => {
    if (!currentGroupId || !mongoose.Types.ObjectId.isValid(messageId)) {
        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            console.error("Invalid ObjectId received for message deletion:", messageId);
        }
        return;
    }
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      const member = await GroupMember.findOne({ groupId: currentGroupId, userId: currentUserId });
      if (!member) return;

      if (message.userId.toString() === currentUserId || ['owner', 'admin'].includes(member.role)) {
        await Message.deleteOne({ _id: messageId });
        io.to(currentGroupId).emit('messageDeleted', messageId);
      }
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  socket.on('disconnect', () => {
    if (currentGroupId && currentUserId) {
      if (activeUsers[currentGroupId]) {
        activeUsers[currentGroupId].delete(currentUserId);
        io.to(currentGroupId).emit('userList', Array.from(activeUsers[currentGroupId].values()).map(name => ({ username: name })));
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
