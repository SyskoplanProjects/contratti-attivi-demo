sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "../formatter"
], function (BaseController, MessageBox, MessageToast, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.ImportPreview", {
    formatter: formatter,

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
        const oResp = await fetch(sEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewID: oData.previewID,
            clausole: oData.clausole
          })
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
