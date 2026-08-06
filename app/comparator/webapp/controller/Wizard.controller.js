sap.ui.define([
  "./BaseController", "sap/m/MessageBox", "sap/m/WizardStep", "sap/ui/model/json/JSONModel",
  "sap/ui/core/Fragment", "sap/ui/core/Element", "./MetadataWizardHelper"
],
function (BaseController, MessageBox, WizardStep, JSONModel, Fragment, Element, metadataWizardHelper) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.comparator.controller.Wizard", {
    metadataWizardHelper: metadataWizardHelper,

    onInit: function () {
      this._initChatState();
      var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
      oRouter.getRoute("wizard").attachPatternMatched(this._onRouteMatched, this);
    },

    // Il router SAPUI5 riusa l'istanza di view/controller cache per il target "wizard":
    // onInit non viene richiamato a una seconda navigazione (secondo documento analizzato
    // nella stessa sessione), quindi la costruzione modelli/step deve avvenire qui.
    _onRouteMatched: async function () {
      var oWizard = this.byId("reviewWizard");
      if (oWizard) oWizard.destroySteps();

      var oCoverageData = JSON.parse(sessionStorage.getItem("coverageResult") || "{}");
      var oComplianceData = JSON.parse(sessionStorage.getItem("complianceResult") || "{}");
      var oTipsData = JSON.parse(sessionStorage.getItem("tipsAIResult") || "null");
      var sFilename = sessionStorage.getItem("comparatorFilename") || "";
      var aAllegati = JSON.parse(sessionStorage.getItem("allegatiResult") || "[]").map(function (a) {
        return Object.assign({}, a, { sezioni: metadataWizardHelper.raggruppaPerSezione(a.metadati || []) });
      });
      var oDocPrincipale = JSON.parse(sessionStorage.getItem("documentoPrincipaleResult") || "null") || { categoria: null, sottoTipo: null, confidenza: null };
      oDocPrincipale.codiceSelezionato = oDocPrincipale.sottoTipo || oDocPrincipale.categoria;

      // pdfBase64 non passa da sessionStorage (vedi ComparatorHome#onAvvia): lo si
      // recupera dalla cache in-memory sul Component, one-shot.
      var oPdfCache = this.getOwnerComponent()._wizardPdfCache || {};
      oCoverageData.pdfBase64 = oPdfCache.contratto || null;
      aAllegati.forEach(function (a, i) { a.pdfBase64 = (oPdfCache.allegati || [])[i] || null; });
      delete this.getOwnerComponent()._wizardPdfCache;

      this._oCoverageData = oCoverageData;

      this.getView().setModel(new JSONModel({ ...oCoverageData, filename: sFilename }), "coverage");
      var aSezioni = metadataWizardHelper.raggruppaPerSezione(oCoverageData.metadati || []);
      var aClausoleRischio = (oCoverageData.clausole || []).map(function (c) {
        return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: c.posizione || null, isClausola: true };
      });
      if (aClausoleRischio.length) {
        aSezioni.push({ sezione: "Clausole di rischio", campi: aClausoleRischio });
      }
      this.getView().setModel(new JSONModel(aSezioni), "wizardSezioni");
      this.getView().setModel(new JSONModel({ pdfBase64: oCoverageData.pdfBase64 || null }), "wizardDocumento");
      this.getView().setModel(new JSONModel({ value: aAllegati }), "allegati");
      this.getView().setModel(new JSONModel(oDocPrincipale), "documentoPrincipale");
      var aTips = (oTipsData && oTipsData.value) || (Array.isArray(oTipsData) ? oTipsData : []);
      this.getView().setModel(new JSONModel({ value: aTips, has: aTips.length > 0 }), "tips");

      var oCompletezzaData = JSON.parse(sessionStorage.getItem("completezzaResult") || "null") || { attesi: [], percentuale: null };
      this.getView().setModel(new JSONModel(oCompletezzaData), "completezza");
      var oDerogheData = JSON.parse(sessionStorage.getItem("derogheResult") || "null");
      this.getView().setModel(new JSONModel({ value: (oDerogheData && oDerogheData.value) || [] }), "deroghe");
      this.getView().setModel(new JSONModel(this._buildSubfornitoriModel(oCoverageData)), "subfornitori");
      this.getView().setModel(new JSONModel(this._buildDoraModel(oCoverageData)), "dora");

      this._buildComplianceModel(oCoverageData, oComplianceData);

      var aTipologie = [];
      try {
        var oTipologieResp = await fetch("/comparator/getTipologieAllegato", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        var oTipologieData = await oTipologieResp.json();
        aTipologie = oTipologieData.value || (Array.isArray(oTipologieData) ? oTipologieData : []);
      } catch (e) { console.warn("Impossibile caricare le tipologie allegato"); }
      this.getView().setModel(new JSONModel({ value: aTipologie }), "tipologie");
      this._mTipologieLabel = {};
      aTipologie.forEach(function (t) { this._mTipologieLabel[t.codice] = t.label; }.bind(this));

      this._buildSteps(aAllegati, oDocPrincipale);
    },

    _buildComplianceModel: function (oCoverageData, oComplianceData) {
      var aComplianceAPI = (oComplianceData && oComplianceData.value) || [];
      var aComplianceItems = [];
      var aPresenti = [];
      var aNonPresenti = [];

      (oCoverageData.clausole || []).forEach(function (c, idx) {
        var oAPI = idx < aComplianceAPI.length ? aComplianceAPI[idx] : null;
        var sEsito, sDettaglio, sRif;
        if (c.stato === "MATCH_TEMPLATE") {
          sEsito = "PRESENTE"; sDettaglio = oAPI ? oAPI.dettaglio : c.testo; sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else if (c.stato === "VARIANTE") {
          sEsito = "PARZIALE"; sDettaglio = oAPI ? oAPI.dettaglio : c.testo; sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else if (c.stato === "NUOVA") {
          sEsito = "NUOVA"; sDettaglio = "Clausola presente nel contratto ma non nel template"; sRif = "";
        } else {
          sEsito = "NON PRESENTE"; sDettaglio = "Clausola presente nel template ma non nel contratto"; sRif = c.testo;
        }

        var sRequisitoFormatted = "";
        if (sEsito === "NON PRESENTE") {
          sRequisitoFormatted = (c.templateTitolo || c.titolo || "").replace(/\s*\([^)]*\)/g, "").trim();
        } else if (sEsito === "NUOVA") {
          sRequisitoFormatted = c.titolo || "Nuova clausola";
        } else {
          var match = (c.templateTitolo || "").match(/^([^(]+)(?:\(([^)]+)\))?/);
          if (match) {
            var sCodice = match[1].trim();
            var sNomeClausola = match[2] ? match[2].trim() : (c.titolo || "");
            sRequisitoFormatted = (sCodice && sNomeClausola && sCodice !== sNomeClausola) ? (sNomeClausola + " (" + sCodice + ")") : (sNomeClausola || c.templateTitolo || c.titolo);
          } else {
            sRequisitoFormatted = c.templateTitolo || c.titolo;
          }
        }

        var oItem = {
          requisito: sRequisitoFormatted, esito: sEsito, dettaglio: sDettaglio, riferimento: sRif,
          similarity: c.similarity != null ? (Math.round(c.similarity * 10000) / 100) + '%' : '0%',
          versione: c.versione || 0,
          clausolaID: c.matchClausolaID ? c.matchClausolaID.substring(0, 8).toUpperCase() : ""
        };
        aComplianceItems.push(oItem);
        (sEsito === "NON PRESENTE" ? aNonPresenti : aPresenti).push(oItem);
      });

      this.getView().setModel(new JSONModel({
        value: aComplianceItems, presenti: aPresenti, nonPresenti: aNonPresenti,
        hasPresenti: aPresenti.length > 0, hasNonPresenti: aNonPresenti.length > 0
      }), "compliance");
    },

    _buildSteps: async function (aAllegati, oDocPrincipale) {
      var oWizard = this.byId("reviewWizard");
      var sFilename = sessionStorage.getItem("comparatorFilename") || "documento";
      var sContrattoLabel = this._mTipologieLabel[oDocPrincipale && oDocPrincipale.codiceSelezionato] || "Non classificato";

      var oContractContent = await Fragment.load({
        id: this.getView().getId(),
        name: "com.reply.contrattiattivi.comparator.fragment.MetadataWizard", controller: this
      });
      oWizard.addStep(new WizardStep({ title: "Contratto: " + sFilename + " [" + sContrattoLabel + "]", content: [].concat(oContractContent) }));

      this._aAllegatoPreviews = [];
      for (var i = 0; i < aAllegati.length; i++) {
        var oContent = await Fragment.load({
          name: "com.reply.contrattiattivi.comparator.fragment.MetadataWizardAllegato",
          controller: this, id: this.getView().getId() + "-allegato" + i
        });
        var aControls = [].concat(oContent);
        aControls.forEach(function (oCtl) { oCtl.setBindingContext(this.getView().getModel("allegati").getContext("/value/" + i), "allegati"); }.bind(this));
        var sAllegatoLabel = this._mTipologieLabel[aAllegati[i].tipo] || "Non classificato";
        oWizard.addStep(new WizardStep({ title: "Allegato: " + aAllegati[i].filename + " [" + sAllegatoLabel + "]", content: aControls }));
        this._aAllegatoPreviews[i] = Fragment.byId(this.getView().getId() + "-allegato" + i, "allegatoPdfPreview");
      }

      var oFinalContent = await Fragment.load({
        name: "com.reply.contrattiattivi.comparator.fragment.WizardStepFinale", controller: this
      });
      oWizard.addStep(new WizardStep({ title: "Riepilogo e conferma", content: [].concat(oFinalContent) }));
      oWizard.setVisible(true);

      this._updateFooterButtons(0, oWizard.getSteps().length);
    },

    onWizardStepActivate: function () {
      var oWizard = this.byId("reviewWizard");
      var oCurrentStep = oWizard.getProgressStep();
      var iIndex = oWizard.getSteps().indexOf(oCurrentStep);
      this._updateFooterButtons(iIndex, oWizard.getSteps().length);
    },

    _updateFooterButtons: function (iIndex, iTotalSteps) {
      this._iCurrentStepIndex = iIndex;
      this.byId("btnWizardIndietro").setEnabled(iIndex > 0);
      var bUltimo = iIndex === iTotalSteps - 1;
      this.byId("btnWizardAvanti").setText(bUltimo ? "Conferma e digitalizza" : "Avanti");
    },

    onWizardIndietro: function () {
      this.byId("reviewWizard").previousStep();
      var oWizard = this.byId("reviewWizard");
      this._updateFooterButtons(oWizard.getSteps().indexOf(oWizard.getProgressStep()), oWizard.getSteps().length);
    },

    onWizardAvanti: function () {
      var oWizard = this.byId("reviewWizard");
      var iTotalSteps = oWizard.getSteps().length;
      if (this._iCurrentStepIndex >= iTotalSteps - 1) {
        this.onConfirm();
      } else {
        oWizard.nextStep();
      }
    },

    onCampoMetadatoModificato: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext('wizardSezioni');
      if (!oCtx) return;
      oCtx.getModel().setProperty(oCtx.getPath() + '/modificatoManualmente', true);
    },

    onCampoMetadatoAllegatoModificato: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext('allegati');
      if (!oCtx) return;
      oCtx.getModel().setProperty(oCtx.getPath() + '/modificatoManualmente', true);
    },

    onCampoMetadatoPress: function (oEvent) {
      var oRow = oEvent.getListItem ? oEvent.getListItem() : oEvent.getSource();
      this._evidenziaDaRiga(oRow);
    },

    onCampoMetadatoAllegatoPress: function (oEvent) {
      var oRow = oEvent.getListItem ? oEvent.getListItem() : oEvent.getSource();
      this._evidenziaDaRiga(oRow);
    },

    // Risolve la posizione da evidenziare a partire dalla riga (ColumnListItem) di una delle
    // due tabelle metadati (contratto o allegato) e aggiorna la PdfPreview corrispondente.
    // Condiviso tra click (press) e passaggio del mouse (hover, vedi onAfterRendering/_onRowHover).
    _evidenziaDaRiga: function (oRow) {
      if (!oRow || !oRow.getBindingContext) return;
      var oCtx = oRow.getBindingContext('wizardSezioni');
      if (oCtx) {
        var oPreview = this.byId("contractPdfPreview");
        if (oPreview) oPreview.setHighlightPosizione(oCtx.getObject().posizione || null);
        return;
      }
      oCtx = oRow.getBindingContext('allegati');
      if (!oCtx) return;
      // La riga è un ColumnListItem clonato dall'aggregation binding: il suo id non è
      // affidabile per risalire allo step allegato di appartenenza. Uso invece l'indice
      // dell'allegato ricavato dal binding context path ("/value/<i>") per pescare la
      // PdfPreview di quello specifico step dalla lookup costruita una volta in _buildSteps.
      var iIndex = Number(oCtx.getPath().split('/')[2]);
      var oAllegatoPreview = this._aAllegatoPreviews && this._aAllegatoPreviews[iIndex];
      if (oAllegatoPreview) oAllegatoPreview.setHighlightPosizione(oCtx.getObject().posizione || null);
    },

    // Passaggio del mouse su una riga della tabella metadati (contratto o allegato):
    // stesso comportamento del click, un solo listener nativo delegato sulla view intera
    // invece di uno per riga (le righe sono clonate dinamicamente dal binding).
    onAfterRendering: function () {
      if (this._bHoverAttached) return;
      var oDomRef = this.getView().getDomRef();
      if (!oDomRef) return;
      this._bHoverAttached = true;
      oDomRef.addEventListener("mouseover", this._onRowHover.bind(this));
    },

    _onRowHover: function (oEvent) {
      var oRowEl = oEvent.target.closest("tr[id]");
      if (!oRowEl) return;
      var oRow = Element.getElementById(oRowEl.id);
      this._evidenziaDaRiga(oRow);
    },

    onConfirm: async function () {
      var oBusy = new sap.m.BusyDialog({ text: "Digitalizzazione contratto in corso..." });
      oBusy.open();
      var oData = this._oCoverageData;
      var oAllegatiModel = this.getView().getModel("allegati");
      var aAllegati = oAllegatiModel ? oAllegatiModel.getProperty("/value").map(function (a) {
        var aMetadatiAllegato = (a.sezioni || []).reduce(function (acc, s) { return acc.concat(s.campi); }, []);
        return { filename: a.filename, tipo: a.tipo, metadati: aMetadatiAllegato };
      }) : [];
      var oWizardModel = this.getView().getModel("wizardSezioni");
      var aMetadati = oWizardModel ? oWizardModel.getData()
        .filter(function (s) { return s.sezione !== "Clausole di rischio"; })
        .reduce(function (acc, s) { return acc.concat(s.campi); }, []) : [];
      var oDocPrincipaleModel = this.getView().getModel("documentoPrincipale");
      var sTipoDocumento = oDocPrincipaleModel ? oDocPrincipaleModel.getProperty("/codiceSelezionato") : null;

      try {
        var oResp = await fetch("/comparator/confirmCoverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewID: oData.previewID, clausole: oData.clausole, allegati: aAllegati, metadati: aMetadati,
            tipoDocumento: sTipoDocumento
          })
        });
        if (!oResp.ok) {
          oBusy.close();
          MessageBox.error("Errore salvataggio: " + await oResp.text());
          return;
        }
        var oContratto = await oResp.json();
        oBusy.close();
        sap.m.MessageToast.show("Contratto '" + oContratto.intestatario + "' creato.");
        ["coverageResult", "complianceResult", "tipsAIResult", "comparatorFilename", "allegatiResult", "documentoPrincipaleResult",
          "completezzaResult", "derogheResult"]
          .forEach(function (k) { sessionStorage.removeItem(k); });
        window.location.href = "/contratti/webapp/index.html#/detail/" + oContratto.ID;
      } catch (e) {
        oBusy.close();
        MessageBox.error("Errore di rete: " + e.message);
      }
    },

    onNavBack: function () {
      ["coverageResult", "complianceResult", "comparatorFilename", "allegatiResult", "completezzaResult", "derogheResult"]
        .forEach(function (k) { sessionStorage.removeItem(k); });
      sap.ui.core.UIComponent.getRouterFor(this).navTo("home");
    }
  });
});
