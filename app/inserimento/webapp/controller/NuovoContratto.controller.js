sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox"
], function (BaseController, MessageBox) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.NuovoContratto", {
    onInit: function () {
      this._initChatState();
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("home");
    },

    onCrea: async function () {
      const sTemplateID = this.byId("selTemplateContratto").getSelectedKey();
      if (!sTemplateID) {
        MessageBox.error("Seleziona un template.");
        return;
      }

      const sContrattoOrigineID = this.byId("cbContrattoOrigine").getSelectedKey() || null;

      try {
        const oResp = await fetch("/contratti/creaDaTemplate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateID: sTemplateID, contrattoOrigineID: sContrattoOrigineID })
        });
        if (!oResp.ok) {
          const oErr = await oResp.json();
          throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
        }
        const oContratto = await oResp.json();
        const oLink = this.byId("lnkContrattoCreato");
        oLink.setHref("/contratti/webapp/index.html#/detail/" + encodeURIComponent(oContratto.ID));
        oLink.setVisible(true);
      } catch (e) {
        MessageBox.error("Creazione fallita: " + (e.message || String(e)));
      }
    }
  });
});
