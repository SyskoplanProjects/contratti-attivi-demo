const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');

const SOGLIA_CONFIDENZA = 0.80;

// Gravità di default per tipo di anomalia (vedi tabella del use case: Contratto assente ->
// Bloccante, Dati economici incoerenti -> Alta, Metadati mancanti -> Media, Allegati non
// critici -> Bassa). COMPLETEZZA è calcolata per singolo allegato mancante (vedi _gravitaAllegato),
// questa mappa copre gli altri tipi generati qui e il gate documentale (anomalie-utils non lo
// genera direttamente, vedi comparator-service.js verificaDocumento, ma condivide la stessa scala).
const GRAVITA_PER_TIPO = { DEROGHE: 'ALTA', CONFIDENZA: 'BASSA', DATI_SAP: 'ALTA' };

function _etichetta(codice) {
  const t = TIPOLOGIE_ALLEGATO.find(x => x.key === codice);
  return t ? t.label : codice;
}

// CGC/CPC assenti tolgono al contratto il suo Template (la "cornice" delle condizioni generali
// e particolari, vedi 01-modello-dati-categorie-metadati.md): più grave della mancanza di un
// singolo allegato del Plesso contrattuale. Gli allegati marcati nonCritico (tipologie-allegato.js,
// es. Allegato C/G) generano BASSA, tutti gli altri MEDIA ("metadati/allegati mancanti").
function _gravitaAllegato(codice) {
  if (codice === 'CGC' || codice === 'CPC') return 'ALTA';
  const t = TIPOLOGIE_ALLEGATO.find(x => x.key === codice);
  return (t && t.nonCritico) ? 'BASSA' : 'MEDIA';
}

// Genera le anomalie per un snapshot con dedup (una per tipo+riferimento).
// Condizioni: allegato atteso mancante -> COMPLETEZZA (una per allegato, gravità per tipo);
// esito deroga 'derogato' -> DEROGHE (una per articolo); confidenza allegato < SOGLIA -> CONFIDENZA;
// allineamentoSAP con esito 'incoerente' -> DATI_SAP (una per campo).
function generaAnomalie({ attesi, deroghe, allegati, allineamentoSAP }) {
  const anomalie = [];
  const visti = new Set();

  const aggiungi = (tipo, riferimento, dettaglio, gravita) => {
    const chiave = tipo + '|' + riferimento;
    if (visti.has(chiave)) return;
    visti.add(chiave);
    anomalie.push({ tipo, riferimento, dettaglio, gravita: gravita || GRAVITA_PER_TIPO[tipo] || 'MEDIA' });
  };

  for (const a of (attesi || [])) {
    if (a.presente) continue;
    aggiungi('COMPLETEZZA', a.allegatoAtteso,
      'Allegato atteso mancante: ' + _etichetta(a.allegatoAtteso), _gravitaAllegato(a.allegatoAtteso));
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

  for (const s of (allineamentoSAP || [])) {
    if (s.esito !== 'incoerente') continue;
    aggiungi('DATI_SAP', s.campo,
      'Valore contratto (' + s.valoreContratto + ') diverso da SAP (' + s.valoreSAP + ')');
  }

  return anomalie;
}

module.exports = { SOGLIA_CONFIDENZA, generaAnomalie };
