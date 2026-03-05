# API Reference

All endpoints are prefixed with `/api`.  Request and response bodies are JSON.

---

## Health

### `GET /api/health`

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

## Blinds

### `GET /api/blinds`

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

### `GET /api/blinds/:id`

Returns a single channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Channel ID |

**Response 200** — same shape as one element of the list above.

**Response 404** — channel not found.

---

### `POST /api/blinds/:id/commands`

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

### `POST /api/blinds/:id/up`
### `POST /api/blinds/:id/down`
### `POST /api/blinds/:id/stop`
### `POST /api/blinds/:id/pair`

Shorthand routes — equivalent to `POST /api/blinds/:id/commands` with the
matching `action` value.  No request body required.

---

### `POST /api/blinds/all/:action`

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

### `POST /api/blinds/learn`

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

## Error responses

All error responses share this shape:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

In `NODE_ENV=development` mode, a `stack` field is also included.
