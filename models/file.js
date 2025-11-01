const { Schema, model } = require('mongoose');

const FileSchema = new Schema({
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    filename: { type: String, required: true },
    filepath: { type: String, required: true },
    cloudinaryPublicId: { type: String }, // For Cloudinary deletion
    mimetype: { type: String, required: true },
    fileSize: { type: Number }, // File size in bytes
}, { timestamps: true });

module.exports = model('File', FileSchema);