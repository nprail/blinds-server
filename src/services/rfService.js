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
 * Set RF_DRIVER=e32 to use the EBYTE E32 UART LoRa driver instead of the
 * default SX1278 SPI OOK driver.
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
        'Use the /api/blinds/learn endpoint or edit config/blinds.json to add codes.'
    );
    err.status = 422;
    throw err;
  }

  const isE32 = config.rf.driver === 'e32';

  const payload = isE32
    ? JSON.stringify({
        code,
        repeat: config.rf.repeatCount,
        port: config.e32.port,
        baud: config.e32.baud,
        m0Pin: config.e32.m0Pin,
        m1Pin: config.e32.m1Pin,
        ...(config.e32.auxPin !== null && { auxPin: config.e32.auxPin }),
      })
    : JSON.stringify({
        frequency: config.rf.frequencyHz,
        code,
        protocol: channel.protocol ?? {},
        repeat: config.rf.repeatCount,
        spiBus: config.sx1278.spiBus,
        spiDevice: config.sx1278.spiDevice,
        resetPin: config.sx1278.resetPin,
      });

  const scriptPath = isE32
    ? config.rf.e32TransmitScriptPath
    : config.rf.scriptPath;

  logger.info(
    `Transmitting channel=${channel.id} command=${command} code=${code} driver=${config.rf.driver}`
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      config.rf.pythonPath,
      [scriptPath, '--payload', payload],
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
 * physical remote (SX1278) or from another E32 transmitter (E32 driver).
 * Returns the captured code string.
 *
 * @param {number} [timeoutSec=10]
 * @returns {Promise<string>}
 */
export async function capture(timeoutSec = 10) {
  logger.info(`Starting RF capture window (${timeoutSec}s) driver=${config.rf.driver}…`);

  const isE32 = config.rf.driver === 'e32';

  const args = isE32
    ? [
        config.rf.e32ReceiveScriptPath,
        '--timeout', String(timeoutSec),
        '--port', config.e32.port,
        '--baud', String(config.e32.baud),
        '--m0-pin', String(config.e32.m0Pin),
        '--m1-pin', String(config.e32.m1Pin),
        ...(config.e32.auxPin !== null
          ? ['--aux-pin', String(config.e32.auxPin)]
          : []),
      ]
    : [
        config.rf.receiveScriptPath,
        '--timeout', String(timeoutSec),
        '--frequency', String(config.rf.frequencyHz),
        '--spi-bus', String(config.sx1278.spiBus),
        '--spi-device', String(config.sx1278.spiDevice),
        '--reset-pin', String(config.sx1278.resetPin),
      ];

  try {
    const { stdout } = await execFileAsync(
      config.rf.pythonPath,
      args,
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
