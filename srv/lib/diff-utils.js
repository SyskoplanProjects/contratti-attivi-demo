const { diffWords } = require('diff');

function normalizeText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function computeDelta(oldText, newText) {
  const a = normalizeText(oldText);
  const b = normalizeText(newText);
  if (a === b) return { modificata: false, dettaglioDelta: null };

  const parts = diffWords(a, b).map(p => ({
    value: p.value,
    added: !!p.added,
    removed: !!p.removed
  }));
  return { modificata: true, dettaglioDelta: JSON.stringify(parts) };
}

module.exports = { normalizeText, computeDelta };
