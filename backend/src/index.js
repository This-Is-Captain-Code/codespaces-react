import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import botRoutes from './routes/bots.js';
import chatRoutes from './routes/chat.js';
import agentRoutes from './routes/agents.js';
import billingRoutes from './routes/billing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// In production, serve the built frontend
if (isProduction) {
  app.use(express.static(path.join(__dirname, '../../dist')));
}

// Routes
app.use('/api/bots', botRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/billing', billingRoutes);

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

// In production, serve frontend for all non-API routes
if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MoltRack Backend running on port ${PORT}`);
});
