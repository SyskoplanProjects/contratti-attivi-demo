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

      // Il controller è cacheato tra navigazioni: azzera la bozza ripresa del documento
      // precedente, altrimenti un nuovo documento senza bozza mostrerebbe dati stale.
      this._aSezioniBozza = null;

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

      // Usato da onSelezionaCandidato per ricalcolare la coverage su un candidato alternativo
      // del top-3 (vedi ComparatorHome#onAvvia) senza far ricaricare il file all'utente.
      this._oFileCache = this.getOwnerComponent()._wizardFileCache || null;

      this._oCoverageData = oCoverageData;

      var oBozzaResp = null;
      try {
        var oBozzaRes = await fetch("/comparator/recuperaBozza", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewID: oCoverageData.previewID })
        });
        // 204 = nessuna bozza salvata per questa preview; 200 = dati bozza.
        if (oBozzaRes.ok && oBozzaRes.status !== 204) oBozzaResp = await oBozzaRes.json();
      } catch (e) { /* ripresa bozza non bloccante */ }

      if (oBozzaResp && oBozzaResp.contrattoID) {
        aAllegati = (oBozzaResp.allegati || []).map(function (a) {
          return Object.assign({}, a, { sezioni: metadataWizardHelper.raggruppaPerSezione(a.metadati || []) });
        });
        var aSezioniBozza = metadataWizardHelper.raggruppaPerSezione(oBozzaResp.metadati || []);
        var aClausoleBozza = (oBozzaResp.clausole || [])
          .filter(function (c) { return c.stato !== "NON_PRESENTE"; })
          .map(function (c) {
            return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: null, isClausola: true, numero: c.numero };
          });
        aSezioniBozza.push({ sezione: "Clausole di rischio", campi: aClausoleBozza });
        this._aSezioniBozza = aSezioniBozza;
      }

      this.getView().setModel(new JSONModel({ ...oCoverageData, filename: sFilename }), "coverage");
      var aSezioni = metadataWizardHelper.raggruppaPerSezione(oCoverageData.metadati || []);
      var aClausoleRischio = (oCoverageData.clausole || []).filter(function (c) {
        // Tutte le clausole effettivamente nel documento caricato, MATCH_TEMPLATE incluse: prima
        // solo VARIANTE/NUOVA finivano qui e le MATCH_TEMPLATE si vedevano solo nella tabella
        // compliance del passo finale — risultato: appena caricato un documento senza scostamenti
        // dal template questa sezione appariva vuota, sembrando che l'estrazione non avesse letto
        // nulla (bug reale osservato: contratto con 8/8 clausole estratte correttamente ma sezione
        // "Clausole di rischio" vuota, e "Aggiungi clausola" partiva da numero 9 senza che le 8
        // precedenti fossero mai visibili). Le NON_PRESENTE (mancanti dal documento) restano fuori,
        // sono in "Clausole mancanti" nel passo finale.
        return c.stato !== "NON_PRESENTE";
      }).map(function (c) {
        return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: c.posizione || null, isClausola: true, numero: c.numero, stato: c.stato };
      });
      // Sezione sempre presente (anche vuota): serve come punto di aggancio per "Aggiungi
      // clausola" quando l'estrazione automatica ne ha saltata una — l'utente deve poterla
      // raggiungere anche se non c'è ancora nessuna clausola rilevata.
      aSezioni.push({ sezione: "Clausole di rischio", campi: aClausoleRischio });
      this.getView().setModel(new JSONModel(this._aSezioniBozza || aSezioni), "wizardSezioni");
      this.getView().setModel(new JSONModel({ pdfBase64: oCoverageData.pdfBase64 || null }), "wizardDocumento");
      this.getView().setModel(new JSONModel({ value: aAllegati }), "allegati");
      this.getView().setModel(new JSONModel(oDocPrincipale), "documentoPrincipale");
      var aTips = (oTipsData && oTipsData.value) || (Array.isArray(oTipsData) ? oTipsData : []);
      this.getView().setModel(new JSONModel({ value: aTips, has: aTips.length > 0 }), "tips");

      var aMancanti = (oCoverageData.clausole || [])
        .filter(function (c) { return c.stato === "NON_PRESENTE"; })
        .map(function (c) {
          return { codice: c.numero, titolo: c.titolo || "", testo: c.testo || "" };
        });
      this.getView().setModel(new JSONModel({ value: aMancanti, has: aMancanti.length > 0 }), "mancanti");

      var oCompletezzaData = JSON.parse(sessionStorage.getItem("completezzaResult") || "null") || { attesi: [], percentuale: null };
      this.getView().setModel(new JSONModel(oCompletezzaData), "completezza");
      var oDerogheData = JSON.parse(sessionStorage.getItem("derogheResult") || "null");
      this.getView().setModel(new JSONModel({
        value: (oDerogheData && oDerogheData.deroghe) || [],
        esitoComplessivo: (oDerogheData && oDerogheData.esitoComplessivo) || "NON_DETERMINATO"
      }), "deroghe");
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

    // Ricalcola la coverage sul candidato del top-3 scelto dall'utente (WizardStepFinale
    // fragment), riusando il path calcolaCoverage con templateID esplicito (già supportato
    // e testato) invece di aggiungere un endpoint dedicato. Non ripete compliance/tips/deroghe:
    // quelle restano riferite al match automatico, coerente col fatto che sono AI-based e
    // costose, non essenziali per la sola scelta del template di riferimento.
    onSelezionaCandidato: async function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("coverage");
      var oCandidato = oContext.getObject();
      if (!this._oFileCache) {
        MessageBox.error("File originale non più disponibile in questa sessione, ripetere il caricamento.");
        return;
      }

      var oBusy = new sap.m.BusyDialog({ text: "Ricalcolo copertura su " + oCandidato.nome + "..." });
      oBusy.open();
      try {
        var oResp = await fetch("/comparator/calcolaCoverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: this._oFileCache.base64, filename: this._oFileCache.filename, templateID: oCandidato.templateID })
        });
        if (!oResp.ok) {
          oBusy.close();
          MessageBox.error("Errore ricalcolo copertura: " + await oResp.text());
          return;
        }
        var oData = await oResp.json();
        if (oData.error) {
          oBusy.close();
          MessageBox.error(oData.error.message || JSON.stringify(oData.error));
          return;
        }

        var oCoverageModel = this.getView().getModel("coverage");
        var aCandidati = oCoverageModel.getProperty("/riferimentoTrovato/candidati") || [];
        oCoverageModel.setProperty("/clausole", oData.clausole);
        oCoverageModel.setProperty("/coveragePercent", oData.coveragePercent);
        oCoverageModel.setProperty("/riferimentoTrovato", {
          templateID: oCandidato.templateID, nome: oCandidato.nome, tipo: oCandidato.tipo,
          similarity: oCandidato.similarity, coveragePercent: oData.coveragePercent, candidati: aCandidati
        });
        this._oCoverageData = oCoverageModel.getData();

        var aClausoleRischio = (oData.clausole || []).filter(function (c) {
          return c.stato !== "NON_PRESENTE";
        }).map(function (c) {
          return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: c.posizione || null, isClausola: true, numero: c.numero, stato: c.stato };
        });
        var aSezioni = this.metadataWizardHelper.raggruppaPerSezione(this._oCoverageData.metadati || []);
        aSezioni.push({ sezione: "Clausole di rischio", campi: aClausoleRischio });
        this.getView().setModel(new JSONModel(this._aSezioniBozza || aSezioni), "wizardSezioni");

        var aMancanti = (oData.clausole || [])
          .filter(function (c) { return c.stato === "NON_PRESENTE"; })
          .map(function (c) { return { codice: c.numero, titolo: c.titolo || "", testo: c.testo || "" }; });
        this.getView().setModel(new JSONModel({ value: aMancanti, has: aMancanti.length > 0 }), "mancanti");

        oBusy.close();
      } catch (e) {
        oBusy.close();
        MessageBox.error("Errore: " + e.message);
      }
    },

    // RF-3.x: crea un Template nuovo dalle clausole del documento corrente, quando nessuno dei
    // candidati del top-3 (onSelezionaCandidato) è quello giusto. Riusa lo stesso creaTemplateDaClausole
    // già collaudato per l'import multi-file (srv/lib/import-commit.js), con in più fornitore/anno/isDefault.
    onApriCreaTemplate: async function () {
      if (!this._oDialogCreaTemplate) {
        this._oDialogCreaTemplate = this.loadFragment({ name: "com.reply.contrattiattivi.comparator.fragment.CreaTemplateDialog" });
      }
      var oDialog = await this._oDialogCreaTemplate;

      var sNomeDefault = (this._oCoverageData && this._oCoverageData.filename || "Template").replace(/\.[^.]+$/, "");
      this.getView().setModel(new JSONModel({ nome: sNomeDefault, fornitoreID: null, annoRiferimento: null, isDefault: false }), "creaTemplate");

      if (!this._oFornitoriPromise) {
        this._oFornitoriPromise = fetch("/contratti/Fornitore?$select=ID,nomeFornitore&$orderby=nomeFornitore")
          .then(function (r) { return r.ok ? r.json() : { value: [] }; })
          .catch(function () { return { value: [] }; });
      }
      var oFornitoriData = await this._oFornitoriPromise;
      this.getView().setModel(new JSONModel({ value: oFornitoriData.value || [] }), "fornitoriPicker");

      oDialog.open();
    },

    onAnnullaCreaTemplate: function () {
      this._oDialogCreaTemplate.then(function (oDialog) { oDialog.close(); });
    },

    onConfermaCreaTemplate: async function () {
      var oDati = this.getView().getModel("creaTemplate").getData();
      if (!oDati.nome || !oDati.nome.trim()) {
        MessageBox.error("Nome template obbligatorio.");
        return;
      }

      var oDialog = await this._oDialogCreaTemplate;
      var oBusy = new sap.m.BusyDialog({ text: "Creazione template in corso..." });
      oBusy.open();
      try {
        var oResp = await fetch("/comparator/creaTemplateDaCoverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: oDati.nome.trim(),
            fornitoreID: oDati.fornitoreID || null,
            annoRiferimento: oDati.annoRiferimento || null,
            isDefault: !!(oDati.fornitoreID && oDati.isDefault),
            clausole: (this._oCoverageData && this._oCoverageData.clausole) || []
          })
        });
        oBusy.close();
        if (!oResp.ok) {
          MessageBox.error("Errore creazione template: " + await oResp.text());
          return;
        }
        oDialog.close();
        sap.m.MessageToast.show("Nuovo template '" + oDati.nome.trim() + "' creato.");
      } catch (e) {
        oBusy.close();
        MessageBox.error("Errore: " + e.message);
      }
    },

    // RF-3.x: aggiunge a mano una clausola di rischio che l'estrazione automatica ha saltato
    // (bottone "Aggiungi clausola" nell'header della sezione). La riga entra in wizardSezioni
    // per la modifica del testo e una voce NUOVA in _oCoverageData.clausole, così confirmCoverage
    // la salva come clausola reale del contratto (il server filtra solo le NON_PRESENTE).
    onAggiungiClausola: function () {
      var oModel = this.getView().getModel("wizardSezioni");
      if (!oModel) return;
      var aSezioni = oModel.getData() || [];
      var oSezione = null;
      for (var i = 0; i < aSezioni.length; i++) {
        if (aSezioni[i].sezione === "Clausole di rischio") { oSezione = aSezioni[i]; break; }
      }
      if (!oSezione) {
        oSezione = { sezione: "Clausole di rischio", campi: [] };
        aSezioni.push(oSezione);
      }

      var aClausole = (this._oCoverageData && this._oCoverageData.clausole) || [];
      var iNumero = aClausole.reduce(function (max, c) { return Math.max(max, c.numero || 0); }, 0) + 1;
      oSezione.campi.push({ etichetta: "Nuova clausola " + iNumero, valore: "", confidenza: null, posizione: null, isClausola: true, numero: iNumero });
      aClausole.push({ numero: iNumero, titolo: "Nuova clausola " + iNumero, testo: "", stato: "NUOVA", similarity: null, matchClausolaID: null, utilizzoStorico: [], riferimento: "", templateTitolo: "", versione: null });
      oModel.setData(aSezioni);
    },

    // Le righe "Clausole di rischio" del wizard sono editabili ma onConfirm/onSalvaBozza inviano
    // oData.clausole: senza merge le correzioni/testi aggiunti a mano andrebbero persi. Allinea
    // il testo di ogni riga (match per numero) sulla voce corrispondente di _oCoverageData.clausole.
    _sincronizzaClausole: function () {
      if (!this._oCoverageData) return;
      var aSezioni = this.getView().getModel("wizardSezioni");
      if (!aSezioni) return;
      var aRighe = [];
      (aSezioni.getData() || []).forEach(function (s) {
        if (s.sezione !== "Clausole di rischio") return;
        aRighe = aRighe.concat(s.campi || []);
      });
      aRighe.forEach(function (riga) {
        if (!riga.isClausola || !this._oCoverageData.clausole) return;
        for (var i = 0; i < this._oCoverageData.clausole.length; i++) {
          if (this._oCoverageData.clausole[i].numero === riga.numero) {
            this._oCoverageData.clausole[i].testo = riga.valore || "";
            break;
          }
        }
      }.bind(this));
    },


    // Solo le clausole realmente presenti nel documento caricato (MATCH_TEMPLATE/VARIANTE/NUOVA):
    // le clausole NON_PRESENTE (di un template auto-matchato ma assenti dal documento) non
    // vengono più mostrate qui — "cosa manca rispetto allo standard" è responsabilità delle
    // tips AI, gated sulla classificazione riuscita del documento (vedi onAvvia in
    // ComparatorHome.controller.js), non di un confronto silenzioso con un template potenzialmente
    // non correlato.
    _buildComplianceModel: function (oCoverageData, oComplianceData) {
      var aComplianceAPI = (oComplianceData && oComplianceData.value) || [];
      var aComplianceItems = [];

      (oCoverageData.clausole || []).forEach(function (c, idx) {
        if (c.stato === "NON_PRESENTE") return;
        var oAPI = idx < aComplianceAPI.length ? aComplianceAPI[idx] : null;
        var sEsito, sDettaglio, sRif;
        if (c.stato === "MATCH_TEMPLATE") {
          sEsito = "PRESENTE"; sDettaglio = oAPI ? oAPI.dettaglio : c.testo; sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else if (c.stato === "VARIANTE") {
          sEsito = "PARZIALE"; sDettaglio = oAPI ? oAPI.dettaglio : c.testo; sRif = oAPI ? (oAPI.riferimento || "") : (c.riferimento || "");
        } else {
          sEsito = "NUOVA"; sDettaglio = "Clausola presente nel contratto ma non nel template"; sRif = "";
        }

        var sRequisitoFormatted = "";
        if (sEsito === "NUOVA") {
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

        aComplianceItems.push({
          requisito: sRequisitoFormatted, esito: sEsito, dettaglio: sDettaglio, riferimento: sRif,
          similarity: c.similarity != null ? (Math.round(c.similarity * 10000) / 100) + '%' : '0%',
          versione: c.versione || 0,
          clausolaID: c.matchClausolaID ? c.matchClausolaID.substring(0, 8).toUpperCase() : ""
        });
      });

      this.getView().setModel(new JSONModel({
        value: aComplianceItems, presenti: aComplianceItems, hasPresenti: aComplianceItems.length > 0
      }), "compliance");
    },

    _buildSteps: async function (aAllegati, oDocPrincipale) {
      var oWizard = this.byId("reviewWizard");
      var sFilename = sessionStorage.getItem("comparatorFilename") || "documento";

      var oContractContent = await Fragment.load({
        id: this.getView().getId(),
        name: "com.reply.contrattiattivi.comparator.fragment.MetadataWizard", controller: this
      });
      oWizard.addStep(new WizardStep({ title: "Contratto: " + sFilename, content: [].concat(oContractContent) }));

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
      this._sincronizzaClausole();
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

    onSalvaBozza: async function () {
      this._sincronizzaClausole();
      var oData = this._oCoverageData;
      if (!oData || !oData.previewID) { MessageBox.info("Nessuna analisi in corso da salvare."); return; }

      var oWizardModel = this.getView().getModel("wizardSezioni");
      var aMetadati = oWizardModel ? oWizardModel.getData()
        .filter(function (s) { return s.sezione !== "Clausole di rischio"; })
        .reduce(function (acc, s) { return acc.concat(s.campi); }, []) : [];
      var oAllegatiModel = this.getView().getModel("allegati");
      var aAllegati = oAllegatiModel ? oAllegatiModel.getProperty("/value") : [];
      var oDocPrincipaleModel = this.getView().getModel("documentoPrincipale");
      var sTipo = oDocPrincipaleModel ? oDocPrincipaleModel.getProperty("/codiceSelezionato") : null;
      var sFilename = sessionStorage.getItem("comparatorFilename") || "";

      var oTitolo = null, oFornitore = null;
      aMetadati.forEach(function (m) {
        if (m.campo === "titoloContratto") oTitolo = m;
        if (m.campo === "fornitore") oFornitore = m;
      });
      var sIntestatario = (oTitolo && oTitolo.valore) || (oFornitore && oFornitore.valore) || "";

      var iIndex = this._iCurrentStepIndex || 0;
      var sStep = iIndex === 0 ? "CONTRATTO" : (iIndex >= 1 && iIndex <= aAllegati.length ? "ALLEGATO" : "FINE");
      var sAllegatoID = null, aAllegatoMetadati = null;
      if (sStep === "ALLEGATO" && aAllegati[iIndex - 1]) {
        var oAllegato = aAllegati[iIndex - 1];
        sAllegatoID = oAllegato.filename;
        // Il tipo salvato è quello dell'allegato corrente, non del documento principale.
        sTipo = oAllegato.tipo || sTipo;
        aAllegatoMetadati = (oAllegato.sezioni || []).reduce(function (acc, s) { return acc.concat(s.campi); }, []);
      }

      try {
        var oResp = await fetch("/comparator/salvaBozza", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewID: oData.previewID, step: sStep, filename: sFilename, tipo: sTipo,
            intestatario: sIntestatario, clausole: oData.clausole || [],
            metadati: sStep === "ALLEGATO" ? aAllegatoMetadati : aMetadati,
            allegatoID: sAllegatoID
          })
        });
        if (oResp.ok) {
          sap.m.MessageToast.show("Bozza salvata. Potrai riprenderla riaprendo il wizard per questo documento.");
        } else {
          MessageBox.error("Errore salvataggio bozza: " + await oResp.text());
        }
      } catch (e) {
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
