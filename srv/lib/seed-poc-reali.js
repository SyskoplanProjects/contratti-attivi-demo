// Popola l'app con i dati reali del POC (cartella locale "POC Contratti_ER_0408"): template
// CGC ICT DORA reale + contratti reali (Appian, Pegaso 2000, Nomios, Deda Credit). Sostituisce
// lo scenario sintetico di seed-demo.js con documenti veri passati per la pipeline reale
// (previewImportAI/confirmImportAI per il template, calcolaCoverage/confirmCoverage per i
// contratti) cosi' testoOriginale/contenutoOriginale/metadati sono autentici, non inventati.
// Idempotente: se template/contratto con lo stesso nome esiste gia', lo salta.
//
// I documenti sorgente (PDF/docx di contratti bancari reali ICCREA/BCC) NON sono nel repo —
// dato cliente sensibile, non deve finire su GitHub. Lo script legge da POC_DIR (default:
// path locale di sviluppo), da rieseguire su qualunque macchina abbia quella cartella.
//
// Uso locale (server gia' avviato):
//   node srv/lib/seed-poc-reali.js
//
// Uso contro BTP (dopo `cf deploy`), auth XSUAA — basic non funziona contro xsuaa, serve un
// bearer token. Un modo pratico per ottenerlo con un service-key CAP-friendly (technical user):
//   cf create-service-key contratti-attivi-auth seed-key
//   cf service-key contratti-attivi-auth seed-key   # -> uaa.url, clientid, clientsecret
//   TOKEN=$(curl -s "$UAA_URL/oauth/token" -u "$CLIENTID:$CLIENTSECRET" \
//     -d "grant_type=client_credentials" | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
//   BASE_URL=https://<app-route-srv-api> AUTH_TOKEN=$TOKEN POC_DIR="/path/locale/POC Contratti_ER_0408" \
//     node srv/lib/seed-poc-reali.js
//
// Il token client-credentials non porta un ruolo utente CAP (Utente/Revisore) a meno che il
// client XSUAA non abbia gia' quei ruoli attribuiti staticamente: se le action rispondono 403,
// serve invece un JWT utente reale (login OAuth interattivo) — fuori scope automatizzare qui.

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4004';
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
const AUTH_USER = process.env.AUTH_USER || 'mario.rossi@contrattiattivi.it';
const AUTH_PASS = process.env.AUTH_PASS || 'test';
const AUTH_HEADER = AUTH_TOKEN
  ? `Bearer ${AUTH_TOKEN}`
  : 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');
const AUTH_HEADER_REVISORE = AUTH_TOKEN
  ? AUTH_HEADER // in produzione il ruolo Revisore va attribuito al token stesso, non c'e' un secondo utente hardcoded
  : 'Basic ' + Buffer.from('revisore@contrattiattivi.it:test').toString('base64');

const POC_DIR = process.env.POC_DIR || '/Users/emiliocasella/Desktop/POC Contratti_ER_0408';
const TEMPLATE_DOCX = path.join(POC_DIR, '02. Standard Contrattuali', 'CGC PASSIVE ICT DORA_Accettazione_30.04.2025.docx');
const CONTRATTI_DIR = path.join(POC_DIR, '03. Contratti da analizzare', 'a. Contratti SAP', 'Contratti ICT');

// ADAM S.r.l. (entrambe le varianti, fascicolo unito e versione SAP pulita) esclusa: la
// segmentazione AI su questi documenti (~500K caratteri) produce una clausola troppo lunga per
// l'embedding (limite 8192 token per singolo input di text-embedding-3-small), calcolaCoverage
// risponde 400. Bug latente della pipeline su documenti molto grandi/mal delimitati, non
// specifico a questo file — da fixare separatamente (chunking pre-embedding) se serve includerla.
// "Addendum AQ 4700001202 Deloitte.pdf" esclusa: PDF scansionato, zero testo estraibile (niente
// OCR in pipeline).
const CONTRATTI_REALI = [
  {
    filename: '4200098689 PEGASO 2000 SRL_.pdf',
    intestatarioFinale: 'Pegaso 2000 S.r.l.',
    statoFinale: 'IN_REVISIONE',
    responsabile: 'anna.bianchi@contrattiattivi.it'
  },
  {
    filename: '4200234954 NOMIOS ITALY SPA - signed.pdf',
    intestatarioFinale: 'Nomios Italy S.p.A.',
    statoFinale: 'APPROVATO',
    responsabile: 'luigi.verdi@contrattiattivi.it'
  },
  {
    filename: 'Accordo Quadro Dedacredit BCC Sinergia 4700002036_signed (1).pdf',
    intestatarioFinale: 'Deda Credit S.r.l.',
    statoFinale: 'BOZZA',
    responsabile: 'mario.rossi@contrattiattivi.it'
  }
];

