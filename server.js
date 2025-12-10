require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const runWorkflowRouter = require('./api/run-workflow');
const checkStatusRouter = require('./api/check-status');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// API routes
app.use('/api/run-workflow', runWorkflowRouter);
app.use('/api/check-status', checkStatusRouter);

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


