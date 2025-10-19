const { Schema, model } = require('mongoose');

const GroupSchema = new Schema({
  name: { type: String, required: true },
  key: { type: String, required: true }, // hashed
}, { timestamps: true });

module.exports = model('Group', GroupSchema);