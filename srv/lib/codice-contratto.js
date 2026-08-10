const cds = require('@sap/cds');

const NS = 'com.reply.contrattiattivi';

async function prossimoCodiceContratto(tx) {
  const { Contratto } = cds.entities(NS);
  const rows = await tx.run(SELECT.from(Contratto).where(`codice like 'CONTR-%'`).columns('codice'));
  let max = 0;
  for (const r of rows) {
    const m = /^CONTR-(\d+)$/.exec(r.codice || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'CONTR-' + String(max + 1).padStart(4, '0');
}

module.exports = { prossimoCodiceContratto };