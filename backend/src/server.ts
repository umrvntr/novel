/**
 * EPIC 2: Backend Server with Dialogue Endpoint
 * EPIC 4: LLM Integration (optional)
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dialogueRouter } from './routes/dialogue.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/dialogue', dialogueRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    llmEnabled: process.env.LLM_ENABLED === 'true'
  });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`✓ Backend server running on http://${HOST}:${PORT}`);
  console.log(`✓ LLM Integration: ${process.env.LLM_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
  if (process.env.LLM_ENABLED === 'true') {
    console.log(`✓ LLM Endpoint: ${process.env.LLM_ENDPOINT}`);
    console.log(`✓ LLM Model: ${process.env.LLM_MODEL}`);
  }
});
