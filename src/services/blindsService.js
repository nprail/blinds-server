import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../config/blinds.json');

/**
 * In-memory map of channel id → channel object.
 * Kept in sync with config/blinds.json.
 */
let channelMap = new Map();

/** In-memory map of channel id → last known state string */
const stateMap = new Map();

function buildChannelMap(channels) {
  const m = new Map();
  for (const ch of channels) {
    m.set(ch.id, { ...ch });
  }
  return m;
}

// Initialise from loaded config
channelMap = buildChannelMap(config.blinds.channels ?? []);

/**
 * Return all configured channels as an array, enriched with current state.
 * @returns {object[]}
 */
export function getAllChannels() {
  return [...channelMap.values()].map((ch) => ({
    ...ch,
    state: stateMap.get(ch.id) ?? 'unknown',
  }));
}

/**
 * Return a single channel by id, enriched with current state.
 * @param {number|string} id
 * @returns {object}
 * @throws {Error} with status 404 if not found
 */
export function getChannelById(id) {
  const numId = Number(id);
  const ch = channelMap.get(numId);
  if (!ch) {
    const err = new Error(`Channel ${id} not found`);
    err.status = 404;
    throw err;
  }
  return { ...ch, state: stateMap.get(numId) ?? 'unknown' };
}

/**
 * Update the in-memory state for a channel after a command is sent.
 * @param {number} id
 * @param {string} state  up | down | stop | pair
 */
export function setChannelState(id, state) {
  stateMap.set(Number(id), state);
}

/**
 * Update the RF code for a specific channel and command, and persist to disk.
 * Used by the learn/capture endpoint.
 *
 * @param {number|string} channelId
 * @param {string}        command    up | down | stop | pair
 * @param {string}        code       hex/binary string captured from the remote
 */
export function learnCode(channelId, command, code) {
  const numId = Number(channelId);
  const ch = channelMap.get(numId);
  if (!ch) {
    const err = new Error(`Channel ${channelId} not found`);
    err.status = 404;
    throw err;
  }

  ch.codes = ch.codes ?? {};
  ch.codes[command] = code;
  channelMap.set(numId, ch);

  persistConfig();
  logger.info(`Learned code for channel ${numId} command "${command}"`);
}

/**
 * Write the current channelMap back to config/blinds.json so codes
 * learned at runtime survive a restart.
 */
function persistConfig() {
  const channels = [...channelMap.values()];
  const data = JSON.stringify({ channels }, null, 2);
  try {
    writeFileSync(CONFIG_PATH, data, 'utf8');
  } catch (err) {
    logger.error('Failed to persist blinds config: ' + err.message);
  }
}
