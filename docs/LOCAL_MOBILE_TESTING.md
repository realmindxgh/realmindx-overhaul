# Local Mobile Testing with ngrok

This document explains how to test the RealMindX Bookshop on an actual phone during local development.

## Prerequisites

- [ngrok](https://ngrok.com/download) installed and in PATH
- Flask API running on port 5000
- Vite dev server running on port 5173

## Service order

Start services in this order:

### 1. Flask API

```powershell
cd "E:\VS Code Projects\realmindx-overhaul\realmindx-site"
$env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"
$env:FLASK_APP = "backend:create_app"
$env:FLASK_ENV = "development"
& .venv\Scripts\python.exe -m flask run --port 5000
```

### 2. Vite dev server with current ngrok hostname

```powershell
cd "E:\VS Code Projects\realmindx-overhaul"
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = "<current-ngrok-hostname>"
npx vite --host 0.0.0.0 --port 5173 --strictPort
```

`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` must be set **before** starting Vite so the ngrok hostname is allowed. If ngrok is restarted and gets a new hostname, Vite must also be restarted with the new hostname.

Do **not** use `server.allowedHosts: true` — this disables Vite's host-check security entirely.

Do **not** use `--host 127.0.0.1` — ngrok cannot forward to a loopback-only listener from external clients. Use `--host 0.0.0.0`.

Use `--strictPort` to fail if port 5173 is occupied rather than silently moving to 5174.

### 3. ngrok

```powershell
ngrok http 5173
```

## Checking the current tunnel

ngrok exposes a local inspection API on port 4040:

```powershell
# Get tunnel details
Invoke-RestMethod http://127.0.0.1:4040/api/tunnels | ConvertTo-Json -Depth 5

# The public URL will be something like https://<random>.ngrok-free.dev
```

If no tunnel is active, the request will fail with a connection refused error.

## How to tell if the ngrok URL has changed

- A stopped or restarted ngrok tunnel generates a **new random hostname**.
- The old URL will show "Tunnel <old-url> not found" or a 502.
- Check the current URL by inspecting `http://127.0.0.1:4040/api/tunnels`.

## How to distinguish a Vite host error from an expired ngrok tunnel

| Symptom | Likely cause |
|---|---|
| Response body says "Blocked request. This host is not allowed." | Vite's `allowedHosts` does not include the current ngrok hostname. Restart Vite with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` set. |
| Browser shows "Tunnel not found" or "502 Bad Gateway" | ngrok tunnel is dead or was restarted. Check `http://127.0.0.1:4040/api/tunnels`. |
| "This site can't be reached" / connection refused | ngrok is not running at all. |
| Page loads but API calls fail | Flask is not running or is on a different port. |

## Stopping stale Vite processes

```powershell
# Find processes listening on port 5173
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  Where-Object State -EQ "Listen"

# Get the PID and process info
Get-Process -Id <PID>

# Stop only the stale Vite (not Flask or other node processes)
Stop-Process -Id <PID> -Force
```

## Testing locally

1. Open the current ngrok public URL on your phone.
2. Navigate through Home, Shop, Cart, and Account tabs.
3. Verify the original footer appears in each tab.
4. Verify tab switching preserves scroll position.
5. Verify no console errors (use `chrome://inspect` on Android).

## Notes

- ngrok free tier URLs are temporary. After some time or a restart, the URL changes.
- Always check the current tunnel before starting Vite.
- Vite must be restarted with the new hostname if ngrok is restarted.
- Do not commit the ngrok hostname to `vite.config.js` — use the environment variable.
