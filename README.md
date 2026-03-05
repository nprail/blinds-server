# blinds-server

A Node.js 22 / Express 5 service for controlling **AC123-16D-style** 433.92 MHz RF-powered blinds from a Raspberry Pi fitted with an **FS1000A transmitter** and **RXB6 receiver**.

The service exposes a clean REST API.  All RF transmission and reception is handled by a small Python helper script that bit-bangs the **OOK (On-Off Keying)** waveform directly over GPIO — the same modulation used by virtually all 433 MHz blind remotes.

---

## Table of Contents

1. [Hardware requirements](#hardware-requirements)
2. [Wiring](#wiring)
3. [Quick start with Docker (recommended)](#quick-start-with-docker-recommended)
4. [Configuration](#configuration)
5. [Capturing RF codes from your remote](#capturing-rf-codes-from-your-remote)
6. [Running the service](#running-the-service)
7. [Web interface](#web-interface)
8. [API reference](#api-reference)
9. [Project structure](#project-structure)
10. [Troubleshooting](#troubleshooting)

---

## Hardware requirements

| Component | Notes |
|-----------|-------|
| Raspberry Pi (any model with 40-pin GPIO) | Pi 3B / 3B+ / 4 / Zero 2W recommended |
| FS1000A 433 MHz transmitter module | Widely available, ~$1; labelled XY-FST or similar |
| RXB6 433 MHz receiver module | Superheterodyne; better sensitivity than XY-MK-5V |
| AC123-16D remote (or compatible) | Used as the reference remote whose codes you capture |
| Jumper wires | Female-to-female for direct GPIO connection |
| 5 V power supply | Both FS1000A and RXB6 run from the Pi's 5 V pin |

---

## Wiring

Connect the modules to the Raspberry Pi GPIO header:

### FS1000A (transmitter)

| FS1000A Pin | Pi GPIO (BCM) | Pi Header pin | Notes |
|-------------|---------------|---------------|-------|
| VCC         | 5 V           | 2 or 4        | Use 5 V for maximum range |
| GND         | GND           | 6, 9, 14, 20… | Ground |
| DATA        | GPIO 17       | 11            | Configurable via `GPIO_TX_PIN` |

### RXB6 (receiver)

| RXB6 Pin | Pi GPIO (BCM) | Pi Header pin | Notes |
|----------|---------------|---------------|-------|
| VCC      | 5 V           | 2 or 4        | |
| GND      | GND           | 6, 9, 14, 20… | Ground |
| DATA     | GPIO 27       | 13            | Configurable via `GPIO_RX_PIN` |

> **Tip:** Add a short wire antenna (17 cm for 433.92 MHz) to the ANT pin on
> both modules to improve range.

---

## Quick start with Docker (recommended)

Docker is the easiest way to run blinds-server on a Raspberry Pi.  The image
bundles Node.js, Python, and all dependencies — no manual venv or nvm setup
required.

### Prerequisites

- Docker Engine ≥ 24 and Docker Compose ≥ 2.20 ([install guide](https://docs.docker.com/engine/install/debian/))

### 1. Clone the repository and configure

```bash
git clone https://github.com/nprail/blinds-server.git
cd blinds-server
cp .env.example .env
# Edit .env if you need non-default settings (port, GPIO pins, etc.)
nano .env
```

### 2. Start the service

```bash
docker compose up -d
```

Docker Compose builds the image on first run (this takes a few minutes while
it compiles RPi.GPIO).  Subsequent starts are instant.

Open the web interface at **http://\<pi-hostname-or-ip\>:3000**.

### Persisting RF codes

The `config/` directory is bind-mounted into the container, so any RF codes
you learn through the web UI or API are written directly to
`config/blinds.json` on the host and survive container restarts or upgrades.

### Updating

```bash
git pull
docker compose build && docker compose up -d
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
| `RF_REPEAT_COUNT` | `3` | How many times each RF frame is repeated |
| `PYTHON_PATH` | `python3` | Path to the Python interpreter |
| `GPIO_TX_PIN` | `17` | BCM GPIO pin wired to FS1000A DATA |
| `GPIO_RX_PIN` | `27` | BCM GPIO pin wired to RXB6 DATA |

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

1. Start the service (see below).
2. Point an HTTP client at the learn endpoint, specifying which channel and
   command you want to teach:

   ```bash
   curl -s -X POST http://localhost:3000/api/blinds/learn \
     -H 'Content-Type: application/json' \
     -d '{"channelId": 1, "command": "up", "timeoutSec": 10}'
   ```

3. Within 10 seconds, press the matching button on your physical remote
   while it is held close to the RXB6 antenna.

4. The service will print the captured code and save it automatically to
   `config/blinds.json`.

5. Repeat for each channel / command combination.

---

## Running the service

```bash
docker compose up -d
```

See [Quick start with Docker](#quick-start-with-docker-recommended) for full details.

> **Running without Docker?** See **[docs/running.md](docs/running.md)**.

---

## Web interface

Once the service is running, open a browser and navigate to:

```
http://<pi-hostname-or-ip>:3000
```

The page is served as a static bundle built from `ui/` and requires no internet access.

### Building the UI

The web UI source lives in `ui/` and is compiled to `public/` by Vite:

```bash
# One-time production build (run after cloning, or after any UI changes)
npm run build:ui
```

During development you can run the Vite dev server (with hot-module reload) alongside the Node server:

```bash
npm run dev        # starts the Express API on :3000
npm run dev:ui     # starts the Vite dev server on :5173 (proxies /api to :3000)
```

### Controlling a blind

Each channel appears as a card showing the channel name, ID, and last known state.

| Button | Action |
|--------|--------|
| **▲ Up** | Raises the blind |
| **■ Stop** | Stops movement immediately |
| **▼ Down** | Lowers the blind |
| **⚙ Pair** | Sends the pairing command — see [Pairing a channel](#pairing-a-channel) |

The **state badge** (top-right of each card) updates after every button press.

### Bulk controls

The **All Channels** card at the top of the page sends the same command to every enabled channel simultaneously:

- **▲ All Up** — raise all blinds
- **■ All Stop** — stop all blinds
- **▼ All Down** — lower all blinds

If one or more channels fail, a warning toast shows how many channels responded successfully.

### Learning a code from your remote

If a channel does not yet have an RF code stored for a particular command, you can teach it directly from the web UI without using `curl`.

1. Expand the **▸ Learn code from remote** section on the channel card.
2. Select the **Command** you want to learn (`up`, `down`, `stop`, or `pair`).
3. Set the **Timeout** (seconds) the radio will listen for a signal (default: 10 s).
4. Click **📡 Start Learning**.
5. Within the timeout period, press the matching button on your physical remote while holding it close to the RXB6 antenna.
6. A toast notification confirms the captured code and it is saved automatically to `config/blinds.json`.

Repeat for every command on every channel.

> **Tip:** If capture fails, try holding the remote closer to the antenna and increasing the timeout to 20 seconds.

### Pairing a channel

The **⚙ Pair** button sends the pairing command to the blind motor.  The exact pairing procedure varies by motor model, but for AC123-16D-style motors:

1. **Power-cycle the blind motor** (or hold the motor's reset button until the blind jogs up and down).
2. Within ~5 seconds, click **⚙ Pair** in the web UI.
3. The blind should jog to confirm pairing.

Before pairing works, the `pair` RF code must already be learned for that channel.  If it has not been learned yet, use the **Learn code from remote** panel to capture it first.

---

## API reference

See **[docs/api.md](docs/api.md)** for the full API reference.

---

## Project structure

```
blinds-server/
├── config/
│   └── blinds.json          # Channel definitions and RF codes
├── docs/
│   ├── api.md               # Full REST API reference
│   └── running.md           # Manual install + run + systemd setup guide
├── python/
│   ├── rf_transmit.py       # RF transmit script — FS1000A GPIO (called by Node)
│   ├── rf_receive.py        # RF capture / learn script — RXB6 GPIO
│   └── requirements.txt     # Python dependencies (RPi.GPIO)
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
├── ui/                      # Web UI source (React + Tailwind, built by Vite)
│   ├── index.html           # Vite entry HTML
│   └── src/
│       ├── main.jsx         # React entry point
│       ├── App.jsx          # Root component
│       ├── api.js           # fetch helpers
│       ├── index.css        # Tailwind base styles
│       ├── components/
│       │   ├── ChannelCard.jsx   # Per-channel control card
│       │   ├── BulkControls.jsx  # All-channels card
│       │   └── Toast.jsx         # Toast notification container
│       └── hooks/
│           └── useToast.js  # Toast state hook
├── public/                  # ⚠ Build output — do not edit manually
│   │                        #   generated by `npm run build:ui`
│   └── …
├── .env.example             # Environment variable template
├── .gitignore
├── docker-compose.yml       # Docker Compose service definition
├── Dockerfile               # Multi-stage build (UI builder + runtime)
├── package.json
├── postcss.config.js        # PostCSS config (used by Vite/Tailwind)
├── tailwind.config.js       # Tailwind CSS config
├── vite.config.js           # Vite build config
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

### `Could not import RPi.GPIO`

Run:

```bash
pip install RPi.GPIO
```

Make sure you are running on a real Raspberry Pi.

### `No RF signal captured`

- Hold the remote within 30 cm of the RXB6 antenna during capture.
- Check the DATA pin wiring and ensure the correct `GPIO_RX_PIN` is set in `.env`.
- Try increasing `timeoutSec` to 20 seconds.
- Verify the RXB6 is powered from 5 V (not 3.3 V) for maximum sensitivity.

### `RF transmission failed`

- Confirm the FS1000A is powered from 5 V.
- Check the DATA pin wiring and ensure the correct `GPIO_TX_PIN` is set in `.env`.
- Run the Python script directly to see the full error:

  ```bash
  python3 python/rf_transmit.py --payload '{"code":"10110011","protocol":{},"repeat":1,"txPin":17}'
  ```

### Blinds respond to one command but not another

The RF code for that command may be missing or wrong in `config/blinds.json`.
Use the learn endpoint or re-capture the code.

### Permission denied on `/dev/gpiomem`

Add your user to the `gpio` group:

```bash
sudo usermod -a -G gpio $USER
# Log out and back in, then verify:
id $USER
```