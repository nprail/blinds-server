import { Router } from 'express';
import {
  listChannels,
  getChannel,
  sendCommand,
  sendUp,
  sendDown,
  sendStop,
  sendPair,
  sendAll,
  learnChannel,
} from '../controllers/blindsController.js';

const router = Router();

// ── Static / bulk routes (must come before :id routes) ───────────────────────
router.post('/learn', learnChannel);
router.post('/all/:action', sendAll);

// ── Channel listing ───────────────────────────────────────────────────────────
router.get('/', listChannels);
router.get('/:id', getChannel);

// ── Generic command (body-driven) ─────────────────────────────────────────────
router.post('/:id/commands', sendCommand);

// ── Shorthand per-channel routes ──────────────────────────────────────────────
router.post('/:id/up', sendUp);
router.post('/:id/down', sendDown);
router.post('/:id/stop', sendStop);
router.post('/:id/pair', sendPair);

export default router;
