const openai = require('../modules/openai-module');

// Stesso pattern di embedding-utils.js (JSON.stringify di un singolo vettore su LargeString),
// applicato al testo dell'intero documento invece che a una singola clausola.
async function computeDocumentoEmbedding(clausole) {
  if (!clausole || !clausole.length) return null;
  const testo = clausole.map(c => c.testo).join('\n');
  if (!testo.trim()) return null;
  try {
    const [vettore] = await openai.embeddings([testo]);
    return vettore ? JSON.stringify(vettore) : null;
  } catch (e) {
    console.warn('[template-embedding] calcolo embeddingDocumento fallito:', e.message);
    return null;
  }
}

module.exports = { computeDocumentoEmbedding };
