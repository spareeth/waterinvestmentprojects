# Deployment runbook: Water Investment Projects

Production: https://waterinvestmentprojects.org on Terra's Hetzner server (PLAN v0.3, section 5 and 0a).
Everything runs as one Docker Compose project, `compose.production.yml`, next to the other services on the server.

```
internet ─► server's reverse proxy (TLS, ports 80/443)
               └─► 127.0.0.1:APP_PORT ─► app (Next.js, user "node")
                                          ├─► db      (PostgreSQL 16, volume pgdata)
                                          ├─► clamav  (virus scanner, volume clamdb)
                                          └─► volume blobs (uploaded teasers)
app ─► SMTP provider (summit@waterinvestmentprojects.org)
```

Only the app port is published, and only on 127.0.0.1. The database and scanner are reachable only inside the
project's Docker network.

## 1. Before you start

| What | Who | Notes |
|---|---|---|
| SSH access to the server, Docker Engine with the compose plugin (`docker compose version`) | Terra | Compose v2.20 or later |
| Free memory: about **2.5 GB** for this stack | Terra | ClamAV alone holds about 1.5 GB once its signatures are loaded |
| A free local port for the app (default 3200) | Terra | `ss -ltn` lists ports in use |
| Domain `waterinvestmentprojects.org` registered; DNS **A** (and **AAAA** if IPv6) record to the server | Domain owner | Also `www` if wanted (redirected by the proxy) |
| Mailbox `summit@waterinvestmentprojects.org` at the chosen provider, with SMTP sending allowed | Mail owner | Microsoft 365: SMTP AUTH must be switched on for that mailbox |
| Mail DNS records from the provider: **MX**, **SPF** (TXT), **DKIM** (TXT or CNAME), **DMARC** (TXT `_dmarc`) | Domain owner | Without SPF and DKIM, emails land in spam |

## 2. First deployment

On the server, as an administrator:

```bash
# 1. Get the code (no GitHub remote yet: see "Getting the code" below), e.g. into /opt/waterinvest
sudo mkdir -p /opt/waterinvest && cd /opt/waterinvest

# 2. Settings: copy the template, fill in every CHANGE_ME, make it root-only
sudo cp .env.production.example .env
sudo nano .env
sudo chmod 600 .env

# 3. Build and start (migrations run automatically before the app starts)
sudo docker compose -f compose.production.yml up -d --build

# 4. Watch it come up
sudo docker compose -f compose.production.yml ps
sudo docker compose -f compose.production.yml logs -f app
```

Secrets: `openssl rand -base64 32` for `BETTER_AUTH_SECRET`; `openssl rand -hex 24` for `POSTGRES_PASSWORD`
(put the same password into `DATABASE_URL`).

The first start of `clamav` downloads its signatures (a few minutes). Until then the app logs "ClamAV is not
reachable yet" and new uploads wait as "being checked"; they are scanned as soon as ClamAV answers.

### Getting the code

Preferred: a private GitHub repository, then `git clone` on the server. Until it exists, copy a bundle from the
development machine:

```bash
# On the development machine (WSL)
cd ~/UNWC_ProjectPlatform && git bundle create /tmp/waterinvest.bundle main
scp /tmp/waterinvest.bundle <server>:/tmp/
# On the server
sudo git clone /tmp/waterinvest.bundle /opt/waterinvest
```

### First admin account

Accounts are handed out by admins, so create the first one from the command line. The temporary password is
printed once; the person chooses their own at first sign-in. Everyone else is created in the admin console.

```bash
cd /opt/waterinvest
sudo docker compose -f compose.production.yml run --rm tools \
  npm run admin:create -- --email someone@expocitydubai.ae --name "Full Name" --role PLATFORM_ADMIN
```

`--role SUMMIT_ADMIN` creates a Summit team admin instead.

## 3. Reverse proxy

The proxy terminates TLS and forwards to `127.0.0.1:APP_PORT`. It must allow **request bodies up to 64 MB**
(teaser uploads) and pass the client address in `X-Forwarded-For` (the app uses the last entry, which the proxy
adds) and the scheme in `X-Forwarded-Proto`.

Caddy (certificates are automatic):

```caddy
waterinvestmentprojects.org {
    request_body {
        max_size 64MB
    }
    reverse_proxy 127.0.0.1:3200
}
www.waterinvestmentprojects.org {
    redir https://waterinvestmentprojects.org{uri} permanent
}
```

nginx (certificate with `certbot --nginx -d waterinvestmentprojects.org -d www.waterinvestmentprojects.org`):

