const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  groqApiKey: { type: String, default: null } // Stores encrypted AES-256 string
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