async function api(pathSeg, options = {}, headerAuth = AUTH_HEADER) {
  const resp = await fetch(`${BASE_URL}${pathSeg}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: headerAuth, ...options.headers }
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`${options.method || 'GET'} ${pathSeg} -> HTTP ${resp.status}: ${text.slice(0, 1000)}`);
    err.status = resp.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function trovaTemplatePerNome(nome) {
  const data = await api(`/contratti/Template?$filter=nome eq '${nome.replace(/'/g, "''")}'`);
  return data.value[0] || null;
}

async function trovaContrattoPerIntestatario(intestatario) {
  const data = await api(`/contratti/Contratto?$filter=intestatario eq '${intestatario.replace(/'/g, "''")}'`);
  return data.value[0] || null;
}

async function portaAlloStato(contrattoID, statoFinale) {
  if (statoFinale === 'BOZZA') return;
  await api('/contratti/inviaARevisione', { method: 'POST', body: JSON.stringify({ contrattoID }) });
  if (statoFinale === 'IN_REVISIONE') return;
  const revisioni = await api(`/contratti/Revisione?$filter=contratto_ID eq ${contrattoID}&$orderby=dataInvio desc`);
  const revisione = revisioni.value[0];
  await api('/contratti/approvaRevisione', { method: 'POST', body: JSON.stringify({ revisioneID: revisione.ID }) }, AUTH_HEADER_REVISORE);
  if (statoFinale === 'APPROVATO') return;
  await api(`/contratti/Contratto(${contrattoID})`, { method: 'PATCH', body: JSON.stringify({ stato: 'FIRMATO' }) });
}

async function importaTemplate() {
  const nomeFile = path.basename(TEMPLATE_DOCX);
  const esistente = await trovaTemplatePerNome(nomeFile);
  if (esistente) {
    console.log(`Template già presente: "${nomeFile}" (${esistente.ID})`);
    return esistente.ID;
  }
  if (!fs.existsSync(TEMPLATE_DOCX)) {
    throw new Error(`Template CGC non trovato: ${TEMPLATE_DOCX} (POC_DIR corretto?)`);
  }

  const buf = fs.readFileSync(TEMPLATE_DOCX);
  const form = new FormData();
  form.append('file', new Blob([buf]), nomeFile);

  const previewResp = await fetch(`${BASE_URL}/contratti/previewImportAI`, {
    method: 'POST', headers: { Authorization: AUTH_HEADER }, body: form
  });
  const previewText = await previewResp.text();
  if (!previewResp.ok) throw new Error(`previewImportAI fallito: HTTP ${previewResp.status}: ${previewText.slice(0, 1000)}`);
  const preview = JSON.parse(previewText);

  const confirm = await api('/contratti/confirmImportAI', {
    method: 'POST', body: JSON.stringify({ previewID: preview.previewID, clausole: preview.clausole })
  });
  console.log(`Template creato: "${nomeFile}" (${confirm.templateID}), ${preview.clausole.length} clausole`);
  return confirm.templateID;
}

async function importaContratto(dati, templateID) {
  const esistente = await trovaContrattoPerIntestatario(dati.intestatarioFinale);
  if (esistente) {
    console.log(`Contratto già presente: "${dati.intestatarioFinale}" (${esistente.ID})`);
    return;
  }
  if (!fs.existsSync(path.join(CONTRATTI_DIR, dati.filename))) {
    console.error(`File non trovato, salto: ${dati.filename} (POC_DIR corretto?)`);
    return;
  }

  const buf = fs.readFileSync(path.join(CONTRATTI_DIR, dati.filename));
  const fileBase64 = buf.toString('base64');

  const coverage = await api('/comparator/calcolaCoverage', {
    method: 'POST', body: JSON.stringify({ templateID, file: fileBase64, filename: dati.filename })
  });
  const confirm = await api('/comparator/confirmCoverage', {
    method: 'POST',
    body: JSON.stringify({ previewID: coverage.previewID, clausole: coverage.clausole, allegati: [], metadati: [] })
  });

  await api(`/contratti/Contratto(${confirm.ID})`, {
    method: 'PATCH', body: JSON.stringify({ intestatario: dati.intestatarioFinale })
  });
  await portaAlloStato(confirm.ID, dati.statoFinale);
  await api(`/contratti/Contratto(${confirm.ID})`, {
    method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile })
  });
  console.log(`Contratto creato: "${dati.intestatarioFinale}" (${confirm.ID}) -> ${dati.statoFinale}`);
}

async function main() {
  console.log(`POC_DIR: ${POC_DIR}`);
  console.log(`BASE_URL: ${BASE_URL} (auth: ${AUTH_TOKEN ? 'bearer' : 'basic'})`);

  const templateID = await importaTemplate();

  for (const dati of CONTRATTI_REALI) {
    try {
      await importaContratto(dati, templateID);
    } catch (e) {
      console.error(`Errore su "${dati.filename}": ${e.message || e}`);
    }
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

module.exports = { main };