```nginx
server {
    server_name waterinvestmentprojects.org;
    client_max_body_size 64m;
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
    # listen 443 ssl; and the certificate lines are added by certbot
}
```

The app sends its own security headers (HSTS, CSP, frame and content-type protections); the proxy does not need
to add them.

## 4. Email

1. Create the mailbox and allow SMTP sending (provider settings in `.env.production.example`).
2. Add the provider's MX, SPF, DKIM and DMARC records to the domain. Start DMARC with `p=none` and tighten it
   once mail arrives reliably.
3. Put `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` into `.env`, keep `MAIL_DRIVER="smtp"`, then
   `sudo docker compose -f compose.production.yml up -d` (no rebuild needed).
4. Test: create an upload link in the admin console and submit a small PDF through it. The uploader gets a
   confirmation and the Summit mailbox a notice. Failures show in the app log and as `mail.failed` audit events.

Until the mailbox works, `MAIL_DRIVER="log"` keeps the portal running and writes each email to the log instead.

## 5. Checks after every deployment

```bash
curl -sI https://waterinvestmentprojects.org | grep -iE '^(HTTP|strict-transport|content-security|x-frame)'
sudo docker compose -f compose.production.yml ps          # app healthy, clamav healthy (after its first start)
sudo docker compose -f compose.production.yml logs app | grep -E '\[(startup|scan|storage|auth)\]'
```

Then in the browser: sign in as admin and change the temporary password; create an upload link; upload a PDF
through it; within a minute the teaser shows as clean in the admin console; publish it; sign in as a test investor
and open and download it; send a meeting request and see it in the country inbox and the admin export.

## 6. Updates

```bash
cd /opt/waterinvest
sudo git pull            # or fetch a new bundle
sudo docker compose -f compose.production.yml up -d --build
```

Migrations run automatically before the new app starts. Changing `APP_NAME`, `APP_URL`, `SUPPORT_EMAIL` or the
investor acknowledgement needs `--build` (they are baked into the pages); other `.env` changes only need `up -d`.

## 7. Backups and restore

`deploy/backup.sh` writes one archive per run (database dump plus all uploaded files) to
`/var/backups/waterinvest`, keeps 35 days, and can copy the archives off the server and encrypt them (settings
at the top of the script). Install it once:

```bash
sudo chmod 700 /opt/waterinvest/deploy/backup.sh
sudo /opt/waterinvest/deploy/backup.sh          # first run by hand: check it prints "wrote ..."
echo '30 2 * * * root BACKUP_REMOTE=uXXXX@uXXXX.your-storagebox.de:waterinvest /opt/waterinvest/deploy/backup.sh >>/var/log/waterinvest-backup.log 2>&1' \
  | sudo tee /etc/cron.d/waterinvest-backup
```

Restore (into the running stack, replacing its data):

```bash
cd /opt/waterinvest && mkdir -p /tmp/restore && tar -C /tmp/restore -xzf /var/backups/waterinvest/waterinvest-<stamp>.tar.gz
sudo docker compose -f compose.production.yml stop app
sudo docker compose -f compose.production.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < /tmp/restore/db.dump
sudo docker compose -f compose.production.yml run --rm -T --no-deps --entrypoint sh tools -c 'tar -C /app/.data -xf -' < /tmp/restore/blobs.tar
sudo docker compose -f compose.production.yml start app
```

Test a restore on staging before the Summit (PLAN M8: backups and a restore test).

## 8. Staging copy

Same steps in another folder (for example `/opt/waterinvest-staging`) with `COMPOSE_PROJECT_NAME=waterinvest-staging`,
another `APP_PORT`, a staging host name in `APP_URL`, `APP_ENV="staging"`, `MAIL_DRIVER="log"`, and for demo data
`ALLOW_DEMO_SEED="true"` and a private `SEED_DEMO_PASSWORD`:

```bash
sudo docker compose -f compose.production.yml run --rm tools npx prisma db seed
```

Never set `ALLOW_DEMO_SEED` on production.

## 9. Troubleshooting

| Symptom | Look at |
|---|---|
| App restarts at once | `logs app`: `[startup] Refusing to start: ...` names the wrong setting in `.env` |
| Uploads stay "being checked" | `logs clamav` (still downloading signatures?), `logs app \| grep scan` |
| A teaser was marked infected | Summit mailbox gets a notice; the file stays blocked; ask the country for a clean copy |
| No emails | `logs app \| grep -i email`; SMTP settings; SPF/DKIM records; `mail.failed` in the audit log |
| 413 errors on upload | Proxy body size limit (section 3) |
