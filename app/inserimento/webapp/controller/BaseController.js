sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/odata/v4/ODataModel"
], function (Controller, MessageBox, JSONModel, ODataModel) {
  "use strict";

  // Logica dell'assistente AI condivisa da tutte le pagine dell'app inserimento. Il pannello
  // (fragment AiPanel) è incluso direttamente in ogni vista, sempre presente come tab
  // a scomparsa sul bordo destro — non un dialog aperto su richiesta.
  return Controller.extend("com.reply.contrattiattivi.inserimento.controller.BaseController", {

    _initChatState: function () {
      this._threadId = null;
      this._messages = [];
      this._agenteModel = null;
      this.getView().setModel(new JSONModel({ expanded: false }), "aiPanel");
    },

    onToggleAiPanel: function () {
      const oAiModel = this.getView().getModel("aiPanel");
      const bExpand = !oAiModel.getProperty("/expanded");
      oAiModel.setProperty("/expanded", bExpand);
      const oPanel = this.byId("aiPanel");
      if (oPanel) oPanel.toggleStyleClass("app-ai-panel-open", bExpand);
      if (bExpand) this._ensureThread();
    },

    _ensureThread: async function () {
      if (!this._agenteModel) {
        this._agenteModel = new ODataModel({
          serviceUrl: "/agente/",
          synchronizationMode: "None",
          operationMode: "Server",
          groupId: "$direct"
        });
      }
      if (!this._threadId) {
        try {
          const oBinding = this._agenteModel.bindContext("/openThread(...)");
          await oBinding.execute();
          this._threadId = oBinding.getBoundContext().getObject().value;
        } catch (e) {
          MessageBox.error("Impossibile avviare la chat: " + (e.message || String(e)));
        }
      }
    },

    onInviaMessaggio: async function () {
      const oInput = this.byId("chatInput");
      const sMsg = oInput.getValue();
      if (!sMsg || !this._threadId) return;

      this._messages.push({ role: "Tu", text: sMsg });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");
      oInput.setValue("");

      this._messages.push({ role: "Assistente", text: "..." });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");

      try {
        const oBinding = this._agenteModel
          .bindContext("/sendMessage(...)")
          .setParameter("message", sMsg)
          .setParameter("thread_id", this._threadId);
        await oBinding.execute();
        const oResult = oBinding.getBoundContext().getObject();
        const replies = oResult.value || oResult;
        this._messages.pop();
        if (replies && replies.length) {
          replies.forEach(r => this._messages.push({ role: "Assistente", text: r }));
          this.getView().setModel(new JSONModel(this._messages), "chatMessages");
        }
      } catch (e) {
        this._messages.pop();
        this._messages.push({ role: "Sistema", text: "Errore: " + (e.message || String(e)) });
        this.getView().setModel(new JSONModel(this._messages), "chatMessages");
      }
    },

    onNuovaConversazione: async function () {
      if (!this._threadId) return;
      try {
        await this._agenteModel
          .bindContext("/deleteThread(...)")
          .setParameter("thread_id", this._threadId)
          .execute();
      } catch (e) { /* ignore */ }
      this._threadId = null;
      this._messages = [];
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");

      try {
        const oBinding = this._agenteModel.bindContext("/openThread(...)");
        await oBinding.execute();
        this._threadId = oBinding.getBoundContext().getObject().value;
      } catch (e) {
        MessageBox.error("Impossibile avviare la chat: " + (e.message || String(e)));
      }
    }
  });
});
