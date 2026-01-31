import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import botRoutes from './routes/bots.js';
import chatRoutes from './routes/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Serve static files from public
app.use(express.static('../public'));

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'MoltRack Backend',
    version: '0.1.0',
    status: 'running',
    endpoints: {
      health: '/health',
      agents: '/api/agents',
      chat: '/api/chat',
      billing: '/api/billing'
    }
  });
});

// Routes
app.use('/api/bots', botRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`MoltRack Backend running on port ${PORT}`);
});
