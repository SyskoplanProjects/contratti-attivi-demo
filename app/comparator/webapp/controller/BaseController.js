sap.ui.define(["sap/ui/core/mvc/Controller", "sap/m/MessageBox", "sap/ui/model/json/JSONModel", "sap/ui/model/odata/v4/ODataModel"],
function (Controller, MessageBox, JSONModel, ODataModel) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.comparator.controller.BaseController", {
    formatter: {
      statoCoverageState: function (sStato) {
        return sStato === "MATCH_TEMPLATE" ? "Success" : sStato === "VARIANTE" ? "Warning" : "Error";
      },
      esitoState: function (sEsito) {
        return sEsito === "PRESENTE" ? "Success" : sEsito === "PARZIALE" ? "Warning" : sEsito === "NUOVA" ? "Information" : "Error";
      },
      confidenzaText: function (fConfidenza) {
        return fConfidenza != null ? (Math.round(fConfidenza * 10000) / 100) + "%" : "";
      }
    },

    // Presenza subfornitori: letta direttamente dal metadato "subfornitori" già estratto dal
    // documento (vedi tipologie-allegato.js, tipo CONTRATTO) — nessuna verifica esterna, solo
    // indicare se il contratto ne dichiara o no.
    _buildSubfornitoriModel: function (oCoverageData) {
      var oMeta = ((oCoverageData && oCoverageData.metadati) || []).find(function (m) { return m.campo === "subfornitori"; });
      var sValore = oMeta && oMeta.valore ? String(oMeta.valore).trim() : "";
      return { presente: sValore.length > 0, elenco: sValore };
    },

    // Stato DORA: letto dal metadato "presenzaClausoleDORA" già estratto (si/no/testo libero
    // del modello) — va indicato in modo chiaro e prominente, non lasciato in mezzo alla
    // tabella dei 28 metadati generici. determinato:false quando il campo non è stato
    // valorizzato dal modello (nessun segnale nel documento, non equivale a "no").
    _buildDoraModel: function (oCoverageData) {
      var oMeta = ((oCoverageData && oCoverageData.metadati) || []).find(function (m) { return m.campo === "presenzaClausoleDORA"; });
      var sValore = oMeta && oMeta.valore ? String(oMeta.valore).trim().toLowerCase() : "";
      var bDetermined = sValore.length > 0;
      var bDora = sValore.indexOf("s") === 0; // "si" / "sì"
      return { determinato: bDetermined, dora: bDetermined && bDora };
    },

    _initChatState: function () {
      this._threadId = null;
      this._messages = [];
      this._agenteModel = null;
      this.getView().setModel(new JSONModel({ expanded: false }), "aiPanel");
    },

    onToggleAiPanel: function () {
      var oAiModel = this.getView().getModel("aiPanel");
      var bExpand = !oAiModel.getProperty("/expanded");
      oAiModel.setProperty("/expanded", bExpand);
      var oPanel = this.byId("aiPanel");
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
          var oBinding = this._agenteModel.bindContext("/openThread(...)");
          await oBinding.execute();
          this._threadId = oBinding.getBoundContext().getObject().value;
        } catch (e) {
          MessageBox.error("Impossibile avviare la chat: " + (e.message || String(e)));
        }
      }
    },

    onInviaMessaggio: async function () {
      var oInput = this.byId("chatInput");
      var sMsg = oInput.getValue();
      if (!sMsg || !this._threadId) return;

      var sFullMsg = sMsg;
      try {
        var oCoverageData = JSON.parse(sessionStorage.getItem("coverageResult") || "{}");
        if (oCoverageData && oCoverageData.clausole && oCoverageData.clausole.length) {
          var sCtx = "[CONTESTO ANALISI COPERTURA]\nCoverage: " + (oCoverageData.coveragePercent ?? "?") + "%\n";
          if (oCoverageData.previewID) sCtx += "PreviewID: " + oCoverageData.previewID + "\n";
          oCoverageData.clausole.forEach(function (c) {
            var sim = c.similarity != null ? Math.round(c.similarity * 100) + "%" : "N/A";
            sCtx += "- " + (c.templateTitolo || c.titolo) + ": " + c.stato + " (" + sim + ")\n";
          });
          sFullMsg = sCtx + "\nDomanda: " + sMsg;
        }
      } catch (e) { /* sessionStorage not available */ }

      this._messages.push({ role: "Tu", text: sMsg });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");
      oInput.setValue("");

      this._messages.push({ role: "Assistente", text: "..." });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");

      try {
        var oBinding = this._agenteModel.bindContext("/sendMessage(...)")
          .setParameter("message", sFullMsg)
          .setParameter("thread_id", this._threadId);
        await oBinding.execute();
        var oResult = oBinding.getBoundContext().getObject();
        var replies = oResult.value || oResult;
        this._messages.pop();
        if (replies && replies.length) {
          replies.forEach(function (r) { this._messages.push({ role: "Assistente", text: r }); }.bind(this));
          this.getView().setModel(new JSONModel(this._messages), "chatMessages");
        }
      } catch (e) {
        this._messages.pop();
        this._messages.push({ role: "Sistema", text: "Errore: " + (e.message || String(e)) });
        this.getView().setModel(new JSONModel(this._messages), "chatMessages");
      }
    },

    onNuovaConversazione: async function () {
      try {
        if (this._threadId) {
          await this._agenteModel.bindContext("/deleteThread(...)")
            .setParameter("thread_id", this._threadId)
            .execute();
        }
      } catch (e) { /* ignore */ }
      this._threadId = null;
      this._messages = [];
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");

      try {
        var oBinding = this._agenteModel.bindContext("/openThread(...)")
          .setParameter("forceNew", true);
        await oBinding.execute();
        this._threadId = oBinding.getBoundContext().getObject().value;
        sap.m.MessageToast.show("Nuova conversazione avviata.");
      } catch (e) {
        MessageBox.error("Impossibile avviare la chat: " + (e.message || String(e)));
      }
    }
  });
});
