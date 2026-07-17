const cds = require('@sap/cds');
const openai = require('../modules/openai-module');

async function computeAndSaveEmbedding(clausolaVersioneID, testo) {
  if (!testo || testo.trim().length === 0) return;
  const embedding = await openai.embeddings([testo]);
  if (!embedding || embedding.length === 0) return;
  const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  await UPDATE(ClausolaVersione, clausolaVersioneID).with({
    embedding: JSON.stringify(embedding[0])
  });
}

module.exports = { computeAndSaveEmbedding };
