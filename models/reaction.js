const { Schema, model } = require('mongoose');

const ReactionSchema = new Schema({
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
}, { timestamps: true });

module.exports = model('Reaction', ReactionSchema);