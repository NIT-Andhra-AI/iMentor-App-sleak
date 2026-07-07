const mongoose = require('mongoose');

const ragDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  fileId: { type: String, required: true }, // uuid
  text: { type: String, required: true },
  markdownDoc: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('RagDocument', ragDocumentSchema);
