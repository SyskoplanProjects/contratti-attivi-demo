const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { TIPOLOGIE_ALLEGATO, SOGLIA_TIPO_ALLEGATO } = require('./tipologie-allegato');

let _embeddingsRiferimentoCache = null;

async function _embeddingsRiferimento() {
  if (!_embeddingsRiferimentoCache) {
    // Filter out entries without testoRiferimento to avoid sending undefined/null to OpenAI API
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const testi = conRiferimento.map(t => t.testoRiferimento);
    const vettori = await openai.embeddings(testi);
    _embeddingsRiferimentoCache = conRiferimento.map((t, i) => ({ ...t, embedding: vettori[i] }));
  }
  return _embeddingsRiferimentoCache;
}

async function _classificaConLLM(testo) {
  const categorie = TIPOLOGIE_ALLEGATO.map(t => `${t.key}: ${t.label}`).join('\n');
  const systemPrompt = `Sei un classificatore di documenti amministrativi/contrattuali. ` +
    `Data una delle seguenti categorie, oppure "ALTRO" se nessuna è pertinente, rispondi in JSON con { "tipo": "<CHIAVE>", "confidenza": <0-1> }.\nCategorie:\n${categorie}\nALTRO: nessuna delle precedenti`;
  try {
    const risposta = await openai.chatJSON(systemPrompt, testo.slice(0, 6000));
    const chiaviValide = new Set([...TIPOLOGIE_ALLEGATO.map(t => t.key), 'ALTRO']);
    if (risposta && chiaviValide.has(risposta.tipo)) {
      return { tipo: risposta.tipo, confidenza: typeof risposta.confidenza === 'number' ? risposta.confidenza : null, metodoRiconoscimento: 'llm' };
    }
  } catch (e) {
    console.warn('[allegato-classifier] fallback LLM fallito:', e.message);
  }
  return { tipo: 'ALTRO', confidenza: null, metodoRiconoscimento: 'llm' };
}

async function classificaAllegato(testo) {
  if (!testo || !testo.trim()) return { tipo: 'ALTRO', confidenza: null, metodoRiconoscimento: 'nessuno' };

  const riferimenti = await _embeddingsRiferimento();
  const [embeddingTesto] = await openai.embeddings([testo]);

  let bestSim = 0, bestKey = null;
  for (const rif of riferimenti) {
    const sim = cosineSimilarity(embeddingTesto, rif.embedding);
    if (sim > bestSim) { bestSim = sim; bestKey = rif.key; }
  }
  bestSim = Math.round(bestSim * 10000) / 10000;

  if (bestSim >= SOGLIA_TIPO_ALLEGATO) {
    return { tipo: bestKey, confidenza: bestSim, metodoRiconoscimento: 'embedding' };
  }
  return _classificaConLLM(testo);
}

module.exports = { classificaAllegato };
