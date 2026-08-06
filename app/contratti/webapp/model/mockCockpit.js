(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    sap.ui.define([], factory);
  }
}(this, function () {
  "use strict";

  return {
    totaleContrattiAnno: 47,
    importoTotaleAnno: 12480000,
    tipologia: [
      { label: "DORA", value: 29, color: "#0a6ed1" },
      { label: "Altro", value: 18, color: "#e9730c" }
    ],
    survey: [
      { label: "Completata", value: 31, color: "#107e3e" },
      { label: "In corso", value: 9, color: "#0a6ed1" },
      { label: "Da iniziare", value: 5, color: "#e9730c" },
      { label: "Bloccata", value: 2, color: "#bb0000" }
    ],
    trend: [
      { mese: "Gen", attivati: 5, scadenza: 2 },
      { mese: "Feb", attivati: 3, scadenza: 1 },
      { mese: "Mar", attivati: 6, scadenza: 4 },
      { mese: "Apr", attivati: 2, scadenza: 3 },
      { mese: "Mag", attivati: 4, scadenza: 2 },
      { mese: "Giu", attivati: 5, scadenza: 5 },
      { mese: "Lug", attivati: 3, scadenza: 1 },
      { mese: "Ago", attivati: 2, scadenza: 2 },
      { mese: "Set", attivati: 6, scadenza: 4 },
      { mese: "Ott", attivati: 4, scadenza: 3 },
      { mese: "Nov", attivati: 4, scadenza: 4 },
      { mese: "Dic", attivati: 3, scadenza: 3 }
    ]
  };
}));
