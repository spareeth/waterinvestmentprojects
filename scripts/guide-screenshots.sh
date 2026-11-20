#!/usr/bin/env bash
# Retakes the user guide screenshots (public/user-guide/*.png) from the real screens with fictional demo data.
# Local development only. Needs: local PostgreSQL (npm run db:up), demo data (npm run db:seed) and a production
# build (npm run build). Usage: npm run guide:screenshots

set -euo pipefail
cd "$(dirname "$0")/.."

LINK_ID="guide-screenshot-link"
sql() { docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U portal -d summit_portal "$@"; }

# A temporary upload link for fictional Country A, so the upload form can be shown. Only its hash is stored.
# Same shape as real tokens: 32 random bytes, base64url, 43 characters.
token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
hash="$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)"
cleanup() { sql -c "DELETE FROM \"UploadLink\" WHERE id = '$LINK_ID';" || true; }
trap cleanup EXIT
cleanup
sql -c "INSERT INTO \"UploadLink\" (id, \"countryId\", \"tokenHash\", \"expiresAt\", \"createdById\", \"createdAt\")
        VALUES ('$LINK_ID', 'seed-country-a', '$hash', now() + interval '1 day', 'seed-user-summit-admin', now());"

mkdir -p public/user-guide
GUIDE_UPLOAD_TOKEN="$token" \
GUIDE_PASSWORD="${SEED_DEMO_PASSWORD:-Local-demo-only-2026}" \
  npx playwright test -c playwright.guide.config.ts "$@"
