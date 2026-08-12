#!/usr/bin/env bash
# Setup una tantum su BAS per girare seed-poc-reali.sh e seed-esempi-classificazione.sh.
# Richiede: cf CLI loggato (cf login) e targato su org/space giusti, cds-dk installato.
set -euo pipefail

HANA_INSTANCE="${HANA_INSTANCE:-contratti-attivi-db}"
AUTH_SERVICE="${AUTH_SERVICE:-contratti-attivi-auth}"
AUTH_KEY="${AUTH_KEY:-seed-key}"

echo "== cds bind per $HANA_INSTANCE (connessione DB diretta da BAS) =="
cds bind -2 "$HANA_INSTANCE"

echo "== service-key XSUAA per token OAuth (punto 2) =="
if cf service-key "$AUTH_SERVICE" "$AUTH_KEY" >/dev/null 2>&1; then
  echo "service-key $AUTH_KEY gia' esistente, riuso."
else
  cf create-service-key "$AUTH_SERVICE" "$AUTH_KEY"
fi

echo "Setup completo. Ora puoi girare:"
echo "  scripts/bas/seed-poc-reali.sh <path-cartella-POC>"
echo "  OPENAI_API_KEY=... scripts/bas/seed-esempi-classificazione.sh <path-cartella-POC>"
