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

      var that = this;
      var oModel = this.getOwnerComponent().getModel();
      var oSelect = this.byId("templateSelect");
      fetch(oModel.getServiceUrl() + "Template")
        .then(function (oResp) { return oResp.json(); })
        .then(function (oData) {
          var aResults = oData.value || (Array.isArray(oData) ? oData : []);
          aResults.forEach(function (oItem) {
            oSelect.addItem(new sap.ui.core.Item({
              key: oItem.ID,
              text: oItem.nome
            }));
          });
          if (sTemplateID) {
            oSelect.setSelectedKey(sTemplateID);
          }
        })
        .catch(function () {
          console.warn("Failed to load templates");
        });
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

      var sTemplateID = this._sTemplateID || this.byId("templateSelect").getSelectedKey();
      if (!sTemplateID) {
        MessageBox.error("Seleziona un template.");
        return;
      }

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
        if (this._aAllegati.length) {
          oBusy.setText("Riconoscimento tipo allegati in corso...");
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
            }
          } catch (e) { /* riconoscimento allegati non bloccante */ }
        }

        oBusy.setText("Generazione tips AI in corso...");
        var oTipsData = null;
        try {
          var aClausoleUsate = (oCoverageData.clausole || [])
            .filter(function (c) { return c.matchClausolaID; })
            .map(function (c) { return { clausolaID: c.matchClausolaID, versione: c.versione }; });
          var oTipsResp = await fetch("/comparator/generaTipsAI", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateID: sTemplateID, clausole: aClausoleUsate })
          });
          if (oTipsResp.ok) {
            oTipsData = await oTipsResp.json();
          }
        } catch (e) { /* tips AI non bloccante */ }

        oBusy.close();

        sessionStorage.setItem("coverageResult", JSON.stringify(oCoverageData));
        sessionStorage.setItem("complianceResult", JSON.stringify(oComplianceData));
        sessionStorage.setItem("tipsAIResult", JSON.stringify(oTipsData));
        sessionStorage.setItem("comparatorFilename", oFile.name);
        sessionStorage.setItem("allegatiResult", JSON.stringify(aAllegatiResult));

        setTimeout(() => {
          var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
          oRouter.navTo("result", { previewID: "merged" });
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
      var sTemplateID = this._sTemplateID || this.byId("templateSelect").getSelectedKey();
      if (!sContractID) { MessageBox.error("ID contratto mancante."); return; }
      if (!sTemplateID) { MessageBox.error("Seleziona un template."); return; }

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

    onOpenDashboard: function () {
      sap.ui.core.UIComponent.getRouterFor(this).navTo("dashboard");
    },

    onCreaManualmente: function () {
      window.location.href = "/inserimento/webapp/index.html#/manuale";
    },
    onCreaDaTemplate: function () {
      window.location.href = "/inserimento/webapp/index.html#/nuovoContratto";
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
