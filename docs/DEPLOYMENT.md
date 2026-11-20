# Deployment and operations manual: Water Investment Projects

Production address: **https://waterinvestmentprojects.org**
Code: **https://github.com/spareeth/waterinvestmentprojects** (private)
Host: Terra's Hetzner server in Germany (decided 18 Nov 2026, PLAN v0.3 section 0a and 5)

This manual takes a technical administrator from an empty folder on the server to a live, backed-up portal, and
then covers day-to-day operation and the close-out after the Summit. Commands are for Ubuntu or Debian with
`sudo`. Replace values in `<angle brackets>`.

## Contents

1. [Overview](#1-overview)
2. [Who does what](#2-who-does-what)
3. [Prepare the server](#3-prepare-the-server)
4. [Domain and DNS](#4-domain-and-dns)
5. [Get the code](#5-get-the-code)
6. [Configure the portal (.env)](#6-configure-the-portal-env)
7. [First start](#7-first-start)
8. [Reverse proxy and HTTPS](#8-reverse-proxy-and-https)
9. [Email from the Summit mailbox](#9-email-from-the-summit-mailbox)
10. [First admin and setting up the portal](#10-first-admin-and-setting-up-the-portal)
11. [Go-live checks](#11-go-live-checks)
12. [Backups and restore](#12-backups-and-restore)
13. [Routine operations](#13-routine-operations)
14. [Staging copy](#14-staging-copy)
15. [Security checklist](#15-security-checklist)
16. [After the Summit: export and close-out](#16-after-the-summit-export-and-close-out)
17. [Troubleshooting](#17-troubleshooting)
18. [Reference](#18-reference)

---

## 1. Overview

```
 browsers ──HTTPS──► reverse proxy on the server (already there: Caddy, nginx or Traefik)
                        │  TLS certificates, ports 80/443
                        ▼
                     127.0.0.1:APP_PORT (default 3200)
 ┌──────────── Docker Compose project "waterinvest" (compose.production.yml) ────────────┐
 │  app      Next.js web app, runs as user "node"                                         │
 │  db       PostgreSQL 16              volume pgdata   (accounts, projects, audit log)   │
 │  clamav   ClamAV virus scanner       volume clamdb   (virus signatures)                │
 │  migrate  applies database migrations, then exits (runs before every app start)        │
 │  tools    one-off jobs only: first admin, demo seed on staging                         │
 │  volume blobs   uploaded teaser files (PDF, PowerPoint)                                │
 └───────────────────────────────────────────────────────────────────────────────────────┘
 app ──SMTP (587, STARTTLS)──► mail provider ──► summit@waterinvestmentprojects.org
```

What to know before you start:

- **Only the app is reachable from outside the stack**, and only on `127.0.0.1`. The database and the scanner have
  no published ports. The reverse proxy is the only way in from the internet.
- **Every upload is virus scanned.** New teasers are stored as "being checked" and become viewable and publishable
  only after ClamAV has marked them clean. Infected files stay blocked and the Summit mailbox is told.
- **All data lives in three Docker volumes** on this server: `pgdata`, `blobs` and `clamdb` (the last one is only
  signatures and can be rebuilt). Backups (section 12) cover `pgdata` and `blobs`.
- **Settings and secrets live in one file**, `.env` next to `compose.production.yml`, readable by root only.
- **Data location:** Germany (EU). The 16 Nov email to the Summit group states this, and the government upload
  consent covers sharing with invited participants.

Resource needs for this stack: about **2.5 GB RAM** (ClamAV alone about 1.5 GB), 1 to 2 CPU cores, 10 GB disk
plus the uploads (about 30 teasers, well under 1 GB) and backups.

## 2. Who does what

| Task | Owner | Section |
|---|---|---|
| Server access, Docker, reverse proxy, firewall | Terra technical team | 3, 8 |
| Register `waterinvestmentprojects.org`, manage its DNS | Domain owner (to confirm: ECD/Terra) | 4 |
| Create the mailbox `summit@waterinvestmentprojects.org`, allow SMTP, DNS records for mail | Mail owner | 9 |
| Deploy, configure, first admin, backups | Terra technical team | 5, 6, 7, 10, 12 |
| Countries, focal points, upload links, investor accounts, publishing | Summit admins (GCFC/BCG/WBG) with Terra | 10 |
| Final acknowledgement wording, support mailbox, logos | WBG / GCFC / MoFA | 6, 10 |

## 3. Prepare the server

The server already runs other Terra services. **Check, do not change, what is already there.**

### 3.1 Check resources and what is running

```bash
lsb_release -a                     # Ubuntu or Debian release
nproc; free -h; df -h /            # CPU cores, free memory (need ~2.5 GB), free disk (need ~10 GB)
sudo ss -ltnp                      # ports in use: pick a free APP_PORT (default 3200)
sudo docker ps --format '{{.Names}}\t{{.Ports}}'   # existing containers
```

If free memory is short, ClamAV is the item to plan for; do not run the stack without it in production (uploads
would never become visible).

### 3.2 Docker Engine and the compose plugin

Check first:

```bash
docker --version && docker compose version     # need Compose v2.20 or later
```

If Docker is missing, install it from Docker's own repository (Ubuntu shown; for Debian replace `ubuntu` with
`debian`):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### 3.3 Firewall

Only SSH, HTTP and HTTPS should be open to the internet. Check the current rules before changing anything:

```bash
sudo ufw status verbose            # if ufw is used
```

If ufw is active and 80/443 are not yet allowed: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`. Also check the
Hetzner Cloud firewall in the Hetzner console if one is attached to the server. The app port (3200) must **not**
be opened: it listens on 127.0.0.1 only.

### 3.4 Time and updates

```bash
timedatectl                        # "System clock synchronized: yes" (sign-in sessions and audit times depend on it)
sudo apt-get install -y unattended-upgrades   # security updates for the host, if not already set up
```

## 4. Domain and DNS

At the domain registrar or DNS provider for `waterinvestmentprojects.org`:

| Type | Name | Value | Note |
|---|---|---|---|
| A | `@` | `<server IPv4>` | `curl -4 ifconfig.me` on the server shows it |
| AAAA | `@` | `<server IPv6>` | only if the server has IPv6 and the proxy listens on it |
| CNAME | `www` | `waterinvestmentprojects.org.` | the proxy redirects www to the main address |
| | | | Mail records: section 9.2 |

Check from any machine (changes can take minutes to a few hours):

```bash
dig +short waterinvestmentprojects.org A
dig +short www.waterinvestmentprojects.org
```

The reverse proxy can only obtain a TLS certificate once these records point at the server.

## 5. Get the code

The server reads the private repository with its own **read-only deploy key**, so no personal GitHub login is
stored on the server.

```bash
# 1. A key used only for this repository
sudo ssh-keygen -t ed25519 -N "" -C "waterinvest-deploy@$(hostname)" -f /root/.ssh/waterinvest_deploy
sudo cat /root/.ssh/waterinvest_deploy.pub
```

2. On GitHub: repository **Settings > Deploy keys > Add deploy key**, title `<server name>`, paste the key, leave
   **Allow write access** off. (Or from a machine where `gh` is signed in:
   `gh repo deploy-key add waterinvest_deploy.pub --repo spareeth/waterinvestmentprojects --title "<server>"`.)

```bash
# 3. Clone, and keep using the key for every later pull
sudo GIT_SSH_COMMAND="ssh -i /root/.ssh/waterinvest_deploy -o IdentitiesOnly=yes" \
  git clone git@github.com:spareeth/waterinvestmentprojects.git /opt/waterinvest
sudo git -C /opt/waterinvest config core.sshCommand "ssh -i /root/.ssh/waterinvest_deploy -o IdentitiesOnly=yes"
cd /opt/waterinvest && sudo git log --oneline -1
```

Without GitHub access from the server, copy a bundle instead: `git bundle create /tmp/waterinvest.bundle main` on
the development machine, `scp` it over, then `sudo git clone /tmp/waterinvest.bundle /opt/waterinvest`.

## 6. Configure the portal (.env)

```bash
cd /opt/waterinvest
sudo cp .env.production.example .env
sudo chmod 600 .env && sudo chown root:root .env
sudo nano .env
```

Generate secrets with `openssl rand -base64 32` (for `BETTER_AUTH_SECRET`) and `openssl rand -hex 24` (for the
database password: letters and digits only, so it can sit inside `DATABASE_URL` unchanged).

| Variable | Production value | Notes |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `waterinvest` | Prefix of containers and volumes. Never change it after the first start (the volumes carry this name). |
| `APP_PORT` | `3200` | Local port the proxy forwards to. Must be free (section 3.1). |
| `APP_NAME` | `Water Investment Projects` | Shown everywhere. Baked into the build. |
| `APP_URL` | `https://waterinvestmentprojects.org` | Exact public address, no trailing slash. Used for sign-in cookies, upload links and HSTS. Baked into the build. |
| `APP_ENV` | `production` | `staging` only on a test copy. |
| `SUPPORT_EMAIL` | `summit@waterinvestmentprojects.org` | Shared mailbox shown on the landing page and upload link. Empty hides the Contact section. Baked into the build. |
| `POSTGRES_USER`, `POSTGRES_DB` | `portal`, `summit_portal` | Leave as they are. |
| `POSTGRES_PASSWORD` | random, `openssl rand -hex 24` | Used when the database is first created. |
| `DATABASE_URL` | `postgresql://portal:<same password>@db:5432/summit_portal?schema=public` | Host is `db` (the service name), not localhost. |
| `BETTER_AUTH_SECRET` | random, `openssl rand -base64 32` | Signs sessions. Changing it later signs everyone out. |
| `SELF_REGISTRATION_ENABLED` | `false` | Accounts are handed out by admins (PLAN 0a.4). |
| `AUTH_SECOND_STEP` | `none` | Email and password only for now (PLAN 0a.3). `totp` switches on authenticator apps. |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | `120` / `12` | Sign-out after inactivity / after sign-in. |
| `INVESTOR_ACK_VERSION`, `INVESTOR_ACK_TEXT` | empty until WBG sends the wording | Set **both** together; a new version asks every investor again. Baked into the build. |
| `STORAGE_DRIVER` | `local` | Files in the `blobs` volume. |
| `UPLOAD_SCAN` | `clamav` | Required in production. `assume-clean` is refused when `APP_ENV=production`. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | `clamav`, `3310` | The scanner service. |
| `SCAN_SWEEP_SECONDS` | `60` | How often files still waiting are retried. |
| `MAIL_DRIVER` | `smtp` (or `log` until the mailbox works) | `log` writes emails to the app log instead of sending. |
| `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL` | `summit@waterinvestmentprojects.org` | Sender, and the Summit team mailbox told about every submission and meeting request. |
| `REQUEST_NOTIFY_FOCAL_POINTS`, `REQUEST_NOTIFY_INVESTOR` | `false` | Built but off until WBG decides (PLAN 0a.5). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | from the mail provider | Section 9. |
| `ALLOW_DEMO_SEED`, `SEED_DEMO_PASSWORD` | empty | Staging only. Never on production. |

Values marked "baked into the build" need `up -d --build` after a change; every other change only needs `up -d`.
The app checks the file at start-up and refuses to start with a clear message if something is wrong (section 17).

## 7. First start

```bash
cd /opt/waterinvest
sudo docker compose -f compose.production.yml up -d --build
```

What happens, in order (the first build takes 5 to 10 minutes):

1. The images are built (`waterinvest-app`, `waterinvest-tools`).
2. `db` starts and becomes healthy.
3. `migrate` creates all tables and exits.
4. `clamav` starts. On the very first start it may download signatures; it is "healthy" when ready.
5. `app` starts on `127.0.0.1:3200`.

Check:

```bash
sudo docker compose -f compose.production.yml ps
#   app      Up (healthy)        db  Up (healthy)        clamav  Up (healthy)   (migrate: Exited (0))
sudo docker compose -f compose.production.yml logs migrate | tail -5      # "All migrations have been successfully applied"
sudo docker compose -f compose.production.yml logs app | grep -E '\[(startup|scan|storage|auth)\]'
#   [auth] Sign-in asks for email and password only ...
#   [scan] Uploads are virus scanned by ClamAV at clamav:3310.
curl -sI http://127.0.0.1:3200/ | head -1                                  # HTTP/1.1 200 OK
```

"ClamAV is not reachable yet" in the app log during the first minutes is normal; uploads made then are scanned as
soon as ClamAV answers.

## 8. Reverse proxy and HTTPS

Find out what the server already uses:

```bash
sudo ss -ltnp | grep -E ':(80|443) '        # which process holds the web ports
sudo docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -E ':80->|:443->'   # proxy in a container?
```

Every proxy must: forward the domain to the app, allow **request bodies up to 64 MB** (teaser uploads), set
`X-Forwarded-For` (the app reads the **last** entry as the client address) and `X-Forwarded-Proto`, and redirect
`www` and plain http to `https://waterinvestmentprojects.org`. The app sends its own security headers; the proxy
does not need to add them.

### 8.1 Caddy installed on the server

Add to `/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`. Caddy obtains and renews the certificate itself.

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

### 8.2 nginx installed on the server

Create `/etc/nginx/sites-available/waterinvest`, link it into `sites-enabled`, `sudo nginx -t && sudo systemctl
reload nginx`, then get the certificate with
`sudo certbot --nginx -d waterinvestmentprojects.org -d www.waterinvestmentprojects.org --redirect`.

```nginx
server {
    listen 80;
    server_name waterinvestmentprojects.org www.waterinvestmentprojects.org;
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

After certbot, add a `server` block that redirects `www.waterinvestmentprojects.org` to the main address (certbot
offers this), and keep `client_max_body_size 64m;` in the `listen 443` block it creates.

### 8.3 Proxy running in a Docker container

A proxy inside a container cannot reach `127.0.0.1:3200` on the host. Connect it to the portal's network instead
and forward to the app container by name:

```bash
sudo docker network connect waterinvest_default <proxy-container-name>
```

Then use `waterinvest-app-1:3000` as the upstream (for Caddy: `reverse_proxy waterinvest-app-1:3000`). Add the
network to the proxy's own compose file as an external network so the connection survives a re-creation of the
proxy container:

```yaml
# in the proxy's compose file
services:
  caddy:                       # the proxy service
    networks: [default, waterinvest]
networks:
  waterinvest:
    external: true
    name: waterinvest_default
```

### 8.4 Check HTTPS

```bash
curl -sI https://waterinvestmentprojects.org | grep -iE '^(HTTP|strict-transport|content-security|x-frame)'
curl -sI http://waterinvestmentprojects.org | head -3         # 301/308 to https
curl -sI https://www.waterinvestmentprojects.org | head -3    # 301/308 to the main address
```

Optional external check: https://www.ssllabs.com/ssltest/ (aim for A).

## 9. Email from the Summit mailbox

The portal sends from `summit@waterinvestmentprojects.org` over SMTP. People read and answer that mailbox at the
provider (Outlook or webmail), not in the portal.

### 9.1 Mailbox and SMTP settings

| Provider | `SMTP_HOST` | `SMTP_PORT` / `SMTP_SECURE` | Password | Notes |
|---|---|---|---|---|
| Microsoft 365 | `smtp.office365.com` | `587` / `false` | mailbox password | **Authenticated SMTP must be switched on** for this mailbox (Microsoft 365 admin center > Users > the mailbox > Mail > Manage email apps > Authenticated SMTP). Tenant security defaults or policies may block it; Microsoft is also phasing out password-based SMTP, so confirm with the ECD tenant admin first. |
| Google Workspace | `smtp.gmail.com` | `587` / `false` | app password | Needs 2-Step Verification on the account, then an app password. |
| Zoho Mail | `smtp.zoho.eu` (EU data centre) or `smtp.zoho.com` | `587` / `false` | app-specific password if 2FA is on | Use the host of the data centre where the account was created. |

`SMTP_USER` is the full address `summit@waterinvestmentprojects.org`. Port 465 needs `SMTP_SECURE="true"`. Some
hosting providers block outgoing mail ports on new servers: if the test below times out, check the Hetzner
console for an outgoing-mail restriction (port 25 is blocked by default; 587 and 465 normally are not).

### 9.2 DNS records for mail

Copy the exact values from the provider's admin console. Typical records:

| Type | Name | Value (example) |
|---|---|---|
| MX | `@` | from the provider (e.g. `waterinvestmentprojects-org.mail.protection.outlook.com`, priority 0) |
| TXT (SPF) | `@` | `v=spf1 include:spf.protection.outlook.com -all` (M365), `include:_spf.google.com` (Google), `include:zoho.eu` (Zoho EU) |
| TXT or CNAME (DKIM) | provider-specific selector, e.g. `selector1._domainkey` | from the provider; then switch DKIM signing on there |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:summit@waterinvestmentprojects.org` |

Start DMARC with `p=none`; after a week of good reports, move to `p=quarantine`. Without SPF and DKIM, portal emails
land in spam. Only one SPF record may exist per domain: merge `include:` entries into a single record.

### 9.3 Switch on and test

```bash
cd /opt/waterinvest && sudo nano .env     # MAIL_DRIVER="smtp" and the SMTP_* values
sudo docker compose -f compose.production.yml up -d
```

Test: in the admin console create an upload link for a test country (section 10), open it in a private browser
window and submit a small PDF with your own email address as the uploader. You should receive a confirmation, and
the Summit mailbox a notice. If not:

```bash
sudo docker compose -f compose.production.yml logs app | grep -iE 'email|smtp' | tail -20
```

Every email is also recorded in the audit log as `mail.sent` or `mail.failed`. Delete the test country's project
afterwards, or keep the country switched off (section 16).

## 10. First admin and setting up the portal

### 10.1 First admin account

Accounts are handed out by admins (PLAN 0a.4), so the first one is created on the command line:

```bash
cd /opt/waterinvest
sudo docker compose -f compose.production.yml run --rm tools \
  npm run admin:create -- --email <name>@expocitydubai.ae --name "<Full Name>" --role PLATFORM_ADMIN
```

The temporary password is printed **once**. Pass it on personally. At first sign-in the person must choose their
own password. Use `--role SUMMIT_ADMIN` for a Summit team admin. Create everyone else in the admin console.

### 10.2 Order of work in the admin console

Sign in at `https://waterinvestmentprojects.org/sign-in` and open **Admin**.

1. **Accounts**: create the other admins (Terra platform admins, Summit admins from GCFC/BCG/WBG). Each gets a
   temporary password shown once; hand it over personally.
2. **Countries and contacts**: add or check the participating countries, their focal points and the WBG
   coordinator for each. A country that is switched off disappears from the pipeline and its upload link stops.
3. **Upload links**: create one link per country (or the generic link with a country drop-down) with an expiry date.
   The full link is shown once; send it to the country's focal point. Links can be revoked and replaced.
4. **Teaser submissions**: watch submissions arrive. Each file shows its scan status; clean files can be opened.
   The uploader becomes the country's focal point contact unless WBG named another person.
5. **Projects**: check titles and sectors, enter PPP model, size and development stage (one by one, or **Import**
   from the CSV that WBG prepares), then **publish**. Only published projects with a clean current teaser appear in
   the pipeline.
6. **Accounts > Bulk**: create country focal point and investor accounts from a CSV list, and hand out the
   temporary passwords (the list is shown once; keep it only as long as needed).
7. When WBG sends the investor acknowledgement wording: set `INVESTOR_ACK_VERSION` and `INVESTOR_ACK_TEXT` in `.env`
   and run `up -d --build`.
8. **Exports**: CSV exports of projects, submissions, contacts and meeting requests, and a per-country export, for
   the Summit team and for close-out.

## 11. Go-live checks

Run through this list after the first deployment and after every update. Tick each line.

| # | Check | Expected |
|---|---|---|
| 1 | `docker compose -f compose.production.yml ps` | app, db, clamav healthy; migrate exited (0) |
| 2 | `curl -sI https://waterinvestmentprojects.org` | 200, `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN` |
| 3 | http and www addresses | redirect to `https://waterinvestmentprojects.org` |
| 4 | Landing page | correct name, Summit date, support mailbox, no "Blue Pipeline", no demo data |
| 5 | Admin sign-in | works; first sign-in forces a new password |
| 6 | Upload link in a private window | form shows the country; WBG consent wording; PDF upload succeeds |
| 7 | Within a minute, Admin > Teaser submissions | file shows as clean |
| 8 | Emails | uploader confirmation and Summit mailbox notice arrive (not in spam) |
| 9 | Publish the test project; sign in as a test investor | investor acknowledgement, then the pipeline shows the teaser; view and download work |
| 10 | Request a bilateral meeting as the test investor | appears in the country inbox and in Admin > Exports |
| 11 | Backups | first manual run of `deploy/backup.sh` succeeds; archive present (section 12) |
| 12 | Clean up | test project withdrawn, test accounts deactivated, test country switched off |

## 12. Backups and restore

### 12.1 What the backup contains

`deploy/backup.sh` writes one archive per run to `/var/backups/waterinvest`: a checked PostgreSQL dump (all
accounts, projects, requests, audit log) and all uploaded files. It keeps 35 days, can encrypt the archives and can
copy them off the server. ClamAV signatures are not backed up (they download again).

### 12.2 Off-server copy (recommended): Hetzner Storage Box

1. In the Hetzner console, order or reuse a Storage Box and create a **sub-account** for this backup, with SSH
   enabled.
2. Give the server's root key access (Storage Boxes use port 23):

```bash
sudo test -f /root/.ssh/id_ed25519 || sudo ssh-keygen -t ed25519 -N "" -f /root/.ssh/id_ed25519
sudo cat /root/.ssh/id_ed25519.pub | ssh -p 23 <user>@<user>.your-storagebox.de install-ssh-key
sudo ssh -p 23 <user>@<user>.your-storagebox.de mkdir -p waterinvest
```

### 12.3 Encryption (recommended when copying off the server)

Generate a key pair **on a laptop, not on the server**, keep the private key in a password manager, and give the
server only the public key:

```bash
sudo apt-get install -y age            # on the server
age-keygen -o waterinvest-backup.key   # on a laptop; prints "Public key: age1..."
```

### 12.4 Install

```bash
sudo chmod 700 /opt/waterinvest/deploy/backup.sh
sudo BACKUP_REMOTE=<user>@<user>.your-storagebox.de:waterinvest BACKUP_AGE_RECIPIENT=<age1...> \
  /opt/waterinvest/deploy/backup.sh                     # first run by hand: prints "wrote ..." and "copied to ..."
sudo tee /etc/cron.d/waterinvest-backup >/dev/null <<'CRON'
30 2 * * * root BACKUP_REMOTE=<user>@<user>.your-storagebox.de:waterinvest BACKUP_AGE_RECIPIENT=<age1...> /opt/waterinvest/deploy/backup.sh >>/var/log/waterinvest-backup.log 2>&1
CRON
```

Check it ran: `tail /var/log/waterinvest-backup.log` and `ls -lh /var/backups/waterinvest`. During Summit week,
also run it by hand before and after big changes.

### 12.5 Restore

Restoring replaces the current data. Take a fresh backup first if the current state still matters.

```bash
cd /opt/waterinvest
mkdir -p /tmp/restore
# Encrypted archive: decrypt on a machine that has the private key, or copy the key over temporarily:
#   age -d -i waterinvest-backup.key -o waterinvest-<stamp>.tar.gz waterinvest-<stamp>.tar.gz.age
tar -C /tmp/restore -xzf /var/backups/waterinvest/waterinvest-<stamp>.tar.gz
sudo docker compose -f compose.production.yml stop app
sudo docker compose -f compose.production.yml exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < /tmp/restore/db.dump
sudo docker compose -f compose.production.yml run --rm -T --no-deps --entrypoint sh tools \
  -c 'tar -C /app/.data -xf -' < /tmp/restore/blobs.tar
sudo docker compose -f compose.production.yml start app
rm -rf /tmp/restore
```

**Restore test:** do this once on the staging copy (section 14) before the Summit, and record the date.

## 13. Routine operations

### 13.1 Update to a new version

```bash
cd /opt/waterinvest
sudo deploy/backup.sh                                   # always back up first
sudo git pull
sudo docker compose -f compose.production.yml up -d --build
sudo docker compose -f compose.production.yml ps        # then the quick checks in section 11 (1, 2, 4, 5)
```

Migrations run automatically before the new app starts. The site is briefly unavailable (seconds) while the app
container is replaced.

### 13.2 Roll back

```bash
cd /opt/waterinvest
sudo git log --oneline -5                               # find the previous good commit
sudo git checkout <commit>
sudo docker compose -f compose.production.yml up -d --build
```

Database migrations only go forward. If the bad version changed the database, restore the backup taken just
before the update (section 12.5) after checking out the old commit. Return to the latest version later with
`sudo git checkout main && sudo git pull`.

### 13.3 Logs, restarts, status

```bash
cd /opt/waterinvest
C="sudo docker compose -f compose.production.yml"
$C ps                                    # status of every service
$C logs -f --tail=100 app                # live app log (Ctrl+C to stop)
$C logs --tail=100 clamav
$C restart app                           # restart the app only
$C up -d                                 # apply .env changes (no rebuild)
$C up -d --build                         # apply code or baked-in setting changes
docker system df                         # disk used by images and volumes
sudo docker image prune -f               # remove old unused images after updates
```

The app log uses tags: `[startup]` (configuration), `[auth]`, `[scan]` (virus scan), `[storage]`, and email
errors. Personal data and email bodies are never written to the log.

### 13.4 Monitoring

- Container health: `docker compose ps` shows "unhealthy" if the app stops answering.
- External uptime check (recommended for Summit week): any monitoring service polling
  `https://waterinvestmentprojects.org/` every 5 minutes, alerting Terra by email.
- Disk: `df -h /` weekly; uploads are small, backups grow by one archive a day.

### 13.5 Account support

- **Forgotten password**: an admin opens **Admin > Accounts**, finds the person and issues a new temporary password
  (their sessions end; they choose a new password at next sign-in).
- **Someone leaves or should lose access**: deactivate the account in **Admin > Accounts**.
- **Locked out after failed attempts**: after 5 failed sign-ins within 15 minutes the address is blocked; the block
  lifts by itself once the failures are more than 15 minutes old. A new temporary password does not lift it sooner.

### 13.6 Secrets

- `BETTER_AUTH_SECRET`: change only if it may have leaked. Everyone is signed out.
- `POSTGRES_PASSWORD`: changing it in `.env` does not change the existing database user. If needed:
  `$C exec db psql -U portal -d summit_portal -c "ALTER USER portal PASSWORD '<new>';"`, then update both values
  in `.env` and `up -d`.
- `SMTP_PASSWORD`: update in `.env`, then `up -d`.

## 14. Staging copy

A second copy on the same server for demos, training and restore tests, with fictional data only.

```bash
sudo GIT_SSH_COMMAND="ssh -i /root/.ssh/waterinvest_deploy -o IdentitiesOnly=yes" \
  git clone git@github.com:spareeth/waterinvestmentprojects.git /opt/waterinvest-staging
sudo git -C /opt/waterinvest-staging config core.sshCommand "ssh -i /root/.ssh/waterinvest_deploy -o IdentitiesOnly=yes"
cd /opt/waterinvest-staging && sudo cp .env.production.example .env && sudo chmod 600 .env
```

In its `.env`: `COMPOSE_PROJECT_NAME=waterinvest-staging`, another `APP_PORT` (e.g. 3201), `APP_URL` set to the
staging host name (e.g. `https://staging.waterinvestmentprojects.org`, with its own DNS record and proxy entry),
`APP_ENV="staging"`, `MAIL_DRIVER="log"`, new secrets, and for demo data `ALLOW_DEMO_SEED="true"` and a private
`SEED_DEMO_PASSWORD` (at least 12 characters, shared with the demo team only). Then:

```bash
sudo docker compose -f compose.production.yml up -d --build
sudo docker compose -f compose.production.yml run --rm tools npx prisma db seed
```

Staging also needs about 2.5 GB of memory with its own ClamAV. Never put real country data on staging, and never
set `ALLOW_DEMO_SEED` on production.

## 15. Security checklist

Before real teasers are uploaded:

- [ ] `.env` is `600 root:root`; no copy of it anywhere else (not in chat, email or the repository).
- [ ] `APP_ENV="production"`, `UPLOAD_SCAN="clamav"`, `SELF_REGISTRATION_ENABLED="false"`, no `ALLOW_DEMO_SEED`.
- [ ] Only ports 22, 80 and 443 open to the internet; SSH by key only (`PasswordAuthentication no`).
- [ ] HTTPS works, http and www redirect, headers present (section 8.4).
- [ ] The deploy key on GitHub is read-only.
- [ ] Backups run nightly, are copied off the server and encrypted; one restore tested on staging.
- [ ] Every admin has changed their temporary password; no shared admin accounts.
- [ ] Test data removed (section 11, item 12).
- [ ] Recommended: an OWASP ZAP baseline scan against the site (`docker run --rm -t ghcr.io/zaproxy/zaproxy:stable
      zap-baseline.py -t https://waterinvestmentprojects.org`) and review of its warnings.

## 16. After the Summit: export and close-out

The portal's future after December is still to be agreed (PLAN v0.3, 0.14: WBG "retire end of 2026", GCFC "keep as a
pilot"). Whatever is decided:

1. **Export**: Admin > Exports: download the full CSV set (projects, submissions, contacts, meeting requests) and a
   per-country export for each country. The meeting request list doubles as the contact list after the Summit.
2. **Final backup**: run `deploy/backup.sh` and keep the archive per the agreement with the countries.
3. **Stop new activity**: revoke all upload links; switch countries off (their projects leave the pipeline);
   deactivate investor accounts, or keep them if the platform continues.
4. **Return or delete**: send each country its export if agreed. To delete everything on the server (only after
   the archive is confirmed and the decision is written down):

```bash
cd /opt/waterinvest
sudo docker compose -f compose.production.yml down -v     # removes containers AND all data volumes
```

5. Remove the DNS records or point them at a closing page; remove the proxy entry, the cron job
   (`/etc/cron.d/waterinvest-backup`) and the deploy key on GitHub.

## 17. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `app` restarts at once | invalid setting | `logs app`: `[startup] Refusing to start: <VARIABLE>: <reason>`; fix `.env`, `up -d` |
| `migrate` exited with an error | database not reachable or password mismatch | `DATABASE_URL` must use host `db` and the same password as `POSTGRES_PASSWORD` |
| 502 Bad Gateway from the proxy | app not running, wrong port, or proxy in a container (section 8.3) | `ps`, `curl -sI http://127.0.0.1:3200/` on the host |
| 413 Request Entity Too Large on upload | proxy body limit | 64 MB in the proxy (section 8) |
| Uploads stay "being checked" | ClamAV still starting or out of memory | `logs clamav`; `free -h`; `logs app \| grep scan` |
| A teaser was marked infected | the file failed the virus scan | It stays blocked; the Summit mailbox was told; ask the country for a clean copy |
| No emails | SMTP settings, provider blocks SMTP sign-in, outgoing port blocked | `logs app \| grep -i email`; section 9; `mail.failed` in the audit log |
| Emails in spam | SPF/DKIM/DMARC missing | section 9.2; check with https://www.mail-tester.com |
| Everyone signed out suddenly | `BETTER_AUTH_SECRET` changed | expected after a change |
| Name or address wrong on pages | baked-in setting changed without rebuild | `up -d --build` |
| Sign-in loops or cookies refused | `APP_URL` does not match the address in the browser | set `APP_URL` exactly, `up -d --build` |
| Disk full | backups or old images | `docker image prune -f`; check `/var/backups/waterinvest` and the retention |

## 18. Reference

### Files in the repository

| File | Purpose |
|---|---|
| `compose.production.yml` | the production/staging stack |
| `Dockerfile` | builds the `runner` (app) and `tools` images |
| `.env.production.example` | template for the server's `.env` |
| `deploy/clamav/clamd.conf` | scanner settings (file size limits) |
| `deploy/backup.sh` | nightly backup |
| `prisma/create-admin.ts` | `npm run admin:create` |
| `docs/PLAN.md` | scope and decisions |

### Command cheat sheet

```bash
cd /opt/waterinvest; C="sudo docker compose -f compose.production.yml"
$C up -d --build                 # deploy or update
$C ps                            # status
$C logs -f --tail=100 app        # app log
$C restart app                   # restart the app
$C run --rm tools npm run admin:create -- --email <e> --name "<n>" [--role SUMMIT_ADMIN]
sudo deploy/backup.sh            # backup now
$C down                          # stop everything (keeps data)
```
