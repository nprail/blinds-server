import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
// Relax CSP to allow Tailwind CDN for the web UI (React is served locally from /vendor)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", 'https://cdn.tailwindcss.com'],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
        imgSrc:      ["'self'", 'data:'],
        connectSrc:  ["'self'"],
        fontSrc:     ["'self'"],
      },
    },
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors());

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`→ ${req.method} ${req.path}`);
  next();
});

// ── Static web UI ─────────────────────────────────────────────────────────────
app.use(express.static(resolve(__dirname, '../public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── API 404 handler ───────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
