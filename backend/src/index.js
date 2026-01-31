import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { initializeDatabase } from './db/index.js';
import botRoutes from './routes/bots.js';
import chatRoutes from './routes/chat.js';
import agentRoutes from './routes/agents.js';
import billingRoutes from './routes/billing.js';
import authRoutes from './routes/auth.js';
import { autoApprovalService } from './services/autoApprovalService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

if (isProduction) {
  app.use(express.static(path.join(__dirname, '../../dist')));
}

app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/billing', billingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

if (isProduction) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
}

async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MoltRack Backend running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
