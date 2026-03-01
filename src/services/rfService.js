import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** Commands the API layer understands */
export const VALID_COMMANDS = ['up', 'down', 'stop', 'pair'];

/**
 * Transmit an RF command for a given channel.
 *
 * Invokes the Python RF transmit script and passes all required parameters
 * as a JSON payload via the `--payload` argument so that no shell escaping
 * is needed (child_process.execFile never invokes a shell).
 *
 * @param {object} channel  The channel config object from blindsService
 * @param {string} command  up | down | stop | pair
 * @returns {Promise<void>}
 */
export async function transmit(channel, command) {
  const code = channel.codes?.[command];

  if (!code || code.startsWith('REPLACE_WITH')) {
    const err = new Error(
      `No RF code configured for channel ${channel.id} command "${command}". ` +
        'Use the /api/learn endpoint or edit config/blinds.json to add codes.'
    );
    err.status = 422;
    throw err;
  }

  const payload = JSON.stringify({
    frequency: config.rf.frequencyHz,
    code,
    protocol: channel.protocol ?? {},
    repeat: config.rf.repeatCount,
    spiBus: config.sx1278.spiBus,
    spiDevice: config.sx1278.spiDevice,
    resetPin: config.sx1278.resetPin,
  });

  logger.info(
    `Transmitting channel=${channel.id} command=${command} code=${code}`
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      config.rf.pythonPath,
      [config.rf.scriptPath, '--payload', payload],
      { timeout: 15_000 }
    );

    if (stdout) logger.debug('rf_transmit stdout: ' + stdout.trim());
    if (stderr) logger.warn('rf_transmit stderr: ' + stderr.trim());
  } catch (err) {
    logger.error('RF transmission failed: ' + err.message);
    const txErr = new Error('RF transmission failed: ' + err.message);
    txErr.status = 502;
    throw txErr;
  }
}

/**
 * Start a short receive window (default 10 s) to capture an RF code from the
 * physical remote.  Returns the captured code string.
 *
 * @param {number} [timeoutSec=10]
 * @returns {Promise<string>}
 */
export async function capture(timeoutSec = 10) {
  logger.info(`Starting RF capture window (${timeoutSec}s)…`);

  try {
    const { stdout } = await execFileAsync(
      config.rf.pythonPath,
      [
        config.rf.receiveScriptPath,
        '--timeout',
        String(timeoutSec),
        '--frequency',
        String(config.rf.frequencyHz),
        '--spi-bus',
        String(config.sx1278.spiBus),
        '--spi-device',
        String(config.sx1278.spiDevice),
        '--reset-pin',
        String(config.sx1278.resetPin),
      ],
      { timeout: (timeoutSec + 5) * 1_000 }
    );

    const captured = stdout.trim();
    if (!captured) {
      const err = new Error('No RF signal captured within the timeout window');
      err.status = 408;
      throw err;
    }

    logger.info('RF capture result: ' + captured);
    return captured;
  } catch (err) {
    if (err.status) throw err;
    logger.error('RF capture failed: ' + err.message);
    const capErr = new Error('RF capture failed: ' + err.message);
    capErr.status = 502;
    throw capErr;
  }
}
