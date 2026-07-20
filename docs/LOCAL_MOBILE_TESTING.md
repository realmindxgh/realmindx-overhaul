# Local Mobile Testing Guide

This document describes how to test the RealMindX Bookshop on a physical phone
during local development.

## Principle

**Long-running processes must be launched manually in separate visible
PowerShell terminals.** OpenCode agents (or similar coding assistants) must
not launch or wait on persistent processes such as Flask dev servers, Vite
dev servers, ngrok, cloudflared, or other tunnels/watchers. Agents should
only edit code and run short verification commands with timeouts.

---

## Setup

Open three separate PowerShell terminals.

### Terminal 1 — Flask backend

```powershell
cd E:\VS Code Projects\realmindx-overhaul\realmindx-site
$env:DATABASE_URL = "sqlite:///$PWD\realmindx_local.db"
.venv\Scripts\python -m flask run --host 127.0.0.1 --port 5000 --no-reload
```

- Uses the project virtual environment (`.venv`)
- Uses the local SQLite database (`realmindx_local.db`)
- `--no-reload` prevents the Flask reloader from creating extra Python
  processes and interfering with the single-process expectation

### Terminal 2 — Vite frontend

```powershell
cd E:\VS Code Projects\realmindx-overhaul
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="your-temporary-domain.ngrok-free.app"
npx vite --host 0.0.0.0 --port 5173
```

Key points:

- `--host 0.0.0.0` makes the server reachable from other devices on the LAN
- The `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable adds the
  temporary ngrok domain to Vite's allowed-host check **before** the server
  starts. Set it in the same command line (or the same terminal session)
  before launching Vite; setting it after Vite has started has no effect.
- Vite automatically enables `strictPort` behaviour when `--port` is given,
  but if port 5173 is already taken it will silently move to 5174. Always
  verify the port in the terminal output.

### Terminal 3 — ngrok tunnel

```powershell
ngrok http 5173
```

- **Vite must already be running and listening on port 5173** before ngrok
  starts. Ngrok only probes the port once on startup; if nothing is
  listening it logs a connection-refused error and tunnels nothing.
- Use a free ngrok account (authtoken configured). The free tier shows an
  interstitial warning page when first visited.

---

## Checking which process owns a port

To inspect what is listening on port 5173:

```powershell
netstat -ano | Select-String "5173" | Select-String "LISTENING"
```

The last column is the PID. To stop only that process (if it belongs to
this repository and is stale):

```powershell
Stop-Process -Id <PID> -Force
```

Be careful not to terminate unrelated Node or Python processes.

---

## Verifying the tunnel

```powershell
curl -s -H "ngrok-skip-browser-warning: 1" https://your-temporary-domain.ngrok-free.app/bookshop/
```

The `ngrok-skip-browser-warning: 1` header bypasses the ngrok-free-tier
interstitial and returns the real application response. A successful test
returns HTTP 200 with the SPA HTML shell.

---

## Testing on a phone

1. Open the ngrok URL on the phone browser
   (`https://your-temporary-domain.ngrok-free.app`)
2. Tap **Visit Site** on the ngrok interstitial (free tier)
3. Navigate to `/bookshop/products` to verify mobile batching
4. Scroll to verify infinite-scroll pagination
5. Test search, filters, and sorting

---

## Troubleshooting

### Port 5173 already in use

```powershell
netstat -ano | Select-String "5173"
```

If a stale Vite process from this repository holds the port, stop it by
PID. If another application owns the port, choose a different port with
`--port <PORT>` in both Terminal 2 and Terminal 3.

### Vite silently moved to port 5174

Vite increments the port if 5173 is busy without always printing a clear
warning. Check the first few lines of Vite's terminal output:

```
VITE v6.x  ready in 1234 ms
  ➜  Local:   http://localhost:5173/
```

If it says `5174` instead, restart ngrok pointing at the correct port.

### Ngrok still forwarding to the wrong port

Ngrok captures the target port once at startup. If Vite restarted on a
different port, stop ngrok (Ctrl+C) and restart with the correct port.

### Vite says the host is not allowed

```
The request url ... is not allowed. ...
```

Set `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` **before** Vite starts. This
environment variable is read once during Vite's config resolution; setting
it afterwards has no effect. Stop Vite, set the variable, and restart.

### Ngrok free-tier warning page

ngrok-free.dev shows an interstitial page for first-time visitors. In a
browser, tap **Visit Site**. For curl, send the header
`ngrok-skip-browser-warning: 1`.

### Cached 403 responses on the phone

If the phone previously hit the ngrok URL before it was properly
configured, the browser may cache the 403 interstitial response. Open a
Private/Incognito tab or clear site data.

### Flask reloader creates multiple Python processes

Using `--no-reload` avoids this. If reloader was used, stop all Python
processes belonging to the Flask app and restart with `--no-reload`.

### OpenCode appears stuck while waiting for a persistent process

Agents should **not** start long-running processes. If an agent is stuck
waiting for a server to start, cancel the command and launch the process
manually in a visible terminal, then let the agent proceed with
verification commands.

### API 500 errors

Check the actual Flask traceback in Terminal 1. The Flask terminal output
shows the full Python traceback for any unhandled exception.

### Testing with different addresses

- `http://localhost:5173` – works immediately, no tunnel needed
- `http://127.0.0.1:5173` – works immediately, no tunnel needed
- `http://<LAN_IP>:5173` – works without a tunnel; Vite must be started
  with `--host 0.0.0.0`. Find your LAN IP with `ipconfig`.
- `https://your-temporary-domain.ngrok-free.app` – requires ngrok tunnel
  and the `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` env var
