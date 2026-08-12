const cds = require('@sap/cds');
const { connectDb } = require('./connect-db');
const path = require('path');

async function main() {
  const csn = await cds.load(path.join(__dirname, '..', '..', 'db', 'schema.cds'));
  cds.model = csn;
  const db = await connectDb(cds);

  const ClausolaVersione = 'com.reply.contrattiattivi.ClausolaVersione';

  const versioni = await db.run(
    SELECT.from(ClausolaVersione).where(`embedding IS NULL`)
  );
  console.log('Trovate ' + versioni.length + ' ClausolaVersione senza embedding');

  const openai = require('../modules/openai-module');

  let ok = 0, fail = 0;
  for (const v of versioni) {
    try {
      const embed = await openai.embeddings([v.testo]);
      if (embed && embed.length > 0) {
        await db.run(
          UPDATE(ClausolaVersione, v.ID).with({ embedding: JSON.stringify(embed[0]) })
        );
      }
      ok++;
      if (ok % 10 === 0) console.log('Processate ' + ok + '/' + versioni.length);
    } catch (e) {
      console.warn('FAIL ' + v.ID + ': ' + e.message);
      fail++;
    }
  }
  console.log('Completato. OK: ' + ok + ' FAIL: ' + fail);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
