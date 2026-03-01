# blinds-server

A Node.js 22 / Express 5 service for controlling **AC123-16D-style** 433.92 MHz RF-powered blinds from a Raspberry Pi fitted with an **SX1278 LoRa** radio module.

The service exposes a clean REST API.  All RF transmission and reception is handled by a small Python helper script that talks to the SX1278 over SPI in **OOK (On-Off Keying)** mode — the same modulation used by virtually all 433 MHz blind remotes.

---

## Table of Contents

1. [Hardware requirements](#hardware-requirements)
2. [Wiring](#wiring)
3. [Raspberry Pi OS setup](#raspberry-pi-os-setup)
4. [Software installation](#software-installation)
5. [Configuration](#configuration)
6. [Capturing RF codes from your remote](#capturing-rf-codes-from-your-remote)
7. [Running the service](#running-the-service)
8. [Running as a systemd service](#running-as-a-systemd-service)
9. [API reference](#api-reference)
10. [Project structure](#project-structure)
11. [Troubleshooting](#troubleshooting)

---

## Hardware requirements

| Component | Notes |
|-----------|-------|
| Raspberry Pi (any model with 40-pin GPIO) | Pi 3B / 3B+ / 4 / Zero 2W recommended |
| SX1278 LoRa 433 MHz module | Any breakout board labelled Ra-02, AI-Thinker, or similar |
| AC123-16D remote (or compatible) | Used as the reference remote whose codes you capture |
| Jumper wires | Female-to-female for direct GPIO connection |
| 3.3 V power supply | **Do not use 5 V — the SX1278 is a 3.3 V device** |

---

## Wiring

Connect the SX1278 to the Raspberry Pi's SPI0 bus:

| SX1278 Pin | Pi GPIO (BCM) | Pi Header pin | Function |
|------------|---------------|---------------|----------|
| VCC        | 3V3           | 1 or 17       | Power    |
| GND        | GND           | 6, 9, 14, 20… | Ground   |
| SCK        | GPIO 11       | 23            | SPI0 CLK |
| MOSI       | GPIO 10       | 19            | SPI0 MOSI |
| MISO       | GPIO 9        | 21            | SPI0 MISO |
| NSS / CS   | GPIO 8 (CE0)  | 24            | SPI0 CE0 |
| RESET      | GPIO 22       | 15            | Reset    |
| DIO0       | GPIO 25       | 22            | IRQ (optional) |

> **Tip:** If you want to use a different CE pin (e.g. CE1 on GPIO 7), set
> `SX1278_SPI_DEVICE=1` in your `.env` and wire NSS to GPIO 7 (pin 26).

---

## Raspberry Pi OS setup

### 1. Enable SPI

```bash
sudo raspi-config
# Navigate to: Interface Options → SPI → Enable
# Reboot
```

Verify SPI is active:

```bash
ls /dev/spi*
# Should show: /dev/spidev0.0  /dev/spidev0.1
```

### 2. Update the system

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 3. Install system dependencies

```bash
sudo apt-get install -y python3 python3-pip python3-venv git
```

---

## Software installation

### 1. Clone the repository

```bash
git clone https://github.com/nprail/blinds-server.git
cd blinds-server
```

### 2. Install Node.js 22

If Node.js 22 is not already installed, use [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version   # should print v22.x.x
```

### 3. Install Node.js dependencies

```bash
npm install
```

### 4. Install Python dependencies

The Python scripts need `spidev` and `RPi.GPIO`.  Use a virtual environment to
keep things tidy:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
```

If you use a virtual environment, update `PYTHON_PATH` in your `.env`:

```
PYTHON_PATH=/home/pi/blinds-server/.venv/bin/python3
```

### 5. Create your environment file

```bash
cp .env.example .env
# Edit .env with your preferred editor
nano .env
```

---

## Configuration

### `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | TCP port the HTTP server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | `production` or `development` |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` |
| `RF_FREQUENCY_HZ` | `433920000` | Carrier frequency in Hz (433.92 MHz) |
| `RF_REPEAT_COUNT` | `3` | How many times each RF frame is repeated |
| `PYTHON_PATH` | `python3` | Path to the Python interpreter |
| `SX1278_SPI_BUS` | `0` | SPI bus number |
| `SX1278_SPI_DEVICE` | `0` | SPI chip-select (0 = CE0, 1 = CE1) |
| `SX1278_RESET_PIN` | `22` | BCM GPIO pin wired to SX1278 RESET |
| `SX1278_DIO0_PIN` | `25` | BCM GPIO pin wired to SX1278 DIO0 |

### `config/blinds.json`

Defines all blind channels.  Edit this file (or use the `/api/blinds/learn`
endpoint) to add your captured RF codes:

```json
{
  "channels": [
    {
      "id": 1,
      "name": "Living Room",
      "enabled": true,
      "codes": {
        "up":   "10001010110001001000100010001000100010001000100010",
        "down": "10001010110001001000100010001000100010001000100011",
        "stop": "10001010110001001000100010001000100010001000100010",
        "pair": "10001010110001001000100010001000100010001000100001"
      },
      "protocol": {
        "pulseLength": 350,
        "syncFactor": { "high": 1, "low": 31 },
        "zero":       { "high": 1, "low": 3  },
        "one":        { "high": 3, "low": 1  },
        "invertedSignal": false
      }
    }
  ]
}
```

**Protocol fields:**

| Field | Description |
|-------|-------------|
| `pulseLength` | Base pulse width in µs (try 350 for AC123-16D) |
| `syncFactor` | Sync pulse multipliers (high × pulseLength, low × pulseLength) |
| `zero` | Logic-0 bit pulse multipliers |
| `one` | Logic-1 bit pulse multipliers |
| `invertedSignal` | Set `true` if your wiring inverts the signal |

---

## Capturing RF codes from your remote

Because the AC123-16D uses a **fixed code** (not rolling codes), you only need
to capture each button press once.

### Option A – Use the built-in learn endpoint (recommended)

1. Start the service (see below).
2. Point an HTTP client at the learn endpoint, specifying which channel and
   command you want to teach:

   ```bash
   curl -s -X POST http://localhost:3000/api/blinds/learn \
     -H 'Content-Type: application/json' \
     -d '{"channelId": 1, "command": "up", "timeoutSec": 10}'
   ```

3. Within 10 seconds, press the matching button on your physical remote
   while it is held close to the SX1278 antenna.

4. The service will print the captured code and save it automatically to
   `config/blinds.json`.

5. Repeat for each channel / command combination.

### Option B – Use an RTL-SDR dongle and `rtl_433`

If you have an RTL-SDR USB dongle, `rtl_433` can decode many 433 MHz remotes:

```bash
sudo apt-get install rtl-433
rtl_433 -f 433920000 -R 0 -A   # raw pulse output
```

Copy the output timings into `config/blinds.json`.

### Option C – Use an Arduino with a 433 MHz receiver module

Upload a sketch that uses the [rc-switch](https://github.com/sui77/rc-switch)
library to decode and print the binary code, then paste it into
`config/blinds.json`.

---

## Running the service

### Development (with auto-restart on file changes)

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts on `http://0.0.0.0:3000` (or whatever `PORT` you set).

Verify it is running:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "uptime": 4,
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

---

## Running as a systemd service

Create a unit file so the service starts automatically on boot:

```bash
sudo nano /etc/systemd/system/blinds-server.service
```

```ini
[Unit]
Description=blinds-server RF blind control
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/blinds-server
EnvironmentFile=/home/pi/blinds-server/.env
ExecStart=/home/pi/.nvm/versions/node/v22.0.0/bin/node src/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

> **Note:** Adjust the `ExecStart` path to match your Node.js installation.
> Run `which node` to find it.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable blinds-server
sudo systemctl start  blinds-server
sudo systemctl status blinds-server
```

View logs:

```bash
sudo journalctl -u blinds-server -f
```

---

## API reference

All endpoints are prefixed with `/api`.  Request and response bodies are JSON.

### Health

#### `GET /api/health`

Returns service liveness information.

**Response 200**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "uptime": 120,
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### Blinds

#### `GET /api/blinds`

Returns all configured channels with their last-known state.

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Living Room",
      "enabled": true,
      "state": "up",
      "codes": { "up": "...", "down": "...", "stop": "...", "pair": "..." },
      "protocol": { "..." : "..." }
    }
  ]
}
```

---

#### `GET /api/blinds/:id`

Returns a single channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Channel ID |

**Response 200** — same shape as one element of the list above.

**Response 404** — channel not found.

---

#### `POST /api/blinds/:id/commands`

Send any command to a channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Channel ID |

**Request body**
```json
{ "action": "up" }
```

`action` must be one of: `up`, `down`, `stop`, `pair`.

**Response 200**
```json
{
  "success": true,
  "data": { "channelId": 1, "action": "up", "state": "up" }
}
```

---

#### `POST /api/blinds/:id/up`
#### `POST /api/blinds/:id/down`
#### `POST /api/blinds/:id/stop`
#### `POST /api/blinds/:id/pair`

Shorthand routes — equivalent to `POST /api/blinds/:id/commands` with the
matching `action` value.  No request body required.

---

#### `POST /api/blinds/all/:action`

Send the same command to every **enabled** channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | `up`, `down`, or `stop` |

**Response 200** (all succeeded) **/ 207** (partial failure)
```json
{
  "success": true,
  "data": [
    { "channelId": 1, "success": true },
    { "channelId": 2, "success": true }
  ]
}
```

---

#### `POST /api/blinds/learn`

Enter RF capture mode to learn a code from your physical remote.  The SX1278
listens for `timeoutSec` seconds; the first valid RF burst is stored.

**Request body**
```json
{
  "channelId": 1,
  "command": "up",
  "timeoutSec": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channelId` | integer | ✅ | ID of the channel to update |
| `command` | string | ✅ | `up`, `down`, `stop`, or `pair` |
| `timeoutSec` | number | ❌ | Seconds to listen (1–60, default 10) |

**Response 200**
```json
{
  "success": true,
  "data": {
    "channelId": 1,
    "command": "up",
    "code": "10001010110001001000100010001000"
  }
}
```

**Response 408** — no signal captured within the timeout.

**Response 422** — channel has no code configured yet (use learn first).

---

### Error responses

All error responses share this shape:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

In `NODE_ENV=development` mode, a `stack` field is also included.

---

## Project structure

```
blinds-server/
├── config/
│   └── blinds.json          # Channel definitions and RF codes
├── python/
│   ├── sx1278.py            # SX1278 hardware driver (OOK mode)
│   ├── rf_transmit.py       # RF transmit script (called by Node)
│   ├── rf_receive.py        # RF capture / learn script
│   └── requirements.txt     # Python dependencies
├── src/
│   ├── index.js             # Entry point — starts the HTTP server
│   ├── app.js               # Express 5 app, middleware, routes
│   ├── config/
│   │   └── index.js         # Unified config (env + blinds.json)
│   ├── controllers/
│   │   ├── blindsController.js  # Blind action handlers
│   │   └── healthController.js  # Health check handler
│   ├── middleware/
│   │   └── errorHandler.js  # Global Express error handler
│   ├── routes/
│   │   ├── index.js         # Route aggregator
│   │   ├── blinds.js        # /api/blinds routes
│   │   └── health.js        # /api/health routes
│   ├── services/
│   │   ├── rfService.js     # RF transmission/capture (calls Python)
│   │   └── blindsService.js # Channel state management
│   └── utils/
│       └── logger.js        # Winston logger
├── .env.example             # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Troubleshooting

### `ENOENT: python3 not found`

Set `PYTHON_PATH` in your `.env` to the full path of your Python interpreter:

```
PYTHON_PATH=/usr/bin/python3
```

or, if using a venv:

```
PYTHON_PATH=/home/pi/blinds-server/.venv/bin/python3
```

### `Could not import sx1278 module`

Run:

```bash
pip install spidev RPi.GPIO
```

Make sure you are running on a real Raspberry Pi with SPI enabled.

### `No RF signal captured`

- Hold the remote within 30 cm of the SX1278 antenna during capture.
- Check the SPI wiring and ensure SPI is enabled (`ls /dev/spi*`).
- Try increasing `timeoutSec` to 20 seconds.
- Verify the frequency matches your remote (most use 433.92 MHz; some use 434.075 MHz).

### `RF transmission failed`

- Confirm the SX1278 is powered from 3.3 V (NOT 5 V).
- Check all SPI connections with a multimeter or logic analyser.
- Run the Python script directly to see the full error:

  ```bash
  python3 python/rf_transmit.py --payload '{"frequency":433920000,"code":"10110011","protocol":{},"repeat":1}'
  ```

### Blinds respond to one command but not another

The RF code for that command may be missing or wrong in `config/blinds.json`.
Use the learn endpoint or re-capture the code.

### Permission denied on `/dev/spidev*`

Add your user to the `spi` group:

```bash
sudo usermod -a -G spi $USER
# Log out and back in, then verify:
id $USER
```