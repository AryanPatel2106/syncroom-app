const mongoose = require('mongoose');

const collabDocSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  // The document's unique identifier for Yjs
  docId: {
    type: String,
    required: true,
    unique: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('CollabDoc', collabDocSchema);
