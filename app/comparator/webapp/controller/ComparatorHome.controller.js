sap.ui.define(["./BaseController", "sap/m/MessageBox"],
function (BaseController, MessageBox) {
  "use strict";
  return BaseController.extend("com.reply.contrattiattivi.comparator.controller.ComparatorHome", {
    onInit: function () {
      this._initChatState();
      this._oFile = null;
      this._aAllegati = [];
      this._sTemplateID = null;

      var sTemplateID = this._getUrlParam("templateID");
      if (sTemplateID) {
        this._sTemplateID = sTemplateID;
      }

      var sContractID = this._getUrlParam("contractID");
      var sContractName = this._getUrlParam("contractName");
      if (sContractID && sContractName) {
        this._sContractID = sContractID;
        this._sContractName = sContractName;
        sessionStorage.setItem("comparatorContractID", sContractID);
        sessionStorage.setItem("comparatorContractName", sContractName);
        this.byId("contractInfoHint").setText("Verifica per: " + sContractName);
        this.byId("contractInfoHint").setVisible(true);
        this.byId("btnAvviaContratto").setVisible(true);
        this.byId("fileUploadSection").setVisible(false);
        this.byId("allegatiUploadSection").setVisible(false);
        this.byId("btnAvvia").setVisible(false);
        this.byId("templateIDHint").setText("Template precaricato. Premere 'Avvia verifica contratto' per confrontare le clausole del contratto con il template.");
        this.byId("templateIDHint").setVisible(true);
      } else {
        sessionStorage.removeItem("comparatorContractID");
        sessionStorage.removeItem("comparatorContractName");
        this.byId("btnAvviaContratto").setVisible(false);
        if (sTemplateID) {
          this.byId("templateIDHint").setText("Template precaricato. Carica un documento per iniziare.");
          this.byId("templateIDHint").setVisible(true);
        }
      }
      this._caricaTemplateList();
    },

    _caricaTemplateList: async function () {
      try {
        var oResp = await fetch("/comparator/getTemplates", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        if (!oResp.ok) {
          console.warn("Impossibile caricare template");
          this.byId("templateSelectHint").setText("Analisi automatica (contratti e template in archivio)");
          return;
        }
        var oData = await oResp.json();
        var aTemplate = oData.value || (Array.isArray(oData) ? oData : []);
        var aItems = aTemplate.map(function (t) {
          return new sap.ui.core.Item({ key: t.ID, text: t.nome });
        });
        this.byId("templateSelect").destroyItems();
        aItems.forEach(function (oItem) { this.byId("templateSelect").addItem(oItem); }.bind(this));
        if (this._sTemplateID) {
          this.byId("templateSelect").setSelectedKey(this._sTemplateID);
          if (!this.byId("templateSelect").getSelectedItem()) {
            this._sTemplateID = null;
          }
        }
        this._aggiornaHintTemplate();
      } catch (e) {
        console.warn("Errore caricamento template:", e);
        this.byId("templateSelectHint").setText("Analisi automatica (contratti e template in archivio)");
      }
    },

    onTemplateChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      this._sTemplateID = sKey || null;
      this._aggiornaHintTemplate();
    },

    _aggiornaHintTemplate: function () {
      var oSel = this.byId("templateSelect");
      var sNome = oSel && oSel.getSelectedItem() ? oSel.getSelectedItem().getText() : null;
      this.byId("templateSelectHint").setText(sNome
        ? "Confronto verso template: " + sNome
        : "Analisi automatica (contratti e template in archivio)");
    },

    onFileChange: function (oEvent) {
      var aFiles = oEvent.getParameter("files");
      this._oFile = aFiles && aFiles[0];
      if (this._oFile) {
        this.byId("fileNameText").setText(this._oFile.name);
      }
    },

    onAllegatiChange: function (oEvent) {
      var aFiles = oEvent.getParameter("files");
      this._aAllegati = aFiles ? Array.prototype.slice.call(aFiles) : [];
      this.byId("allegatiNameText").setText(
        this._aAllegati.length ? this._aAllegati.map(function (f) { return f.name; }).join(", ") : ""
      );
    },

    onAvvia: async function () {
      if (!this._oFile) {
        MessageBox.error("Seleziona un file.");
        return;
      }

      var sTemplateID = this._sTemplateID || null;

      var oBusy = new sap.m.BusyDialog({ text: "Caricamento file..." });
      oBusy.open();

      var oFile = this._oFile;
      var sBase64 = await this._fileToBase64(oFile);
      // Tenuto in memoria sul Component (non sessionStorage, stessa ragione di _wizardPdfCache:
      // la codifica base64 può superare la quota ~5MB) per permettere al wizard di ricalcolare
      // la coverage su un candidato alternativo (onSelezionaCandidato) senza far ricaricare il file.
      this.getOwnerComponent()._wizardFileCache = { base64: sBase64, filename: oFile.name };

      var sDefaultPrompt = "Verifica che il documento copra tutti i requisiti previsti dal template di riferimento e dalla normativa applicabile. Per ogni requisito rilevato, indica se presente, parzialmente presente o assente, con riferimento al punto nel documento.";

      try {
        // Gate economico PRIMA dell'estrazione AI costosa (RF-7.2): se il documento non è un
        // contratto, ci si ferma qui senza sprecare l'estrazione clausole + matching template
        // sotto. Il verificaDocumento "vero" (che persiste su DocumentoClassificato) resta più
        // sotto, dopo classificaAllegati, per non duplicare quella scrittura.
        oBusy.setText("Riconoscimento tipo documento in corso...");
        try {
          var oGatePrelResp = await fetch("/comparator/verificaDocumentoPreliminare", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: sBase64, filename: oFile.name })
          });
          if (oGatePrelResp.ok) {
            var oGatePrelData = await oGatePrelResp.json();
            if (oGatePrelData.esitoGate === "ANOMALIA") {
              oBusy.close();
              MessageBox.error(oGatePrelData.dettaglio || "Documento non riconosciuto come contratto.", {
                title: "Anomalia bloccante — " + (oGatePrelData.categoria || "documento non contrattuale")
              });
              return;
            }
          }
        } catch (e) { /* gate preliminare non disponibile: non blocca l'analisi, si passa al flusso pieno */ }

        oBusy.setText("Analisi copertura in corso...");

        var oCoverageResp = await fetch("/comparator/calcolaCoverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: sBase64, filename: oFile.name, templateID: sTemplateID })
        });
        if (!oCoverageResp.ok) {
          oBusy.close();
          var oErr = await oCoverageResp.text();
          MessageBox.error("Errore copertura: " + oErr);
          return;
        }
        var oCoverageData = await oCoverageResp.json();
        if (oCoverageData.error) {
          oBusy.close();
          MessageBox.error(oCoverageData.error.message || JSON.stringify(oCoverageData.error));
          return;
        }

        oBusy.setText("Verifica compliance in corso...");

        var oComplianceData = null;
        try {
          var oComplianceResp = await fetch("/comparator/verificaCompliance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: sBase64, filename: oFile.name, prompt: sDefaultPrompt, templateID: sTemplateID })
          });
          if (oComplianceResp.ok) {
            oComplianceData = await oComplianceResp.json();
          }
        } catch (e) { /* compliance non bloccante */ }

        var aAllegatiResult = [];
        var oDocumentoPrincipale = null;
        oBusy.setText("Riconoscimento tipo documento in corso...");
        try {
          var aAllegatiPayload = await Promise.all(this._aAllegati.map(async (oAllegato) => ({
            filename: oAllegato.name, file: await this._fileToBase64(oAllegato)
          })));
          var oAllegatiResp = await fetch("/comparator/classificaAllegati", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ previewID: oCoverageData.previewID, allegati: aAllegatiPayload })
          });
          if (oAllegatiResp.ok) {
            var oAllegatiData = await oAllegatiResp.json();
            aAllegatiResult = (oAllegatiData && oAllegatiData.allegati) || [];
            oDocumentoPrincipale = (oAllegatiData && oAllegatiData.documentoPrincipale) || null;
          }
        } catch (e) { /* riconoscimento tipo documento non bloccante */ }

        // Punto 3 spec: se la classificazione con allegati non ha prodotto sottoTipo (es. embedding
        // ALTRO), si tenta un fallback backend dedicato (gpt-4o-mini) sul testo del documento
        // principale. Non bloccante.
        if (!oDocumentoPrincipale || !oDocumentoPrincipale.sottoTipo) {
          try {
            var oClassResp = await fetch("/comparator/classificaDocumentoPrincipale", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ previewID: oCoverageData.previewID })
            });
            if (oClassResp.ok) {
              var oClassData = await oClassResp.json();
              if (oClassData && oClassData.categoria) oDocumentoPrincipale = oClassData;
            }
          } catch (e) { /* classificazione fallback non bloccante */ }
        }

        // Gate step 1-2 del flusso: se il documento non è riconosciuto come contratto, si
        // interrompe qui e si registra l'anomalia bloccante invece di proseguire alla
        // verifica di completezza (che presuppone un contratto già identificato).
        try {
          var oGateResp = await fetch("/comparator/verificaDocumento", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ previewID: oCoverageData.previewID })
          });
          if (oGateResp.ok) {
            var oGateData = await oGateResp.json();
            if (oGateData.esitoGate === "ANOMALIA") {
              oBusy.close();
              MessageBox.error(oGateData.dettaglio || "Documento non riconosciuto come contratto.", {
                title: "Anomalia bloccante — " + (oGateData.categoria || "documento non contrattuale")
              });
              return;
            }
          }
        } catch (e) { /* gate non disponibile: non blocca l'analisi in corso */ }

        oBusy.setText("Generazione tips AI in corso...");
        var oTipsData = null;
        try {
          // Le tips AI confrontano il documento con un template/altri contratti: richiede un
          // riferimento affidabile (template scelto esplicitamente o auto-match con coverage
          // >= 50) e una categorizzazione del documento (sottoTipo o almeno categoria macro).
          // Se la classificazione resta ALTRO (sottoTipo e categoria nulli) ma il template è
          // scelto esplicitamente (sTemplateID), non bloccare: il confronto verso quel template
          // resta significativo perché scelto dall'utente.
          var bDocumentoCategorizzato = !!(oDocumentoPrincipale && (oDocumentoPrincipale.sottoTipo || oDocumentoPrincipale.categoria));
          var bRiferimentoAffidabile = sTemplateID ||
            (oCoverageData.riferimentoTrovato && oCoverageData.riferimentoTrovato.templateID && oCoverageData.coveragePercent >= 50);
          if (bRiferimentoAffidabile && (bDocumentoCategorizzato || sTemplateID)) {
            var sTemplateIDPerTips = sTemplateID || oCoverageData.riferimentoTrovato.templateID;
            var aClausoleUsate = (oCoverageData.clausole || [])
              .filter(function (c) { return c.matchClausolaID; })
              .map(function (c) { return { clausolaID: c.matchClausolaID, versione: c.versione }; });
            var oTipsResp = await fetch("/comparator/generaTipsAI", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templateID: sTemplateIDPerTips, clausole: aClausoleUsate })
            });
            if (oTipsResp.ok) {
              oTipsData = await oTipsResp.json();
            }
          }
        } catch (e) { /* tips AI non bloccante */ }

        oBusy.setText("Verifica completezza, deroghe e subfornitori in corso...");
        await this._eseguiVerificheContratto(oCoverageData.previewID, aAllegatiResult);

        oBusy.close();

        // pdfBase64 (contratto + ogni allegato) è tenuto fuori da sessionStorage: su un
        // contratto scansionato di qualche MB, la codifica base64 (+33%) supera facilmente
        // la quota ~5MB per-origine di sessionStorage. La navigazione verso il wizard è un
        // cambio di rotta SPA nello stesso documento, quindi il payload binario può restare
        // in memoria sul Component invece di fare un giro per sessionStorage come stringa.
        this.getOwnerComponent()._wizardPdfCache = {
          contratto: oCoverageData.pdfBase64 || null,
          allegati: aAllegatiResult.map(function (a) { return a.pdfBase64 || null; })
        };
        var oCoverageDataSlim = { ...oCoverageData, pdfBase64: undefined };
        var aAllegatiResultSlim = aAllegatiResult.map(function (a) { return { ...a, pdfBase64: undefined }; });

        sessionStorage.setItem("coverageResult", JSON.stringify(oCoverageDataSlim));
        sessionStorage.setItem("complianceResult", JSON.stringify(oComplianceData));
        sessionStorage.setItem("tipsAIResult", JSON.stringify(oTipsData));
        sessionStorage.setItem("comparatorFilename", oFile.name);
        sessionStorage.setItem("allegatiResult", JSON.stringify(aAllegatiResultSlim));
        sessionStorage.setItem("documentoPrincipaleResult", JSON.stringify(oDocumentoPrincipale));

        setTimeout(() => {
          var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
          oRouter.navTo("wizard", { previewID: "merged" });
        }, 150);
      } catch (e) {
        oBusy.close();
        MessageBox.error("Errore: " + e.message);
      }
    },

    onAnnulla: function () {
      this._oFile = null;
      this._aAllegati = [];
      this.byId("fileNameText").setText("");
      this.byId("fileUploader").clear();
      this.byId("allegatiNameText").setText("");
      this.byId("allegatiUploader").clear();
    },

    onAvviaVerificaContratto: async function () {
      var sContractID = this._sContractID;
      var sTemplateID = this._sTemplateID || null;
      if (!sContractID) { MessageBox.error("ID contratto mancante."); return; }

      var sDefaultPrompt = "Verifica che il documento copra tutti i requisiti previsti dal template di riferimento e dalla normativa applicabile. Per ogni requisito rilevato, indica se presente, parzialmente presente o assente, con riferimento al punto nel documento.";

      var oBusy = new sap.m.BusyDialog({ text: "Analisi copertura contratto in corso..." });
      oBusy.open();

      try {
        oBusy.setText("Confronto clausole contratto con template...");
        var oCoverageResp = await fetch("/comparator/calcolaCoverageDaContratto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractID: sContractID, templateID: sTemplateID })
        });
        if (!oCoverageResp.ok) {
          oBusy.close();
          var oErr = await oCoverageResp.text();
          MessageBox.error("Errore copertura: " + oErr);
          return;
        }
        var oCoverageData = await oCoverageResp.json();
        if (oCoverageData.error) {
          oBusy.close();
          MessageBox.error(oCoverageData.error.message || JSON.stringify(oCoverageData.error));
          return;
        }

        oBusy.setText("Verifica compliance in corso...");
        var oComplianceData = null;
        try {
          var oComplianceResp = await fetch("/comparator/verificaComplianceDaContratto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contractID: sContractID, prompt: sDefaultPrompt })
          });
          if (oComplianceResp.ok) {
            oComplianceData = await oComplianceResp.json();
          }
        } catch (e) { /* compliance non bloccante */ }

        oBusy.setText("Generazione tips AI in corso...");
        var oTipsData = null;
        try {
          var oTipsResp = await fetch("/comparator/generaTipsAI", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateID: sTemplateID, contractID: sContractID, clausole: [] })
          });
          if (oTipsResp.ok) {
            oTipsData = await oTipsResp.json();
          }
        } catch (e) { /* tips AI non bloccante */ }

        oBusy.setText("Verifica completezza, deroghe e subfornitori in corso...");
        await this._eseguiVerificheContratto(oCoverageData.previewID, []);

        oBusy.close();

        // pdfBase64 fuori da sessionStorage, stesso motivo/pattern di onAvvia sopra: su un
        // contratto scansionato di qualche MB la quota ~5MB per-origine salterebbe.
        this.getOwnerComponent()._resultPdfCache = oCoverageData.pdfBase64 || null;
        var oCoverageDataSlim = { ...oCoverageData, pdfBase64: undefined };

        sessionStorage.setItem("coverageResult", JSON.stringify(oCoverageDataSlim));
        sessionStorage.setItem("complianceResult", JSON.stringify(oComplianceData));
        sessionStorage.setItem("tipsAIResult", JSON.stringify(oTipsData));
        sessionStorage.setItem("comparatorFilename", this._sContractName || "Contratto");

        setTimeout(() => {
          var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
          oRouter.navTo("result", { previewID: "merged" });
        }, 150);
      } catch (e) {
        oBusy.close();
        MessageBox.error("Errore: " + e.message);
      }
    },

    _getUrlParam: function (sParam) {
      var sPageURL = window.location.search.substring(1);
      var sURLVariables = sPageURL.split("&");
      for (var i = 0; i < sURLVariables.length; i++) {
        var sPair = sURLVariables[i].split("=");
        if (sPair[0] === sParam) return decodeURIComponent(sPair[1]);
      }
      return null;
    },

    onNavBack: function () {
      var sFrom = this._getUrlParam("from");
      if (sFrom === "contratto") {
        history.back();
      } else {
        window.location.href = "/cockpit/webapp/index.html";
      }
    },

    onCreaManualmente: function () {
      window.location.href = "/inserimento/webapp/index.html#/manuale";
    },
    onCreaDaTemplate: function () {
      window.location.href = "/inserimento/webapp/index.html#/nuovoContratto";
    },

    // Esegue le verifiche del comparator (completezza allegati, deroghe vs CGC standard) e
    // salva gli esiti in sessionStorage per Wizard/ComparatorResult. Non bloccante: un
    // fallimento su una verifica non impedisce di mostrare l'altra né di proseguire l'analisi.
    // La presenza di subfornitori si legge invece direttamente dal metadato "subfornitori"
    // già estratto (vedi Wizard/ComparatorResult), nessuna chiamata dedicata necessaria.
    _eseguiVerificheContratto: async function (sPreviewID, aAllegatiClassificati) {
      if (!sPreviewID) return;
      try {
        var oResp = await fetch("/comparator/verificaCompletezza", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewID: sPreviewID,
            allegati: (aAllegatiClassificati || []).map(function (a) { return { filename: a.filename, tipo: a.tipo }; })
          })
        });
        if (oResp.ok) sessionStorage.setItem("completezzaResult", await oResp.text());
      } catch (e) { /* non bloccante */ }

      try {
        var oRespD = await fetch("/comparator/verificaDeroghe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewID: sPreviewID })
        });
        if (oRespD.ok) sessionStorage.setItem("derogheResult", await oRespD.text());
      } catch (e) { /* non bloccante */ }
    },

    _fileToBase64: function (oFile) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(oFile);
      });
    }
  });
});
