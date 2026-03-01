import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load the blinds channel configuration from config/blinds.json.
 * Falls back to an empty channels array if the file is missing.
 */
function loadBlindsConfig() {
  const configPath = resolve(__dirname, '../../config/blinds.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { channels: [] };
  }
}

const blindsConfig = loadBlindsConfig();

const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'production',

  rf: {
    /** Carrier frequency in Hz (433.92 MHz for most blinds remotes) */
    frequencyHz: parseInt(process.env.RF_FREQUENCY_HZ ?? '433920000', 10),
    /** How many times each RF frame is repeated for reliability */
    repeatCount: parseInt(process.env.RF_REPEAT_COUNT ?? '3', 10),
    /** Full path to the Python interpreter */
    pythonPath: process.env.PYTHON_PATH ?? 'python3',
    /** Path to the RF transmit Python script */
    scriptPath: resolve(__dirname, '../../python/rf_transmit.py'),
    /** Path to the RF receive/learn Python script */
    receiveScriptPath: resolve(__dirname, '../../python/rf_receive.py'),
  },

  sx1278: {
    /** SPI bus number (0 = /dev/spidev0.x) */
    spiBus: parseInt(process.env.SX1278_SPI_BUS ?? '0', 10),
    /** SPI chip-select number (0 = CE0, GPIO 8) */
    spiDevice: parseInt(process.env.SX1278_SPI_DEVICE ?? '0', 10),
    /** BCM GPIO pin connected to SX1278 RESET */
    resetPin: parseInt(process.env.SX1278_RESET_PIN ?? '22', 10),
    /** BCM GPIO pin connected to SX1278 DIO0 (interrupt) */
    dio0Pin: parseInt(process.env.SX1278_DIO0_PIN ?? '25', 10),
  },

  /** Channel definitions loaded from config/blinds.json */
  blinds: blindsConfig,
};

export default config;
