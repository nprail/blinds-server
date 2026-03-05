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
    /** Which RF driver to use: 'sx1278' (SPI OOK) or 'e32' (UART LoRa) */
    driver: process.env.RF_DRIVER ?? 'sx1278',
    /** Carrier frequency in Hz (433.92 MHz for most blinds remotes) */
    frequencyHz: parseInt(process.env.RF_FREQUENCY_HZ ?? '433920000', 10),
    /** How many times each RF frame is repeated for reliability */
    repeatCount: parseInt(process.env.RF_REPEAT_COUNT ?? '3', 10),
    /** Full path to the Python interpreter */
    pythonPath: process.env.PYTHON_PATH ?? 'python3',
    /** Path to the SX1278 RF transmit Python script */
    scriptPath: resolve(__dirname, '../../python/rf_transmit.py'),
    /** Path to the SX1278 RF receive/learn Python script */
    receiveScriptPath: resolve(__dirname, '../../python/rf_receive.py'),
    /** Path to the E32 RF transmit Python script */
    e32TransmitScriptPath: resolve(__dirname, '../../python/rf_transmit_e32.py'),
    /** Path to the E32 RF receive/learn Python script */
    e32ReceiveScriptPath: resolve(__dirname, '../../python/rf_receive_e32.py'),
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

  e32: {
    /** Serial port the E32 module is connected to */
    port: process.env.E32_UART_PORT ?? '/dev/ttyS0',
    /** UART baud rate (must match the E32 module's configured rate) */
    baud: parseInt(process.env.E32_UART_BAUD ?? '9600', 10),
    /** BCM GPIO pin connected to E32 M0 */
    m0Pin: parseInt(process.env.E32_M0_PIN ?? '17', 10),
    /** BCM GPIO pin connected to E32 M1 */
    m1Pin: parseInt(process.env.E32_M1_PIN ?? '27', 10),
    /** BCM GPIO pin connected to E32 AUX (null = not connected) */
    auxPin: process.env.E32_AUX_PIN
      ? parseInt(process.env.E32_AUX_PIN, 10)
      : null,
  },

  /** Channel definitions loaded from config/blinds.json */
  blinds: blindsConfig,
};

export default config;
