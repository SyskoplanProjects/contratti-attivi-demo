const path = require('path');
const fs = require('fs');
const { connectDb } = require('./connect-db');

const NAMESPACE = 'com.reply.contrattiattivi';
const CSV_PATH = path.join(__dirname, '..', '..', 'db', 'data', 'fornitori.csv');

function parseCsv(text) {
  const rows = [];
  let cur = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      cur.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      if (cur.some(v => v.trim() !== '')) rows.push(cur);
      cur = []; field = '';
    } else field += c;
  }
  if (field !== '' || cur.length) { cur.push(field); if (cur.some(v => v.trim() !== '')) rows.push(cur); }
  return rows;
}

function parseDate(v) {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return null;
}

function clean(row) {
  const s = (i) => { const v = row[i] !== undefined ? row[i].trim() : ''; return v === '' ? null : v; };
  return {
    idSapFornitore: s(2),
    codiceAteco: s(0),
    rischioEmissioni: s(1),
    nomeFornitore: s(3),
    codiceFiscale: s(4),
    dataAttivazione: parseDate(s(5)),
    numAddetti: s(6) === null ? null : (function () {
      var n = parseInt(s(6), 10);
      return isNaN(n) ? null : n;
    })(),
    cgsScore: s(7),
    fatturatoTot: s(8) === null ? null : (function () {
      var v = String(s(8)).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
      var n = v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v);
      return n === null ? null : n;
    })(),
    annoFatturatoTot: s(9),
    protesti: s(10),
    pregiudizievoli: s(11),
    scoreVendorRating: s(12)
  };
}

// Fornitori dei contratti reali POC (seed-poc-reali.js) assenti dal CSV infoprovider: nome
// esatto uguale a CONTRATTI_REALI[].intestatarioFinale per matchare senza ambiguità (vedi
// backfill-dashboard-vendor.js). Nessun dato di arricchimento inventato: solo idSapFornitore
// (placeholder, non un vero ID SAP) e nomeFornitore, resto lasciato null.
// Nomios Italy S.p.A. e Deda Credit S.r.l. NON sono qui: esistono già nel CSV (rispettivamente
// "NOMIOS ITALY SPA" e "Deda Credit Srl"), il match falliva solo per punteggiatura/forma
// societaria, risolto da normalizzaNome in backfill-dashboard-vendor.js.
const FORNITORI_POC = [
  { idSapFornitore: 'POC-0002', nomeFornitore: 'Pegaso 2000 S.r.l.' }
];

async function seed(cds) {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv).slice(1);
  const { Fornitore } = cds.entities(NAMESPACE);
  await cds.ql.DELETE.from(Fornitore);
  const hasAllFields = (r) =>
    r.idSapFornitore && r.codiceAteco && r.rischioEmissioni && r.nomeFornitore &&
    r.codiceFiscale && r.dataAttivazione !== null && r.numAddetti !== null &&
    r.cgsScore && r.fatturatoTot !== null && r.annoFatturatoTot &&
    r.protesti && r.pregiudizievoli && r.scoreVendorRating;
  const entries = rows.map(clean).filter(hasAllFields).concat(FORNITORI_POC);
  await cds.ql.INSERT.into(Fornitore).entries(entries);
  console.log(`Fornitori importati: ${entries.length} (incl. ${FORNITORI_POC.length} POC)`);
  return entries.length;
}

async function main() {
  const cds = require('@sap/cds');
  const csn = await cds.load(path.join(__dirname, '..', '..', 'db', 'schema.cds'));
  cds.model = csn;
  await connectDb(cds);
  await seed(cds);
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { seed, main, parseCsv };