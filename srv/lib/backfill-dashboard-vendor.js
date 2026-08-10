const cds = require('@sap/cds');
const path = require('path');
const { prossimoCodiceContratto } = require('./codice-contratto');

const NS = 'com.reply.contrattiattivi';

function matchFornitore(nomeFornitore, intestatario) {
  if (!nomeFornitore || !intestatario) return false;
  const a = String(nomeFornitore).trim().toLowerCase();
  const b = String(intestatario).trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.indexOf(a) !== -1 || a.indexOf(b) !== -1;
}

async function backfill(cds) {
  const { Fornitore, Contratto } = cds.entities(NS);
  const fornitori = await SELECT.from(Fornitore);
  const senzaFor = await SELECT.from(Contratto).where({ fornitore_ID: null });
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
  await cds.connect.to('db');
  const res = await backfill(cds);
  console.log('Backfill:', JSON.stringify(res));
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { backfill, matchFornitore, main };