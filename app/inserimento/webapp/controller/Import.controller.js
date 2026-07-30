sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.Import", {
    onInit: function () {
      this._initChatState();
      this._file = null;
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("home");
    },

    onApriUpload: function () {
      if (!this._pPopover) {
        this._pPopover = this.loadFragment({
          name: "com.reply.contrattiattivi.inserimento.fragment.PopoverUpload"
        }).then(function (oPopover) {
          this._oPopover = oPopover;
          return oPopover;
        }.bind(this));
      }
      this._pPopover.then(function (oPopover) {
        oPopover.openBy(this.byId("btnCarica"));
      }.bind(this));
    },

    onFileChange: function (oEvent) {
      const aFiles = oEvent.getParameter("files");
      this._file = aFiles && aFiles[0];
    },

    onChiudiPopover: function () {
      this._oPopover.close();
    },

    onConfermaUpload: function () {
      if (!this._file) {
        MessageBox.error("Seleziona un file prima di confermare.");
        return;
      }
      this.byId("txtFileSelezionato").setText(this._file.name);
      this._oPopover.close();
    },

    onAnalizza: async function () {
      if (!this._file) {
        MessageBox.error("Carica un documento prima di analizzare.");
        return;
      }

      const sTemplateID = this.byId("selTemplate").getSelectedKey() || "";

      const oFormData = new FormData();
      oFormData.append("file", this._file, this._file.name);
      if (sTemplateID) oFormData.append("templateID", sTemplateID);

      try {
        const oResp = await fetch("/contratti/previewImportAI", { method: "POST", body: oFormData });
        if (!oResp.ok) {
          const oErr = await oResp.json();
          throw new Error(oErr.message || ("HTTP " + oResp.status));
        }
        const oResult = await oResp.json();

        this.getOwnerComponent().setModel(new JSONModel({
          mode: "import",
          previewID: oResult.previewID,
          templateID: sTemplateID || null,
          clausole: oResult.clausole
        }), "preview");

        this.getOwnerComponent().getRouter().navTo("importPreview");
      } catch (e) {
        MessageBox.error("Analisi fallita: " + (e.message || String(e)));
      }
    },

    onConfrontaCopertura: async function () {
      if (!this._file) {
        MessageBox.error("Carica un documento prima di confrontare.");
        return;
      }
      var sTemplateID = this.byId("selTemplate").getSelectedKey();
      if (!sTemplateID) {
        MessageBox.error("Seleziona un template per il confronto.");
        return;
      }
      var oFormData = new FormData();
      oFormData.append("file", this._file, this._file.name);
      oFormData.append("templateID", sTemplateID);

      try {
        var oResp = await fetch("/comparator/uploadCoverage", { method: "POST", body: oFormData });
        if (!oResp.ok) {
          var oErr = await oResp.json();
          throw new Error(oErr.message || ("HTTP " + oResp.status));
        }
        var oResult = await oResp.json();

        this.getOwnerComponent().setModel(new JSONModel({
          mode: "coverage",
          previewID: oResult.previewID,
          templateID: sTemplateID,
          filename: this._file.name,
          coveragePercent: oResult.coveragePercent,
          clausole: oResult.clausole,
          metadati: oResult.metadati || [],
          testoDocumento: ""
        }), "preview");

        this.getOwnerComponent().getRouter().navTo("importPreview");
      } catch (e) {
        MessageBox.error("Confronto fallito: " + (e.message || String(e)));
      }
    }
  });
});
