# RealMindX VPS Deployment Notes

Deploy only after local frontend and API checks pass.

## Target Layout

```text
/var/www/realmindx-overhaul
  realmindx-site
  realmindx-bookshop
```

The current implementation uses one Vite React frontend and one Flask API backend. The bookshop is a separate route group inside the React app and keeps its own navbar/footer.

## Server Packages

- Python 3.12+
- PostgreSQL 15+
- Node.js 20+
- Nginx
- Gunicorn
- Certbot or another SSL workflow

## Environment

Create `/var/www/realmindx-overhaul/realmindx-site/.env` from `realmindx-site/.env.example`.

Use production values for:

- `SECRET_KEY`
- `DATABASE_URL`
- `BASE_URL=https://realmindxgh.com`
- `BOOKSHOP_URL=https://bookshop.realmindxgh.com` if the bookshop gets its own host
- `API_URL=https://realmindxgh.com/api`
- `CORS_ORIGINS=https://realmindxgh.com,https://www.realmindxgh.com,https://bookshop.realmindxgh.com`
- Email provider keys
- Turnstile keys
- `SESSION_COOKIE_SECURE=true`

## First Deploy

```bash
cd /var/www/realmindx-overhaul
npm ci
npm run build

cd realmindx-site
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
flask db upgrade
flask seed-admin
```

## Gunicorn

From `realmindx-site`:

```bash
gunicorn -c gunicorn.conf.py
```

In production, run Gunicorn through systemd.

## Nginx Shape

- Serve the Vite `dist` directory for public routes.
- Proxy `/api/` and `/health` to Gunicorn.
- Use SPA fallback to `dist/index.html`.
- Keep upload paths outside the static frontend and serve protected files through Flask.

Sketch:

```nginx
server {
    server_name realmindxgh.com www.realmindxgh.com;

    root /var/www/realmindx-overhaul/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## DNS Cautions

Do not break Zoho email DNS records. If moving to Cloudflare, copy all existing Hostinger DNS records first, including MX, SPF, DKIM, and DMARC.

## Database Backups

Create a daily PostgreSQL dump outside the web root and sync it to remote storage.

```bash
mkdir -p /var/backups/realmindx
pg_dump "$DATABASE_URL" | gzip > "/var/backups/realmindx/realmindx-$(date +%F).sql.gz"
find /var/backups/realmindx -type f -name "*.sql.gz" -mtime +14 -delete
```

Recommended cron:

```cron
15 2 * * * cd /var/www/realmindx-overhaul/realmindx-site && . .venv/bin/activate && set -a && . .env && set +a && pg_dump "$DATABASE_URL" | gzip > "/var/backups/realmindx/realmindx-$(date +\\%F).sql.gz"
```

Before launch, add an off-server copy target such as Cloudflare R2, S3-compatible storage, or another managed backup location.
