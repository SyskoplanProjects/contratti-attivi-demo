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

      var sDefaultPrompt = "Verifica che il documento copra tutti i requisiti previsti dal template di riferimento e dalla normativa applicabile. Per ogni requisito rilevato, indica se presente, parzialmente presente o assente, con riferimento al punto nel documento.";

      try {
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
          // Le tips AI confrontano il documento con un template/altri contratti: farlo solo se
          // il documento è stato classificato come contratto (sottoTipo determinato) e il
          // riferimento auto-matchato è abbastanza coerente col documento (coveragePercent >= 50,
          // stessa soglia usata per il banner "riferimento potenzialmente non affidabile" nel
          // wizard) — altrimenti si confronterebbe con un template scelto a caso, non correlato.
          var bDocumentoCategorizzato = !!(oDocumentoPrincipale && oDocumentoPrincipale.sottoTipo);
          var bRiferimentoAffidabile = sTemplateID ||
            (oCoverageData.riferimentoTrovato && oCoverageData.riferimentoTrovato.templateID && oCoverageData.coveragePercent >= 50);
          if (bDocumentoCategorizzato && bRiferimentoAffidabile) {
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
        sessionStorage.setItem("coverageResult", JSON.stringify(oCoverageData));
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
