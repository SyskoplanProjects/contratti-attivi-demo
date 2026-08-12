#!/usr/bin/env bash
# Punto 4: node srv/lib/seed-esempi-classificazione.js da BAS, connessione DB diretta a hana.
# Richiede: setup.sh gia' girato (cds bind fatto), OPENAI_API_KEY esportata dal chiamante.
set -euo pipefail
cd "$(dirname "$0")/../.."

POC_DIR="${1:?Uso: $0 <path-cartella-POC-nel-workspace-BAS>}"
[ -d "$POC_DIR" ] || { echo "POC_DIR non trovato: $POC_DIR" >&2; exit 1; }
: "${OPENAI_API_KEY:?export OPENAI_API_KEY prima di girare lo script}"

echo "POC_DIR=$POC_DIR"
POC_DIR="$POC_DIR" cds bind --exec -- node srv/lib/seed-esempi-classificazione.js
