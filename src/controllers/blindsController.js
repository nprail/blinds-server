import {
  getAllChannels,
  getChannelById,
  setChannelState,
  learnCode,
} from '../services/blindsService.js';
import { transmit, capture, VALID_COMMANDS } from '../services/rfService.js';

// ── Individual channel helpers ────────────────────────────────────────────────

/**
 * GET /api/blinds
 * Returns all configured channels with their current state.
 */
export async function listChannels(req, res) {
  const channels = getAllChannels();
  res.json({ success: true, data: channels });
}

/**
 * GET /api/blinds/:id
 * Returns one channel.
 */
export async function getChannel(req, res) {
  const channel = getChannelById(req.params.id);
  res.json({ success: true, data: channel });
}

// ── Command helpers ───────────────────────────────────────────────────────────

/**
 * POST /api/blinds/:id/commands
 * Body: { "action": "up" | "down" | "stop" | "pair" }
 *
 * Sends a single RF command to the specified channel.
 */
export async function sendCommand(req, res) {
  const { action } = req.body ?? {};

  if (!action || !VALID_COMMANDS.includes(action)) {
    return res.status(400).json({
      success: false,
      error: `"action" must be one of: ${VALID_COMMANDS.join(', ')}`,
    });
  }

  const channel = getChannelById(req.params.id);
  await transmit(channel, action);
  setChannelState(channel.id, action);

  res.json({
    success: true,
    data: { channelId: channel.id, action, state: action },
  });
}

// ── Convenience shorthand routes ─────────────────────────────────────────────

/** POST /api/blinds/:id/up */
export async function sendUp(req, res) {
  await handleShorthand(req, res, 'up');
}

/** POST /api/blinds/:id/down */
export async function sendDown(req, res) {
  await handleShorthand(req, res, 'down');
}

/** POST /api/blinds/:id/stop */
export async function sendStop(req, res) {
  await handleShorthand(req, res, 'stop');
}

/** POST /api/blinds/:id/pair */
export async function sendPair(req, res) {
  await handleShorthand(req, res, 'pair');
}

async function handleShorthand(req, res, action) {
  const channel = getChannelById(req.params.id);
  await transmit(channel, action);
  setChannelState(channel.id, action);
  res.json({
    success: true,
    data: { channelId: channel.id, action, state: action },
  });
}

// ── Bulk (all-channel) actions ────────────────────────────────────────────────

/**
 * POST /api/blinds/all/up
 * POST /api/blinds/all/down
 * POST /api/blinds/all/stop
 *
 * Transmits the same command to every enabled channel sequentially.
 * Returns a per-channel result array.
 */
export async function sendAll(req, res) {
  const { action } = req.params;

  if (!VALID_COMMANDS.includes(action)) {
    return res.status(400).json({
      success: false,
      error: `"action" must be one of: ${VALID_COMMANDS.join(', ')}`,
    });
  }

  const channels = getAllChannels().filter((ch) => ch.enabled !== false);
  const results = [];

  for (const channel of channels) {
    try {
      await transmit(channel, action);
      setChannelState(channel.id, action);
      results.push({ channelId: channel.id, success: true });
    } catch (err) {
      results.push({ channelId: channel.id, success: false, error: err.message });
    }
  }

  const allOk = results.every((r) => r.success);
  res.status(allOk ? 200 : 207).json({ success: allOk, data: results });
}

// ── Learn / capture ───────────────────────────────────────────────────────────

/**
 * POST /api/learn
 * Body: { "channelId": 1, "command": "up", "timeoutSec": 10 }
 *
 * Puts the SX1278 into receive mode for `timeoutSec` seconds.
 * The first valid RF frame captured is stored as the code for the given
 * channel + command and persisted to config/blinds.json.
 */
export async function learnChannel(req, res) {
  const { channelId, command, timeoutSec = 10 } = req.body ?? {};

  if (!channelId) {
    return res.status(400).json({ success: false, error: '"channelId" is required' });
  }
  if (!command || !VALID_COMMANDS.includes(command)) {
    return res.status(400).json({
      success: false,
      error: `"command" must be one of: ${VALID_COMMANDS.join(', ')}`,
    });
  }
  if (typeof timeoutSec !== 'number' || timeoutSec < 1 || timeoutSec > 60) {
    return res.status(400).json({
      success: false,
      error: '"timeoutSec" must be a number between 1 and 60',
    });
  }

  // Verify the channel exists before starting a potentially long capture
  getChannelById(channelId);

  const code = await capture(timeoutSec);
  learnCode(channelId, command, code);

  res.json({
    success: true,
    data: { channelId: Number(channelId), command, code },
  });
}
