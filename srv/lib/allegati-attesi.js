const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');

// Tabella associativa "categoria → allegati attesi" (RF4). Per il CONTRATTO standard di Gruppo
// (CGC/CPC Iccrea) gli allegati attesi sono CGC, CPC e Allegati A–G. Altre categorie per ora
// non hanno allegati attesi definiti: la tabella si estende aggiungendo una entry.
const ALLEGATI_ATTESI = {
  CONTRATTO: ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G']
};

function _etichetta(chiave) {
  const t = TIPOLOGIE_ALLEGATO.find(x => x.key === chiave);
  return t ? t.label : chiave;
}

function verificaCompletezza(allegatiClassificati) {
  const attesi = ALLEGATI_ATTESI.CONTRATTO || [];
  const presenti = new Map((allegatiClassificati || []).map(a => [a.tipo, a.filename]));
  const esiti = attesi.map(chiave => ({
    allegatoAtteso: chiave,
    etichetta: _etichetta(chiave),
    presente: presenti.has(chiave),
    filename: presenti.get(chiave) || null
  }));
  const percentuale = esiti.length
    ? Math.round((esiti.filter(e => e.presente).length / esiti.length) * 10000) / 100
    : 0;
  return { attesi: esiti, percentuale };
}

module.exports = { ALLEGATI_ATTESI, verificaCompletezza };
