sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "../formatter",
  "./MetadataWizardHelper"
], function (BaseController, MessageBox, MessageToast, JSONModel, formatter, metadataWizardHelper) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.ImportPreview", {
    formatter: formatter,
    metadataWizardHelper: metadataWizardHelper,

    onInit: function () {
      this._initChatState();
      this.getOwnerComponent().getRouter().getRoute("importPreview").attachPatternMatched(this._onMatched, this);
    },

    _onMatched: function () {
      const oPreviewModel = this.getOwnerComponent().getModel("preview");
      if (!oPreviewModel) {
        MessageBox.error("Nessuna analisi disponibile, ripeti l'importazione.");
        this.getOwnerComponent().getRouter().navTo("import");
        return;
      }
      this.getView().setModel(oPreviewModel, "preview");

      const oData = oPreviewModel.getData();
      if (oData.mode === "coverage") {
        const aMetadati = (oData.metadati || []).map(function (m) {
          return Object.assign({}, m, { modificatoManualmente: false });
        });
        this.getView().setModel(new JSONModel(metadataWizardHelper.raggruppaPerSezione(aMetadati)), "wizardSezioni");
        this.getView().setModel(new JSONModel({ testo: oData.testoDocumento || "" }), "wizardDocumento");
      }
    },

    onCampoMetadatoModificato: function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext("wizardSezioni");
      if (!oCtx) return;
      oCtx.getModel().setProperty(oCtx.getPath() + "/modificatoManualmente", true);
    },

    _metadatiPiatti: function () {
      const oModel = this.getView().getModel("wizardSezioni");
      if (!oModel) return [];
      return oModel.getData().reduce(function (acc, s) { return acc.concat(s.campi); }, []);
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("import");
    },

    onAnnulla: function () {
      this.getOwnerComponent().getRouter().navTo("home");
    },

    onConferma: async function () {
      const oData = this.getView().getModel("preview").getData();

      try {
        const sEndpoint = oData.mode === "coverage" ? "/comparator/confirmCoverage" : "/contratti/confirmImportAI";
        const oBody = {
          previewID: oData.previewID,
          clausole: oData.clausole
        };
        if (oData.mode === "coverage") {
          oBody.metadati = this._metadatiPiatti();
          oBody.allegati = [];
        }
        const oResp = await fetch(sEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(oBody)
        });
        if (!oResp.ok) {
          const oErr = await oResp.json();
          throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
        }
        MessageToast.show(oData.mode === "coverage" ? "Copertura salvata." : "Import confermato.");
        this.getOwnerComponent().getRouter().navTo("home");
      } catch (e) {
        MessageBox.error("Conferma fallita: " + (e.message || String(e)));
      }
    }
  });
});
