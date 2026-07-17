sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (BaseController, MessageBox, MessageToast) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Template", {
    onInit: function () {
      this._initChatState();
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    },

    onFileChange: function (oEvent) {
      this._oFile = oEvent.getParameter("files")[0];
    },

    onImporta: async function () {
      if (!this._oFile) {
        MessageBox.error("Seleziona un file .docx o .xlsx.");
        return;
      }
      const formData = new FormData();
      formData.append("file", this._oFile);

      try {
        const resp = await fetch("/contratti/importTemplate", { method: "POST", body: formData });
        const body = await resp.json();
        if (!resp.ok) {
          MessageBox.error(body.message || `Errore HTTP ${resp.status}`);
          return;
        }
        MessageToast.show(`Import completato: ${body.clausoleCreate} nuove, ${body.clausoleRiutilizzate} riusate, ${body.clausoleConDelta} con delta.`);
        this.byId("templateTable").getBinding("items").refresh();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onSelectTemplate: function (oEvent) {
      const sId = oEvent.getSource().getBindingContext().getProperty("ID");
      this.getOwnerComponent().getRouter().navTo("templateDetail", { id: encodeURIComponent(sId) });
    },

    onEliminaTemplate: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext();
      const sID = oContext.getProperty("ID");
      const sNome = oContext.getProperty("nome");
      sap.m.MessageBox.confirm("Eliminare template \"" + sNome + "\" e tutte le clausole associate?", {
        title: "Elimina template",
        actions: ["Elimina", "Annulla"],
        onClose: async function (sAction) {
          if (sAction !== "Elimina") return;
          try {
            const oResp = await fetch("/contratti/cancellaTemplate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templateID: sID })
            });
            if (!oResp.ok) {
              const oErr = await oResp.json();
              throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
            }
            MessageToast.show("Template eliminato.");
            this.byId("templateTable").getBinding("items").refresh();
          } catch (e) {
            MessageBox.error("Errore: " + (e.message || String(e)));
          }
        }.bind(this)
      });
    }
  });
});
