const cds = require('@sap/cds');
const { computeDocumentoEmbedding } = require('./template-embedding');

async function main() {
  await cds.connect.to('db');
  const { TemplateVersion, TemplateVersionClausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');

  const versioni = await SELECT.from(TemplateVersion).where({ embeddingDocumento: null });
  console.log(`TemplateVersion senza embeddingDocumento: ${versioni.length}`);

  let ok = 0, falliti = 0;
  for (const versione of versioni) {
    try {
      const righe = await SELECT.from(TemplateVersionClausola).where({ templateVersion_ID: versione.ID }).orderBy('ordine');
      const clausole = [];
      for (const r of righe) {
        const cv = await SELECT.one.from(ClausolaVersione, r.clausolaVersione_ID);
        if (cv) clausole.push({ testo: cv.testo });
      }
      const embeddingDocumento = await computeDocumentoEmbedding(clausole);
      if (embeddingDocumento) {
        await UPDATE(TemplateVersion, versione.ID).with({ embeddingDocumento });
        ok++;
      }
    } catch (e) {
      console.warn(`[backfill-template-embeddings] fallito per ${versione.ID}:`, e.message);
      falliti++;
    }
  }
  console.log(`Completato: ${ok} aggiornate, ${falliti} fallite.`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { main };
