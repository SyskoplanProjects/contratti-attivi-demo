const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { TESTO_RIFERIMENTO_CGC_CPC } = require('./template-standard-riferimento');

// Soglia di similarity oltre la quale il documento è considerato basato sullo standard CGC/CPC
// Iccrea ("Template Banca"). Sotto soglia ma con testo sostanzioso: si assume sia il template
// del fornitore ("Template Fornitore") — decisione presa in fase di pianificazione (2026-07-30):
// senza testi di riferimento dei singoli fornitori non è possibile una conferma positiva, ma
// l'assenza di somiglianza con lo standard di Gruppo è già un segnale sufficiente per questo scopo.
const SOGLIA_TEMPLATE_BANCA = 0.80;
const LUNGHEZZA_MINIMA_TESTO = 100;

let _embeddingRiferimentoCache = null;

async function _embeddingRiferimento() {
  if (!_embeddingRiferimentoCache) {
    const [embedding] = await openai.embeddings([TESTO_RIFERIMENTO_CGC_CPC]);
    _embeddingRiferimentoCache = embedding;
  }
  return _embeddingRiferimentoCache;
}

async function riconosciTemplateContrattuale(testo) {
  if (!testo || testo.trim().length < LUNGHEZZA_MINIMA_TESTO) {
    return { valore: 'Non Determinabile', confidenza: null };
  }
  try {
    const riferimento = await _embeddingRiferimento();
    const [embeddingTesto] = await openai.embeddings([testo.slice(0, 8000)]);
    const similarity = Math.round(cosineSimilarity(embeddingTesto, riferimento) * 10000) / 10000;
    const valore = similarity >= SOGLIA_TEMPLATE_BANCA ? 'Template Banca' : 'Template Fornitore';
    return { valore, confidenza: similarity };
  } catch (e) {
    console.warn('[template-recognizer] riconoscimento fallito:', e.message);
    return { valore: 'Non Determinabile', confidenza: null };
  }
}

module.exports = { riconosciTemplateContrattuale, SOGLIA_TEMPLATE_BANCA };
