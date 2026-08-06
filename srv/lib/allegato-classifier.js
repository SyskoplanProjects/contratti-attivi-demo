const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { TIPOLOGIE_ALLEGATO, SOGLIA_TIPO_ALLEGATO } = require('./tipologie-allegato');
const { caricaEsempi } = require('./classificazione-esempi');

let _embeddingsRiferimentoCache = null;

async function _embeddingsRiferimento() {
  if (!_embeddingsRiferimentoCache) {
    // Filter out entries without testoRiferimento to avoid sending undefined/null to OpenAI API
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const testi = conRiferimento.map(t => t.testoRiferimento);
    const vettori = await openai.embeddings(testi);
    _embeddingsRiferimentoCache = conRiferimento.map((t, i) => ({ key: t.key, embedding: vettori[i] }));
  }
  return _embeddingsRiferimentoCache;
}

async function _poolEmbeddings() {
  const [statici, esempi] = await Promise.all([_embeddingsRiferimento(), caricaEsempi()]);
  return [...statici, ...esempi];
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

  const pool = await _poolEmbeddings();
  const [embeddingTesto] = await openai.embeddings([testo]);

  let bestSim = 0, bestKey = null;
  for (const rif of pool) {
    const sim = cosineSimilarity(embeddingTesto, rif.embedding);
    if (sim > bestSim) { bestSim = sim; bestKey = rif.key; }
  }
  bestSim = Math.round(bestSim * 10000) / 10000;

  if (bestSim >= SOGLIA_TIPO_ALLEGATO) {
    return { tipo: bestKey, confidenza: bestSim, metodoRiconoscimento: 'embedding' };
  }
  return _classificaConLLM(testo);
}

// Un singolo file caricato può essere un fascicolo che raccoglie più documenti concatenati
// (es. OdA + CGC + CPC + Allegati A-G in un unico PDF, caso reale osservato: NOMIOS 71 pagine).
// classificaAllegato ritorna UN solo tipo dominante sull'intero testo, quindi su un fascicolo
// composito riconosce solo la sezione più "pesante" (tipicamente la CGC) e nasconde le altre:
// la verifica di completezza le vedrebbe tutte assenti anche se fisicamente presenti nel file.
// Questa funzione chiede esplicitamente quali sotto-tipologie sono riconoscibili come sezioni
// distinte nel testo, anche quando coesistono nello stesso documento.
async function rilevaTipiPresenti(testo) {
  if (!testo || !testo.trim()) return [];

  const sottoTipologie = TIPOLOGIE_ALLEGATO.filter(t => t.sottoTipologia);
  const elenco = sottoTipologie.map(t => `${t.key}: ${t.label}`).join('\n');
  const systemPrompt = `Sei un assistente che analizza un documento contrattuale italiano. Il documento può essere un singolo tipo di documento oppure un fascicolo che raccoglie più documenti concatenati nello stesso file (es. Condizioni Generali + Condizioni Particolari + più Allegati insieme). ` +
    `Elenca TUTTE le tipologie tra le seguenti di cui riconosci una sezione effettivamente presente e identificabile nel testo (per titolo, intestazione o contenuto caratteristico), anche se sono più di una nello stesso documento:\n${elenco}\n` +
    `Rispondi SOLO con un oggetto JSON nella forma: { "tipiPresenti": [ "<CHIAVE>", ... ] }. Se non riconosci nessuna delle tipologie elencate, rispondi { "tipiPresenti": [] }.`;

  try {
    const risposta = await openai.chatJSON(systemPrompt, testo.slice(0, 20000));
    const chiaviValide = new Set(sottoTipologie.map(t => t.key));
    const tipi = Array.isArray(risposta && risposta.tipiPresenti) ? risposta.tipiPresenti : [];
    return [...new Set(tipi.filter(t => chiaviValide.has(t)))];
  } catch (e) {
    console.warn('[allegato-classifier] rilevaTipiPresenti fallita:', e.message);
    return [];
  }
}

module.exports = { classificaAllegato, rilevaTipiPresenti };
