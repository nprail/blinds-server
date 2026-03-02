# Running the service manually

> **Docker users:** See the [Quick start with Docker](../README.md#quick-start-with-docker-recommended)
> section in the README — `docker compose up -d` is all you need.

This guide covers running blinds-server directly (without Docker).

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
