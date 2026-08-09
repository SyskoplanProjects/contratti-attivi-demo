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
      this._aFile = Array.prototype.slice.call(oEvent.getParameter("files") || []);
      this.byId("fileSelezionatiText").setText(
        this._aFile.length ? this._aFile.map(function (f) { return f.name; }).join(", ") : ""
      );
      this._aggiornaStatoBottone();
    },

    onNomeTemplateChange: function () {
      this._aggiornaStatoBottone();
    },

    _aggiornaStatoBottone: function () {
      var sNome = (this.byId("nomeTemplateInput").getValue() || "").trim();
      var bAbilitato = !!sNome && !!(this._aFile && this._aFile.length);
      this.byId("creaTemplateBtn").setEnabled(bAbilitato);
    },

    onCreaTemplate: async function () {
      var sNome = (this.byId("nomeTemplateInput").getValue() || "").trim();
      if (!sNome) {
        MessageBox.error("Inserisci un nome per il template.");
        return;
      }
      if (!this._aFile || !this._aFile.length) {
        MessageBox.error("Seleziona almeno un file.");
        return;
      }

      var formData = new FormData();
      formData.append("nome", sNome);
      this._aFile.forEach(function (oFile) { formData.append("file", oFile); });

      this.byId("creaTemplateBtn").setEnabled(false);
      try {
        var resp = await fetch("/contratti/creaTemplateMultiFile", { method: "POST", body: formData });
        var body = await resp.json();
        if (!resp.ok) {
          MessageBox.error(body.message || ("Errore HTTP " + resp.status));
          return;
        }
        MessageToast.show("Template creato: " + body.clausoleCreate + " clausole.");
        this._aFile = [];
        this.byId("nomeTemplateInput").setValue("");
        this.byId("fileUploader").clear();
        this.byId("fileSelezionatiText").setText("");
        this.byId("templateTable").getBinding("items").refresh();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      } finally {
        this._aggiornaStatoBottone();
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
