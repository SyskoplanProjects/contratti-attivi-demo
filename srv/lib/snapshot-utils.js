const { verificaCompletezza } = require('./allegati-attesi');
const { verificaDeroghe } = require('./deroghe-engine');

// Confidenza media delle classificazioni degli allegati salvati (Decimal(5,4)).
// Gli allegati senza confidenza (null) non entrano nel calcolo.
function _mediaConfidenze(allegati) {
  const valori = (allegati || [])
    .filter(a => a.confidenza != null && Number.isFinite(Number(a.confidenza)))
    .map(a => Number(a.confidenza));
  if (!valori.length) return 0;
  return Math.round((valori.reduce((somma, v) => somma + v, 0) / valori.length) * 10000) / 10000;
}

// Costruisce i dati dello snapshot immutabile EsitoVerificaContratto.
// Input: righe ContrattoAllegato dal DB (per completezza) e testo del documento
// principale (per deroghe). NON usa le action preview-based di Fase A.
// contestoContratto: { accordoQuadroOAutonomo } opzionale, per selezionare il set di
// allegati attesi in funzione del tipo contratto (vedi allegati-attesi.js).
async function buildSnapshotData(allegati, testoDocumento, contestoContratto) {
  const { attesi, percentuale } = verificaCompletezza(allegati, contestoContratto);
  const deroghe = await verificaDeroghe(testoDocumento || '');
  return {
    attesi,
    percentuale,
    deroghe,
    totaleAllegati: attesi.length,
    allegatiPresenti: attesi.filter(a => a.presente).length,
    confidenzaMedia: _mediaConfidenze(allegati)
  };
}

module.exports = { buildSnapshotData };
