#!/usr/bin/env bash
# Punto 2: node srv/lib/seed-poc-reali.js da BAS, contro app gia' deployata.
# Richiede: setup.sh gia' girato (service-key contratti-attivi-auth/seed-key esistente).
set -euo pipefail
cd "$(dirname "$0")/../.."

SRV_APP="${SRV_APP:-contratti-attivi-srv}"
AUTH_SERVICE="${AUTH_SERVICE:-contratti-attivi-auth}"
AUTH_KEY="${AUTH_KEY:-seed-key}"

POC_DIR="${1:?Uso: $0 <path-cartella-POC-nel-workspace-BAS>}"
[ -d "$POC_DIR" ] || { echo "POC_DIR non trovato: $POC_DIR" >&2; exit 1; }

echo "Route $SRV_APP..."
BASE_URL="https://$(cf app "$SRV_APP" | awk '/^routes:/{print $2; exit}')"
[ -n "$BASE_URL" ] && [ "$BASE_URL" != "https://" ] || { echo "Route non trovata per $SRV_APP, controlla 'cf app $SRV_APP'" >&2; exit 1; }

echo "Token OAuth da service-key $AUTH_SERVICE/$AUTH_KEY..."
KEY_JSON=$(cf service-key "$AUTH_SERVICE" "$AUTH_KEY" | tail -n +2)
UAA_URL=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).url")
CLIENTID=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).clientid")
CLIENTSECRET=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).clientsecret")
AUTH_TOKEN=$(curl -sf "$UAA_URL/oauth/token" -u "$CLIENTID:$CLIENTSECRET" -d "grant_type=client_credentials" | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")

echo "BASE_URL=$BASE_URL"
echo "POC_DIR=$POC_DIR"
BASE_URL="$BASE_URL" AUTH_TOKEN="$AUTH_TOKEN" POC_DIR="$POC_DIR" node srv/lib/seed-poc-reali.js
