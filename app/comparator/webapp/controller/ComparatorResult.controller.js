sap.ui.define(["./BaseController", "sap/m/MessageBox", "sap/ui/model/json/JSONModel", "sap/ui/layout/VerticalLayout"],
function (BaseController, MessageBox, JSONModel) {
  "use strict";

  var CAMPI_ALLEGATO_LABELS = {
    numeroProtocollo: "Numero protocollo",
    denominazione: "Denominazione",
    codiceFiscale: "Codice fiscale",
    partitaIva: "Partita IVA",
    sedeLegale: "Sede legale",
    domicilioFiscale: "Domicilio fiscale",
    dataRichiesta: "Data richiesta",
    dataRilascio: "Data rilascio",
    meseRiferimento: "Mese di riferimento",
    scadenzaValidita: "Scadenza validità",
    esito: "Esito",
    formaGiuridica: "Forma giuridica",
    pec: "PEC",
    numeroRea: "Numero REA",
    dataIscrizione: "Data iscrizione",
    dataCostituzione: "Data costituzione",
    oggettoSociale: "Oggetto sociale",
    capitaleSociale: "Capitale sociale (€)",
    amministratori: "Amministratori",
    dataEstrazione: "Data estrazione"
  };

  function testoLeggibile(sTesto) {
    if (!sTesto) return "";
    return String(sTesto)
      .split(/\r?\n/)
      .map(function (r) { return r.replace(/[ \t]{2,}/g, " ").trim(); })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function campiEstrattiList(sJSON) {
    if (!sJSON) return [];
    var oCampi;
    try { oCampi = JSON.parse(sJSON); } catch (e) { return []; }
    return Object.keys(oCampi)
      .filter(function (k) { return oCampi[k] != null && oCampi[k] !== ""; })
      .map(function (k) { return { label: CAMPI_ALLEGATO_LABELS[k] || k, value: oCampi[k] }; });
  }

  return BaseController.extend("com.reply.contrattiattivi.comparator.controller.ComparatorResult", {
    onInit: function () {
      this._initChatState();
      var oCoverageData = JSON.parse(sessionStorage.getItem("coverageResult") || "{}");
      var oComplianceData = JSON.parse(sessionStorage.getItem("complianceResult") || "{}");
      var sFilename = sessionStorage.getItem("comparatorFilename") || "";

      this._sContractID = sessionStorage.getItem("comparatorContractID");
      this._sContractName = sessionStorage.getItem("comparatorContractName");

      if (oCoverageData.previewID) {
        console.log("Preview ID per assistente:", oCoverageData.previewID);
      }

      this.getView().setModel(new JSONModel({ ...oCoverageData, filename: sFilename }), "coverage");

      var aComplianceAPI = (oComplianceData && oComplianceData.value) || [];
      var aComplianceItems = [];
      var aPresenti = [];
      var aNonPresenti = [];

      (oCoverageData.clausole || []).forEach(function (c, idx) {
        var oAPI = idx < aComplianceAPI.length ? aComplianceAPI[idx] : null;
        var sEsito, sDettaglio, sRif;
        if (c.stato === "MATCH_TEMPLATE") {
          sEsito = "PRESENTE";
          sDettaglio = oAPI ? oAPI.dettaglio : c.testo;
          sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else if (c.stato === "VARIANTE") {
          sEsito = "PARZIALE";
          sDettaglio = oAPI ? oAPI.dettaglio : c.testo;
          sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else if (c.stato === "NUOVA") {
          sEsito = "NUOVA";
          sDettaglio = "Clausola presente nel contratto ma non nel template";
          sRif = "";
        } else {
          sEsito = "NON PRESENTE";
          sDettaglio = "Clausola presente nel template ma non nel contratto";
          sRif = c.testo;
        }

        var sRequisitoFormatted = "";
        if (sEsito === "NON PRESENTE") {
          var sReq = c.templateTitolo || c.titolo || "";
          sRequisitoFormatted = sReq.replace(/\s*\([^)]*\)/g, "").trim();
        } else if (sEsito === "NUOVA") {
          sRequisitoFormatted = c.titolo || "Nuova clausola";
        } else {
          var sTemplateTitolo = c.templateTitolo || "";
          var sTitolo = c.titolo || "";
          var match = sTemplateTitolo.match(/^([^(]+)(?:\(([^)]+)\))?/);
          if (match) {
            var sCodice = match[1].trim();
            var sNomeClausola = match[2] ? match[2].trim() : sTitolo;
            if (sCodice && sNomeClausola && sCodice !== sNomeClausola) {
              sRequisitoFormatted = sNomeClausola + " (" + sCodice + ")";
            } else if (sNomeClausola) {
              sRequisitoFormatted = sNomeClausola;
            } else {
              sRequisitoFormatted = sTemplateTitolo || sTitolo;
            }
          } else {
            sRequisitoFormatted = sTemplateTitolo || sTitolo;
          }
        }

        var oItem = {
          requisito: sRequisitoFormatted,
          esito: sEsito,
          dettaglio: sDettaglio,
          riferimento: sRif,
          similarity: c.similarity != null ? (Math.round(c.similarity * 10000) / 100) + '%' : '0%',
          versione: c.versione || 0,
          clausolaID: c.matchClausolaID ? c.matchClausolaID.substring(0, 8).toUpperCase() : ""
        };

        aComplianceItems.push(oItem);

        if (sEsito === "NON PRESENTE") {
          aNonPresenti.push(oItem);
        } else {
          aPresenti.push(oItem);
        }
      });

      if (aComplianceItems.length) {
        this.byId("complianceTableWrap").setVisible(true);
        this.getView().setModel(new JSONModel({
          value: aComplianceItems,
          presenti: aPresenti,
          nonPresenti: aNonPresenti,
          hasPresenti: aPresenti.length > 0,
          hasNonPresenti: aNonPresenti.length > 0,
          countPresenti: aPresenti.length,
          countNonPresenti: aNonPresenti.length
        }), "compliance");
      }

      if (this._sContractID) {
        this.byId("tornaContrattoBtn").setVisible(true);
        this.byId("saveAsContrattoBtn").setVisible(false);
        this.byId("nuovaAnalisiBtn").setVisible(false);
        this._salvaEsitoVerifica();
      }

      var oTipsData = JSON.parse(sessionStorage.getItem("tipsAIResult") || "null");
      var aTips = (oTipsData && oTipsData.value) || (Array.isArray(oTipsData) ? oTipsData : []);
      this.getView().setModel(new JSONModel({ value: aTips, has: aTips.length > 0 }), "tips");

      var aAllegati = JSON.parse(sessionStorage.getItem("allegatiResult") || "[]");
      if (aAllegati.length) {
        this.getView().setModel(new JSONModel({ value: aAllegati }), "allegati");
        this.byId("allegatiTableWrap").setVisible(true);

        fetch("/comparator/getTipologieAllegato", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then(function (oResp) { return oResp.json(); })
          .then(function (oData) {
            var aTipologie = oData.value || (Array.isArray(oData) ? oData : []);
            this.getView().setModel(new JSONModel({ value: aTipologie }), "tipologie");
          }.bind(this))
          .catch(function () { console.warn("Impossibile caricare le tipologie allegato"); });
      }
    },

    onConfirm: async function () {
      var oData = JSON.parse(sessionStorage.getItem("coverageResult") || "{}");
      var oAllegatiModel = this.getView().getModel("allegati");
      var aAllegati = oAllegatiModel ? oAllegatiModel.getProperty("/value").map(function (a) {
        return { filename: a.filename, tipo: a.tipo };
      }) : [];
      try {
        var oResp = await fetch("/comparator/confirmCoverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewID: oData.previewID, clausole: oData.clausole, allegati: aAllegati, metadati: [] })
        });
        if (!oResp.ok) {
          var oErr = await oResp.text();
          MessageBox.error("Errore salvataggio: " + oErr);
          return;
        }
        var oContratto = await oResp.json();
        sap.m.MessageToast.show("Contratto '" + oContratto.intestatario + "' creato.");
        sessionStorage.removeItem("coverageResult");
        sessionStorage.removeItem("complianceResult");
        sessionStorage.removeItem("tipsAIResult");
        sessionStorage.removeItem("comparatorFilename");
        sessionStorage.removeItem("allegatiResult");
        if (window.opener && !window.opener.closed) {
          window.opener.location.assign("/contratti/webapp/index.html#/detail/" + oContratto.ID);
          window.close();
        } else {
          window.location.href = "/contratti/webapp/index.html#/detail/" + oContratto.ID;
        }
      } catch (e) {
        MessageBox.error("Errore di rete: " + e.message);
      }
    },

    onNuovaAnalisi: function () {
      this._cleanAndGoHome();
    },

    _cleanAndGoHome: function () {
      sessionStorage.removeItem("coverageResult");
      sessionStorage.removeItem("complianceResult");
      sessionStorage.removeItem("comparatorFilename");
      sessionStorage.removeItem("allegatiResult");
      var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
      oRouter.navTo("home");
    },

    onTornaContratto: function () {
      var sContractID = this._sContractID;
      if (!sContractID) return;
      sessionStorage.removeItem("comparatorContractID");
      sessionStorage.removeItem("comparatorContractName");

      if (window.opener && !window.opener.closed) {
        window.opener.location.assign("/contratti/webapp/index.html#/detail/" + sContractID);
        window.close();
      } else {
        window.location.href = "/contratti/webapp/index.html#/detail/" + sContractID;
      }
    },

    _salvaEsitoVerifica: function () {
      var sContractID = this._sContractID;
      if (!sContractID) return;

      var oCompliance = JSON.parse(sessionStorage.getItem("complianceResult") || "{}");
      var aViolations = oCompliance.value && oCompliance.value.filter(function (r) {
        return r.esito === "non_conforme" || r.esito === "parzialmente_presente" || r.esito === "assente";
      });
      var sEsito = aViolations && aViolations.length ? "non_conforme" : "ok";
      var sNow = new Date().toISOString();

      var that = this;
      fetch("/contratti/", {
        method: "GET",
        headers: { "x-csrf-token": "fetch" }
      }).then(function (oResp) {
        var sToken = oResp.headers.get("x-csrf-token");
        return fetch("/contratti/Contratto(" + sContractID + ")", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": sToken || "fetch"
          },
          body: JSON.stringify({
            esitoVerifica: sEsito,
            dataUltimaVerifica: sNow
          })
        });
      }).catch(function (oErr) {
        console.error("Errore salvataggio esito verifica:", oErr);
      });
    },

    onRowPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("compliance");
      if (!oCtx) return;
      var oData = oCtx.getObject();
      if (!this._oRowDialog) {
        this._oRowDialog = new sap.m.Dialog({
          title: "Dettaglio riga",
          contentWidth: "700px",
          contentHeight: "500px",
          content: new sap.ui.layout.VerticalLayout({ id: "rowDialogContent" }),
          beginButton: new sap.m.Button({ text: "Chiudi", press: function () { this._oRowDialog.close(); }.bind(this) })
        }).addStyleClass("sapUiContentPadding");
      }
      var oLayout = this._oRowDialog.getContent()[0];
      oLayout.removeAllContent();
      var aFields = [
        { label: "Parti Contratto", value: oData.requisito },
        { label: "Esito", value: oData.esito },
        { label: "Dettaglio", value: oData.dettaglio },
        { label: "Riferimento", value: oData.riferimento },
        { label: "Match %", value: oData.similarity }
      ];
      aFields.forEach(function (f) {
        if (!f.value) return;
        oLayout.addContent(new sap.m.Label({ text: f.label, design: "Bold" }));
        oLayout.addContent(new sap.m.Text({ text: String(f.value), wrapping: true }));
      });
      this._oRowDialog.open();
    },

    onAnteprimaAllegato: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("allegati");
      if (!oCtx) return;
      var oData = oCtx.getObject();

      var oTipologie = this.getView().getModel("tipologie");
      var aTipologie = (oTipologie && oTipologie.getProperty("/value")) || [];
      var oTipologia = aTipologie.filter(function (t) { return t.codice === oData.tipo; })[0];

      if (!this._oAllegatoDialog) {
        this._oAllegatoDialog = new sap.m.Dialog({
          title: "Dettaglio riga",
          contentWidth: "90%",
          contentHeight: "85%",
          resizable: true,
          draggable: true,
          content: new sap.ui.layout.VerticalLayout({ id: "allegatoDialogContent", width: "100%" }),
          beginButton: new sap.m.Button({ text: "Chiudi", press: function () { this._oAllegatoDialog.close(); }.bind(this) })
        }).addStyleClass("sapUiContentPadding");
      }
      var oLayout = this._oAllegatoDialog.getContent()[0];
      oLayout.removeAllContent();
      var aFields = [
        { label: "Nome file", value: oData.filename },
        { label: "Tipo documento", value: oTipologia ? oTipologia.label : oData.tipo },
        { label: "Confidenza", value: oData.confidenza != null ? (Math.round(oData.confidenza * 10000) / 100) + "%" : "" }
      ].concat(campiEstrattiList(oData.campiEstratti));
      aFields.forEach(function (f) {
        if (!f.value) return;
        oLayout.addContent(new sap.m.Label({ text: f.label, design: "Bold" }));
        oLayout.addContent(new sap.m.Text({ text: String(f.value), wrapping: true }));
      });
      if (oData.testo) {
        oLayout.addContent(new sap.m.Label({ text: "Testo completo estratto", design: "Bold" }).addStyleClass("sapUiTinyMarginTop"));
        oLayout.addContent(new sap.m.TextArea({
          value: testoLeggibile(oData.testo),
          editable: false, width: "100%", height: "55vh"
        }));
      }
      this._oAllegatoDialog.open();
    },

    onNavBack: function () {
      this.onNuovaAnalisi();
    }
  });
});
