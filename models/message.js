const { Schema, model } = require('mongoose');

const MessageSchema = new Schema({
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Message' },
    isCodeSnippet: { type: Boolean, default: false },
    language: String,
}, { timestamps: true });

module.exports = model('Message', MessageSchema);