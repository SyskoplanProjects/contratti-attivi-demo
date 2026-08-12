sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/odata/v4/ODataModel"
], function (Controller, MessageBox, JSONModel, ODataModel) {
  "use strict";

  // Logica dell'assistente AI condivisa da tutte le pagine dell'app contratti. Il pannello
  // (fragment AiPanel) è incluso direttamente in ogni vista, sempre presente come tab
  // a scomparsa sul bordo destro — non un dialog aperto su richiesta.
  return Controller.extend("com.reply.contrattiattivi.app.controller.BaseController", {

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

    // Costruisce il blocco [CONTESTO ...] da anteporre al messaggio, in base a cosa
    // l'utente sta guardando: dettaglio di un contratto (this._contrattoID, impostato da
    // Detail.controller.js) oppure l'elenco contratti (tabella "contrattiTable", presente
    // su Main.view.xml). Se nessuno dei due si applica il messaggio va inviato invariato.
    _buildContestoUI: function () {
      if (this._contrattoID) {
        const oContratto = this.getView().getModel("contesto") && this.getView().getModel("contesto").getData();
        if (!oContratto || !oContratto.ID) return null;

        let sCtx = "[CONTESTO CONTRATTO]\n";
        sCtx += "ContrattoID: " + oContratto.ID + "\n";
        sCtx += "Intestatario: " + (oContratto.intestatario || "?") + "\n";
        sCtx += "Stato: " + (oContratto.stato || "?") + "\n";
        (oContratto.clausole || []).forEach(function (c) {
          const sCodice = c.clausola ? c.clausola.codice : "?";
          const sTitolo = c.clausola ? c.clausola.titolo : "?";
          const nVersione = c.clausolaVersione ? c.clausolaVersione.numero : "?";
          sCtx += "- " + sCodice + " (" + sTitolo + "): versione " + nVersione + "\n";
        });
        return sCtx;
      }

      const oTable = this.byId("contrattiTable");
      if (oTable) {
        const oBinding = oTable.getBinding("items");
        const aContexts = oBinding && oBinding.getCurrentContexts ? oBinding.getCurrentContexts() : [];
        const aContratti = aContexts.filter(function (c) { return !!c; }).map(function (c) { return c.getObject(); });
        if (!aContratti.length) return null;

        let sCtx = "[CONTESTO LISTA CONTRATTI]\n";
        sCtx += "Contratti attualmente visibili all'utente (con eventuali filtri applicati): " + aContratti.length + "\n";
        aContratti.forEach(function (c) {
          sCtx += "- " + c.ID + " | " + (c.intestatario || "?") + " | " + (c.stato || "?") + "\n";
        });
        return sCtx;
      }

      return null;
    },

    onInviaMessaggio: async function () {
      const oInput = this.byId("chatInput");
      const sMsg = oInput.getValue();
      if (!sMsg || !this._threadId) return;

      let sFullMsg = sMsg;
      try {
        const sCtx = this._buildContestoUI();
        if (sCtx) sFullMsg = sCtx + "\nDomanda: " + sMsg;
      } catch (e) { /* contesto non disponibile, invia messaggio senza */ }

      this._messages.push({ role: "Tu", text: sMsg });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");
      oInput.setValue("");

      this._messages.push({ role: "Assistente", text: "..." });
      this.getView().setModel(new JSONModel(this._messages), "chatMessages");

      try {
        const oBinding = this._agenteModel
          .bindContext("/sendMessage(...)")
          .setParameter("message", sFullMsg)
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

    // Dialog storico versioni di una clausola, condiviso tra l'Object Page contratto (dove
    // "this._contrattoID" esiste ed è escluso dalla lista di copia) e la vista globale Clausole
    // (dove non c'è un contratto corrente, quindi nessuna esclusione si applica).
    _apriDialogStorico: function (sClausolaID) {
      if (!this._pStorico) {
        this._pStorico = this.loadFragment({ name: "com.reply.contrattiattivi.app.fragment.StoricoClausola" });
      }
      this._pStorico.then(oDialog => {
        oDialog.open();
        this._loadStorico(sClausolaID);
      });
    },

    _loadStorico: async function (sClausolaID) {
      const oBinding = this.getOwnerComponent().getModel()
        .bindContext("/getStoricoClausola(...)")
        .setParameter("clausolaID", sClausolaID);
      await oBinding.execute();
      const oResult = oBinding.getBoundContext().getObject();
      const aData = oResult.value || oResult;
      this._pStorico.then(oDialog => {
        oDialog.setModel(new JSONModel(aData), "storico");
      });
    },

    onSelezionaVersioneStorico: async function (oEvent) {
      if (!this._versioneSelezionata) {
        this._versioneSelezionata = oEvent.getSource().getBindingContext("storico").getProperty("versioneID");
        sap.m.MessageToast.show("Prima versione selezionata. Seleziona la seconda per confrontare.");
        return;
      }
      const versioneID2 = oEvent.getSource().getBindingContext("storico").getProperty("versioneID");
      const oBinding = this.getOwnerComponent().getModel()
        .bindContext("/confrontaVersioni(...)")
        .setParameter("versioneID1", this._versioneSelezionata)
        .setParameter("versioneID2", versioneID2);
      await oBinding.execute();
      const oData = oBinding.getBoundContext().getObject();
      if (!this._pConfronto) {
        this._pConfronto = this.loadFragment({ name: "com.reply.contrattiattivi.app.fragment.ConfrontoVersioni" });
      }
      this._pConfronto.then(oDialog => {
        oDialog.setModel(new JSONModel(oData), "confronto");
        oDialog.open();
      });
      this._versioneSelezionata = null;
    },

    onCopiaVersioneClausola: async function (oEvent) {
      const sVersioneID = oEvent.getSource().getBindingContext("storico").getProperty("versioneID");
      const oModel = this.getOwnerComponent().getModel();

      let aContratti;
      try {
        const oResp = await fetch(oModel.getServiceUrl() + "Contratto?$filter=stato eq 'BOZZA'&$select=ID,intestatario");
        const oJson = await oResp.json();
        aContratti = (oJson.value || []).filter(c => c.ID !== this._contrattoID);
      } catch (e) {
        MessageBox.error("Errore caricamento contratti: " + (e.message || String(e)));
        return;
      }
      if (!aContratti.length) {
        MessageBox.information("Nessun altro contratto in bozza su cui copiare la clausola.");
        return;
      }

      const oDialog = new sap.m.Dialog({
        title: "Copia versione clausola in un altro contratto",
        content: new sap.m.Select({
          id: "selContrattoDestinazione",
          forceSelection: true,
          width: "100%",
          items: aContratti.map(c => new sap.ui.core.Item({ key: c.ID, text: c.intestatario }))
        }),
        beginButton: new sap.m.Button({
          text: "Copia",
          press: async () => {
            const sDestinazioneID = sap.ui.getCore().byId("selContrattoDestinazione").getSelectedKey();
            if (!sDestinazioneID) return;
            try {
              await oModel.bindContext("/copiaVersioneClausola(...)")
                .setParameter("clausolaVersioneID", sVersioneID)
                .setParameter("contrattoDestinazioneID", sDestinazioneID)
                .execute();
              MessageToast.show("Versione copiata nel contratto selezionato.");
              oDialog.close();
            } catch (e) {
              MessageBox.error(e.message || String(e));
            }
          }
        }),
        endButton: new sap.m.Button({ text: "Annulla", press: () => oDialog.close() }),
        afterClose: () => oDialog.destroy()
      });
      oDialog.open();
    },

    onChiudiStorico: function () {
      this._pStorico.then(oDialog => oDialog.close());
    },

    onDettaglioVersioneStorico: function (oEvent) {
      const oData = oEvent.getSource().getBindingContext("storico").getObject();
      if (!this._oDettaglioVersioneDialog) {
        this._oDettaglioVersioneDialog = new sap.m.Dialog({
          title: "Testo clausola",
          contentWidth: "40rem",
          content: new sap.m.Text({ id: "dettaglioVersioneTesto", wrapping: true }),
          beginButton: new sap.m.Button({ text: "Chiudi", press: () => this._oDettaglioVersioneDialog.close() })
        });
      }
      this._oDettaglioVersioneDialog.setTitle("Testo clausola - versione " + oData.numero);
      sap.ui.getCore().byId("dettaglioVersioneTesto").setText(oData.testo || "");
      this._oDettaglioVersioneDialog.open();
    },

    _apriDialogContrattiClausola: function (sClausolaID) {
      if (!this._pContrattiClausola) {
        this._pContrattiClausola = this.loadFragment({ name: "com.reply.contrattiattivi.app.fragment.ContrattiClausola" });
      }
      this._pContrattiClausola.then(async oDialog => {
        oDialog.open();
        const oBinding = this.getOwnerComponent().getModel()
          .bindContext("/getContrattiClausola(...)")
          .setParameter("clausolaID", sClausolaID);
        await oBinding.execute();
        const oResult = oBinding.getBoundContext().getObject();
        oDialog.setModel(new JSONModel(oResult.value || oResult), "contratti");
      });
    },

    onChiudiContrattiClausola: function () {
      this._pContrattiClausola.then(oDialog => oDialog.close());
    },

    onAnteprimaContratto: function (oEvent) {
      const sContrattoID = oEvent.getSource().getBindingContext("contratti").getProperty("contrattoID");
      this._apriDialogAnteprimaContratto(sContrattoID);
    },

    _apriDialogAnteprimaContratto: function (sContrattoID) {
      if (!this._pAnteprimaContratto) {
        this._pAnteprimaContratto = this.loadFragment({ name: "com.reply.contrattiattivi.app.fragment.AnteprimaContratto" });
      }
      this._pAnteprimaContratto.then(async oDialog => {
        oDialog.open();
        try {
          const oModel = this.getOwnerComponent().getModel();
          // Accesso diretto per chiave, non $filter=ID eq <guid>: su hana quel filtro da' sempre
          // 400 (vedi Detail.controller.js#_caricaContesto), mai capitato su sqlite.
          const sUrl = oModel.getServiceUrl()
            + `Contratto(${sContrattoID})?$expand=clausole($expand=clausolaVersione,clausola;$filter=rimossa eq false;$orderby=ordine)`;
          const oResp = await fetch(sUrl);
          const oContratto = oResp.ok ? await oResp.json() : {};
          oDialog.setModel(new JSONModel(oContratto), "anteprima");
        } catch (e) {
          MessageBox.error("Errore caricamento anteprima: " + (e.message || String(e)));
        }
      });
    },

    onChiudiAnteprimaContratto: function () {
      this._pAnteprimaContratto.then(oDialog => oDialog.close());
    },

    onChiudiConfronto: function () {
      this._pConfronto.then(oDialog => oDialog.close());
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
