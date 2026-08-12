const cds = require('@sap/cds');
const { connectDb } = require('./connect-db');
const path = require('path');
const { prossimoCodiceContratto } = require('./codice-contratto');

const NS = 'com.reply.contrattiattivi';

// Forme societarie ignorate nel match: "Deda Credit Srl" (CSV fornitori) vs "Deda Credit S.r.l."
// (intestatario da contratto reale) sono la stessa azienda ma non matchano per punteggiatura.
const FORME_SOCIETARIE = ['srl', 'spa', 'sa', 'gmbh', 'ltd', 'llc', 'inc', 'plc', 'nv', 'bv'];

function normalizzaNome(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(w => w && !FORME_SOCIETARIE.includes(w))
    .join(' ')
    .trim();
}

function matchFornitore(nomeFornitore, intestatario) {
  const a = normalizzaNome(nomeFornitore);
  const b = normalizzaNome(intestatario);
  if (!a || !b) return false;
  return a === b || b.indexOf(a) !== -1 || a.indexOf(b) !== -1;
}

async function backfill(cds) {
  const { Fornitore, Contratto } = cds.entities(NS);
  const fornitori = await SELECT.from(Fornitore);
  const fornitoriIds = new Set(fornitori.map(f => f.ID));
  // fornitore_ID orfano (punta a un Fornitore cancellato/reseedato) va rematchato come i NULL,
  // altrimenti resta silenziosamente rotto: la query originale filtrava solo IS NULL.
  const tuttiContratti = await SELECT.from(Contratto).columns('ID', 'intestatario', 'fornitore_ID');
  const senzaFor = tuttiContratti.filter(c => !c.fornitore_ID || !fornitoriIds.has(c.fornitore_ID));
  let matchati = 0;
  for (const c of senzaFor) {
    const f = fornitori.find(x => matchFornitore(x.nomeFornitore, c.intestatario));
    if (f) {
      await UPDATE(Contratto, c.ID).with({ fornitore_ID: f.ID });
      matchati++;
    }
  }
  const senzaCodice = await SELECT.from(Contratto).where({ codice: null });
  for (const c of senzaCodice) {
    await UPDATE(Contratto, c.ID).with({ codice: await prossimoCodiceContratto(cds.db) });
  }
  return { matchati, codici: senzaCodice.length };
}

async function main() {
  const csn = await cds.load(path.join(__dirname, '..', '..', 'db', 'schema.cds'));
  cds.model = csn;
  await connectDb(cds);
  const res = await backfill(cds);
  console.log('Backfill:', JSON.stringify(res));
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { backfill, matchFornitore, main };