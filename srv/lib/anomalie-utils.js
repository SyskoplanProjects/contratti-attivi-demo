const SOGLIA_CONFIDENZA = 0.80;

function _mancanti(attesi) {
  return (attesi || []).filter(a => !a.presente).map(a => a.allegatoAtteso);
}

// Genera le anomalie per un snapshot con dedup (una per tipo+riferimento).
// Condizioni: completezza < 100 -> COMPLETEZZA; esito deroga 'derogato' ->
// DEROGHE (una per articolo); confidenza allegato < SOGLIA -> CONFIDENZA.
function generaAnomalie({ attesi, percentuale, deroghe, allegati }) {
  const anomalie = [];
  const visti = new Set();

  const aggiungi = (tipo, riferimento, dettaglio) => {
    const chiave = tipo + '|' + riferimento;
    if (visti.has(chiave)) return;
    visti.add(chiave);
    anomalie.push({ tipo, riferimento, dettaglio });
  };

  const p = Number.isFinite(Number(percentuale)) ? Number(percentuale) : 0;
  if (p < 100) {
    const mancanti = _mancanti(attesi);
    aggiungi('COMPLETEZZA', mancanti.join(', ') || 'ALLEGATI_ASSENTI',
      'Allegati attesi mancanti: ' + (mancanti.join(', ') || 'nessun allegato classificato'));
  }

  for (const d of (deroghe || [])) {
    if (d.esito !== 'derogato') continue;
    const riferimento = 'Art. ' + d.articolo + (d.riferimentoComma ? ' comma ' + d.riferimentoComma : '');
    aggiungi('DEROGHE', riferimento, d.dettaglio || 'Deroga rispetto alle CGC standard');
  }

  for (const a of (allegati || [])) {
    const c = Number(a.confidenza);
    const confidenza = Number.isFinite(c) ? c : 0;
    if (confidenza < SOGLIA_CONFIDENZA) {
      aggiungi('CONFIDENZA', a.filename,
        'Confidenza classificazione ' + confidenza.toFixed(4) + ' sotto soglia ' + SOGLIA_CONFIDENZA);
    }
  }

  return anomalie;
}

module.exports = { SOGLIA_CONFIDENZA, generaAnomalie };
