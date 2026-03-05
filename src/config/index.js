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
    /** How many times each RF frame is repeated for reliability */
    repeatCount: parseInt(process.env.RF_REPEAT_COUNT ?? '3', 10),
    /** Full path to the Python interpreter */
    pythonPath: process.env.PYTHON_PATH ?? 'python3',
    /** Path to the RF transmit Python script */
    scriptPath: resolve(__dirname, '../../python/rf_transmit.py'),
    /** Path to the RF receive/learn Python script */
    receiveScriptPath: resolve(__dirname, '../../python/rf_receive.py'),
  },

  gpio: {
    /** BCM GPIO pin connected to FS1000A DATA (transmit) */
    txPin: parseInt(process.env.GPIO_TX_PIN ?? '17', 10),
    /** BCM GPIO pin connected to RXB6 DATA (receive) */
    rxPin: parseInt(process.env.GPIO_RX_PIN ?? '27', 10),
  },

  /** Channel definitions loaded from config/blinds.json */
  blinds: blindsConfig,
};

export default config;
