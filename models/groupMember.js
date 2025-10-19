const { Schema, model } = require('mongoose');

const GroupMemberSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner','admin','member'], default: 'member' },
}, { timestamps: true });

module.exports = model('GroupMember', GroupMemberSchema);