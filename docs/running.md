# Running without Docker

> **Docker users:** See the [Quick start with Docker](../README.md#quick-start-with-docker-recommended)
> section in the README — `docker compose up -d` is all you need.

This guide covers installing and running blinds-server directly on the Raspberry Pi, without Docker.

---

## Installation

### Raspberry Pi OS setup

#### 1. Enable SPI

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

#### 2. Update the system

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

#### 3. Install system dependencies

```bash
sudo apt-get install -y python3 python3-pip python3-venv git
```

### Software installation

#### 1. Clone the repository

```bash
git clone https://github.com/nprail/blinds-server.git
cd blinds-server
```

#### 2. Install Node.js 22

If Node.js 22 is not already installed, use [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version   # should print v22.x.x
```

#### 3. Install Node.js dependencies

```bash
npm install
```

#### 4. Build the web UI

```bash
npm run build:ui
```

#### 5. Install Python dependencies

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

#### 6. Create your environment file

```bash
cp .env.example .env
# Edit .env with your preferred editor
nano .env
```

---

## Starting the server

### Development (with auto-restart on file changes)

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts on `http://0.0.0.0:3000` (or whatever `PORT` you set in
`.env`).

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
