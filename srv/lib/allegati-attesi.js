const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');

// Tabella associativa "tipo contratto → allegati attesi" (RF4 / obiettivo "Classificazione
// dei contratti"). Un contratto completo è composto da: il Template (CGC + CPC, le condizioni
// generali e particolari "cornice") più il Plesso contrattuale (gli Allegati A-G, il dettaglio
// tecnico/economico/sicurezza). Il set STANDARD verifica la presenza di entrambi. Gli Accordi
// Quadro osservati sui contratti reali analizzati non hanno legittimamente C/E/G (vedi
// docs/requirements/04-esempi-reali-plesso-oda-registro.md §2, es. Accordo Quadro Dedacredit
// BCC Sinergia: "mancano allegati C, E, G" pur essendo un contratto conforme al suo tipo):
// senza un set dedicato finiscono segnalati come anomalia di completezza allo stesso modo
// di un contratto realmente incompleto.
// Nota: un eventuale Addendum successivo (tipo ADDENDUM, vedi tipologie-allegato.js) NON entra
// in questi set — è un documento opzionale post-hoc che modifica/integra template o plesso già
// completi, non un allegato atteso alla firma.
const SET_STANDARD = ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G'];
const SET_ACCORDO_QUADRO = ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_D', 'ALLEGATO_F'];

const ALLEGATI_ATTESI = { CONTRATTO: SET_STANDARD, ACCORDO_QUADRO: SET_ACCORDO_QUADRO };

function _etichetta(chiave) {
  const t = TIPOLOGIE_ALLEGATO.find(x => x.key === chiave);
  return t ? t.label : chiave;
}

// contestoContratto.accordoQuadroOAutonomo: valore del metadato omonimo (vedi tipologie-allegato.js,
// tipo CONTRATTO) — se contiene "quadro" si applica il set ridotto SET_ACCORDO_QUADRO, altrimenti
// lo standard completo A-G. Nessun contesto passato -> comportamento invariato (SET_STANDARD).
// standardApplicato va sempre restituito insieme all'esito: la verifica di completezza deve
// dichiarare esplicitamente rispetto a QUALE standard di tipologia sta confrontando il
// contratto, non lasciarlo implicito.
function _selezionaSet(contestoContratto) {
  const valore = contestoContratto && contestoContratto.accordoQuadroOAutonomo;
  if (valore && /quadro/i.test(valore)) {
    return { attesi: SET_ACCORDO_QUADRO, standardApplicato: 'Accordo Quadro (CGC/CPC + Allegati A, B, D, F)' };
  }
  return { attesi: SET_STANDARD, standardApplicato: 'Contratto standard Iccrea (CGC/CPC + Allegati A-G)' };
}

function verificaCompletezza(allegatiClassificati, contestoContratto) {
  const { attesi, standardApplicato } = _selezionaSet(contestoContratto);
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
  return { attesi: esiti, percentuale, standardApplicato };
}

module.exports = { ALLEGATI_ATTESI, verificaCompletezza };
