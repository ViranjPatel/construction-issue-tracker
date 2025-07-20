const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const WebSocket = require('ws');

const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const projectRoutes = require('./routes/projects');
const fileRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');

const app = express();
const server = createServer(app);

// WebSocket for real-time updates
const wss = new WebSocket.Server({ server });

// Security & optimization middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // 100 requests per window
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static('uploads'));
app.use('/', express.static('public'));

// Health check (moved to admin routes for more detailed status)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Construction Issue Tracker API',
    version: '1.0.0',
    description: 'Ultra-lightweight construction project issue management system',
    endpoints: {
      auth: '/api/auth/*',
      issues: '/api/issues/*',
      projects: '/api/projects/*',
      files: '/api/files/*',
      admin: '/api/admin/* (admin only)'
    },
    docs: 'https://github.com/ViranjPatel/construction-issue-tracker',
    health: '/health',
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Handle real-time subscriptions
      if (data.type === 'subscribe' && data.projectId) {
        ws.projectId = data.projectId;
        ws.send(JSON.stringify({ type: 'subscribed', projectId: data.projectId }));
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Broadcast function for real-time updates
global.broadcast = (projectId, data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.projectId === projectId) {
      client.send(JSON.stringify(data));
    }
  });
};

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Construction Issue Tracker running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 API docs: http://localhost:${PORT}/api`);
  console.log(`🎨 Web interface: http://localhost:${PORT}`);
});