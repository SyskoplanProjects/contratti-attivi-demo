sap.ui.define([], function () {
  "use strict";

  // Raggruppa l'array piatto di metadati in sezioni per il rendering a pannelli nel wizard.
  function raggruppaPerSezione(aMetadati) {
    const mSezioni = {};
    const aOrdine = [];
    (aMetadati || []).forEach(function (m) {
      const sSezione = m.sezione || "Altri campi";
      if (!mSezioni[sSezione]) { mSezioni[sSezione] = []; aOrdine.push(sSezione); }
      mSezioni[sSezione].push(m);
    });
    return aOrdine.map(function (s) { return { sezione: s, campi: mSezioni[s] }; });
  }

  // Soglia coerente con SOGLIA_TIPO_ALLEGATO lato server (0.75): sotto soglia il campo
  // va segnalato come "da verificare" nel wizard.
  function statoConfidenza(fConfidenza) {
    if (fConfidenza == null) return "None";
    if (fConfidenza >= 0.75) return "Success";
    if (fConfidenza >= 0.4) return "Warning";
    return "Error";
  }

  return { raggruppaPerSezione: raggruppaPerSezione, statoConfidenza: statoConfidenza };
});
