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
KEY_RAW=$(cf service-key "$AUTH_SERVICE" "$AUTH_KEY")
KEY_JSON=$(echo "$KEY_RAW" | sed -n '/^{/,/^}/p')
if [ -z "$KEY_JSON" ]; then
  echo "Non trovo JSON nell'output di 'cf service-key $AUTH_SERVICE $AUTH_KEY':" >&2
  echo "$KEY_RAW" >&2
  exit 1
fi
UAA_URL=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).credentials.url")
CLIENTID=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).credentials.clientid")
CLIENTSECRET=$(echo "$KEY_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).credentials.clientsecret")
if [ -n "${SEED_USER:-}" ] && [ -n "${SEED_PASS:-}" ]; then
  # password grant: porta gli scope Utente/Revisore assegnati all'utente via role-collection.
  # client_credentials invece NON li porta (le role-collection si assegnano a utenti, non a client) -> 403.
  AUTH_TOKEN=$(curl -sf "$UAA_URL/oauth/token" -u "$CLIENTID:$CLIENTSECRET" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "username=$SEED_USER" \
    --data-urlencode "password=$SEED_PASS" \
    --data-urlencode "response_type=token" | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
else
  echo "SEED_USER/SEED_PASS non settate: uso client_credentials, le action protette da @requires('Utente'/'Revisore') risponderanno 403." >&2
  echo "Assegna le role-collection ContrattiAttivi_Utente/ContrattiAttivi_Revisore a un utente reale via BTP Cockpit, poi rilancia con SEED_USER/SEED_PASS." >&2
  AUTH_TOKEN=$(curl -sf "$UAA_URL/oauth/token" -u "$CLIENTID:$CLIENTSECRET" -d "grant_type=client_credentials" | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
fi

echo "BASE_URL=$BASE_URL"
echo "POC_DIR=$POC_DIR"
BASE_URL="$BASE_URL" AUTH_TOKEN="$AUTH_TOKEN" POC_DIR="$POC_DIR" node srv/lib/seed-poc-reali.js
