const { Schema, model } = require('mongoose');

const EventSchema = new Schema({
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: String,
    event_date: { type: Date, required: true },
}, { timestamps: true });

module.exports = model('Event', EventSchema);