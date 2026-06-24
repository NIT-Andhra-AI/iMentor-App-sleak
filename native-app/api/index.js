require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const ragRoutes = require('./routes/ragRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/rag', ragRoutes);

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/imentor').then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Listen on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Accessible on emulator via http://10.0.2.2:${PORT}`);
  console.log(`Accessible on ADB physical device via http://localhost:${PORT} (requires adb reverse tcp:${PORT} tcp:${PORT})`);
});
