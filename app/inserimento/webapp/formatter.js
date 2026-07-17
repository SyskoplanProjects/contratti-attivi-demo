sap.ui.define([], function () {
  "use strict";
  return {
    statoImportState: function (sStato) {
      switch (sStato) {
        case "RIUSATA": return "Success";
        case "MODIFICATA": return "Warning";
        default: return "Information";
      }
    },
    formatPercentuale: function (fValue) {
      if (fValue === undefined || fValue === null) return "";
      return Math.round(fValue * 100) + "%";
    },
    categoriaText: function (v) {
      switch (v) {
        case "fornitura": return "Fornitura";
        case "servizio": return "Servizio";
        case "consulenza": return "Consulenza";
        case "NDA": return "NDA";
        case "altro": return "Altro";
        default: return v || "";
      }
    }
  };
});
