sap.ui.define([], function () {
  "use strict";

  function escapeHtml(sText) {
    return String(sText || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return {
    statoState: function (stato) {
      switch (stato) {
        case "BOZZA": return "Warning";
        case "IN_REVISIONE": return "Information";
        case "APPROVATO": return "Success";
        case "ARCHIVIATO": return "None";
        default: return "None";
      }
    },

    shortID: function (sID) {
      if (!sID) return "";
      return sID.substring(0, 8).toUpperCase();
    },

    ultimaVersioneID: function (aVersioni) {
      if (!aVersioni || !aVersioni.length) return "";
      var oMax = aVersioni.reduce(function (a, b) { return (b.numero > a.numero) ? b : a; });
      return oMax.ID ? oMax.ID.substring(0, 8).toUpperCase() : "";
    },

    isStatoBozza: function (v) { return v === "BOZZA"; },
    isNotStatoBozza: function (v) { return v !== "BOZZA"; },
    isStatoInRevisione: function (v) { return v === "IN_REVISIONE"; },
    isStatoApprovato: function (v) { return v === "APPROVATO"; },
    isNotStatoApprovato: function (v) { return v !== "APPROVATO"; },

    categoriaText: function (v) {
      switch (v) {
        case "fornitura": return "Fornitura";
        case "servizio": return "Servizio";
        case "consulenza": return "Consulenza";
        case "NDA": return "NDA";
        case "altro": return "Altro";
        default: return v || "";
      }
    },

    tipoAllegatoText: function (v) {
      if (!v) return "";
      return v.replace(/_/g, " ");
    },

    confidenzaText: function (v) {
      return v != null ? (Math.round(v * 10000) / 100) + "%" : "";
    },

    testoLeggibile: function (sTesto) {
      if (!sTesto) return "";
      return String(sTesto)
        .split(/\r?\n/)
        .map(function (r) { return r.replace(/[ \t]{2,}/g, " ").trim(); })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },

    esitoVerificaText: function (v) {
      switch (v) {
        case "ok": return "Ok";
        case "non_conforme": return "Non conforme";
        case "in_corso": return "Verifica in corso";
        default: return "";
      }
    },

    esitoVerificaCompleto: function (esito, data) {
      if (esito === "in_corso") return "Verifica in corso";
      var sLabel;
      switch (esito) {
        case "ok": sLabel = "Ok"; break;
        case "non_conforme": sLabel = "Non conforme"; break;
        default: return "";
      }
      if (data) {
        var d = new Date(data);
        var giorno = ("0" + d.getDate()).slice(-2);
        var mese = ("0" + (d.getMonth() + 1)).slice(-2);
        var anno = d.getFullYear();
        return sLabel + " " + giorno + "/" + mese + "/" + anno;
      }
      return sLabel;
    },

    esitoVerificaState: function (v) {
      switch (v) {
        case "ok": return "Success";
        case "non_conforme": return "Error";
        case "in_corso": return "Warning";
        default: return "None";
      }
    },

    isEsitoVisible: function (v) {
      return v !== undefined && v !== null && v !== "";
    },

    versionePillText: function (n) {
      return "V" + n;
    },

    timelineDotColor: function (bCorrente) {
      return bCorrente ? "#008766" : "#cfd8dc";
    },

    tipoModificaLabel: function (tipo) {
      switch (tipo) {
        case "aggiunta": return "Aggiunta";
        case "rimossa": return "Rimossa";
        case "modificata": return "Modificata";
        default: return tipo || "";
      }
    },

    tipoModificaIcon: function (tipo) {
      switch (tipo) {
        case "aggiunta": return "sap-icon://add-document";
        case "rimossa": return "sap-icon://less";
        case "modificata": return "sap-icon://edit";
        default: return "sap-icon://document";
      }
    },

    tipoModificaState: function (tipo) {
      switch (tipo) {
        case "aggiunta": return "Success";
        case "rimossa": return "Error";
        case "modificata": return "Warning";
        default: return "None";
      }
    },

    tipoModificaColor: function (tipo) {
      switch (tipo) {
        case "aggiunta": return "#008766";
        case "rimossa": return "#b71c1c";
        case "modificata": return "#e85d04";
        default: return "#7f8c8d";
      }
    },


    // Renderizza il delta calcolato da diffWords (srv/lib/diff-utils.js) come HTML con
    // le parti aggiunte/rimosse evidenziate, riusando lo stesso array [{value,added,removed}]
    // già prodotto e trasportato dall'azione confrontaVersioni.
    parseJSON: function (sJSON) {
      if (!sJSON) return [];
      try { return JSON.parse(sJSON); } catch (e) { return []; }
    },

    renderDiff: function (sDeltaJson) {
      let aParts;
      try { aParts = JSON.parse(sDeltaJson || "[]"); } catch (e) { aParts = []; }
      if (!aParts.length) return "<span>Nessuna differenza.</span>";
      return aParts.map(function (p) {
        const sText = escapeHtml(p.value);
        if (p.added) return '<span class="app-diff-added">' + sText + '</span>';
        if (p.removed) return '<span class="app-diff-removed">' + sText + '</span>';
        return '<span>' + sText + '</span>';
      }).join("");
    }
  };
});
