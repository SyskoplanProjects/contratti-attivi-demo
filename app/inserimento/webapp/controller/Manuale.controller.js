sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "../formatter"
], function (BaseController, JSONModel, MessageBox, MessageToast, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.Manuale", {
    formatter: formatter,

    onInit: function () {
      this._initChatState();
      this.getView().setModel(new JSONModel({ righe: [{ titolo: "", testo: "" }], testata: {} }), "manuale");
      this._caricaCategorie();
    },

    _caricaCategorie: async function () {
      const oOwnerModel = this.getOwnerComponent().getModel();
      const oResp = await fetch(oOwnerModel.getServiceUrl() + "getCategorieContratto()");
      const oJson = await oResp.json();
      this.getView().setModel(new JSONModel(oJson.value || []), "categorie");
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("home");
    },

    onAggiungiRiga: function () {
      const oModel = this.getView().getModel("manuale");
      const aRighe = oModel.getProperty("/righe");
      aRighe.push({ titolo: "", testo: "" });
      oModel.setProperty("/righe", aRighe);
    },

    onRimuoviRiga: function (oEvent) {
      const oModel = this.getView().getModel("manuale");
      const oCtx = oEvent.getSource().getBindingContext("manuale");
      const aRighe = oModel.getProperty("/righe");
      const iIndex = aRighe.indexOf(oCtx.getObject());
      aRighe.splice(iIndex, 1);
      oModel.setProperty("/righe", aRighe);
    },

    onAggiungiDaArchivio: async function () {
      const oModel = this.getView().getModel("manuale");
      const oOwnerModel = this.getOwnerComponent().getModel();

      let aClausole = [];
      try {
        const oResp = await fetch(oOwnerModel.getServiceUrl() + "Clausola?$select=ID,codice,titolo&$orderby=codice");
        if (!oResp.ok) { MessageBox.error("HTTP " + oResp.status); return; }
        aClausole = (await oResp.json()).value || [];
      } catch (e) {
        MessageBox.error("Errore caricamento clausole: " + (e.message || String(e)));
        return;
      }
      if (!aClausole.length) {
        MessageBox.information("Nessuna clausola disponibile.");
        return;
      }

      let sVersioneTesto = "";
      let sVersioneTitolo = "";
      const mVersioni = {};
      const oSelVersione = new sap.m.Select({ forceSelection: true, width: "100%", enabled: false });
      const oSelClausola = new sap.m.Select({
        forceSelection: true, width: "100%",
        items: aClausole.map(function (c) {
          return new sap.ui.core.Item({ key: c.ID, text: c.codice + " — " + c.titolo });
        }),
        change: async function (oEvent) {
          const sID = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
          sVersioneTesto = "";
          sVersioneTitolo = "";
          oSelVersione.destroyItems();
          oSelVersione.setEnabled(false);
          if (!sID) return;
          const oClausola = aClausole.find(function (c) { return c.ID === sID; });
          sVersioneTitolo = oClausola ? oClausola.codice + " — " + oClausola.titolo : "";
          try {
            const oResp = await fetch(oOwnerModel.getServiceUrl() + "ClausolaVersione?$filter=clausola_ID eq " + sID + "&$orderby=numero desc&$select=ID,numero,testo");
            if (!oResp.ok) return;
            const aVersioni = (await oResp.json()).value || [];
            aVersioni.forEach(function (v) {
              mVersioni[v.ID] = v.testo || "";
              oSelVersione.addItem(new sap.ui.core.Item({ key: v.ID, text: "Versione " + v.numero }));
            });
            oSelVersione.setEnabled(aVersioni.length > 0);
            if (aVersioni.length) {
              oSelVersione.setSelectedKey(aVersioni[0].ID);
              sVersioneTesto = aVersioni[0].testo || "";
            }
          } catch (e) { /* ignore */ }
        }
      });
      oSelVersione.attachChange(function (oEvent) {
        const sKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
        sVersioneTesto = mVersioni[sKey] || "";
      });

      const oDialog = new sap.m.Dialog({
        title: "Aggiungi clausola da archivio",
        content: [
          new sap.m.Label({ text: "Clausola" }),
          oSelClausola,
          new sap.m.Label({ text: "Versione" }).addStyleClass("sapUiTinyMarginTop"),
          oSelVersione
        ],
        beginButton: new sap.m.Button({
          text: "Aggiungi",
          press: function () {
            if (!sVersioneTitolo || !sVersioneTesto) {
              MessageBox.error("Seleziona clausola e versione.");
              return;
            }
            const aRighe = oModel.getProperty("/righe");
            aRighe.push({ titolo: sVersioneTitolo, testo: sVersioneTesto });
            oModel.setProperty("/righe", aRighe);
            oDialog.close();
          }
        }),
        endButton: new sap.m.Button({ text: "Annulla", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();
    },

    onSalva: async function () {
      const sNome = this.byId("inpNome").getValue();
      const sTipoServizio = this.byId("inpTipoServizio").getValue();
      const sDescrizione = this.byId("inpDescrizione").getValue();
      const oModel = this.getView().getModel("manuale");
      const aRighe = oModel.getProperty("/righe").filter(function (r) { return r.titolo && r.testo; });
      const oTestata = oModel.getProperty("/testata");

      if (!sNome) {
        MessageBox.error("Il nome del template è obbligatorio.");
        return;
      }
      if (!aRighe.length) {
        MessageBox.error("Aggiungi almeno una clausola con titolo e testo.");
        return;
      }
      if (!oTestata.intestatario) {
        MessageBox.error("L'intestatario è obbligatorio.");
        return;
      }

      try {
        const oResp = await fetch("/contratti/creaTemplateManuale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: sNome, tipoServizio: sTipoServizio, descrizione: sDescrizione, clausole: aRighe, testata: oTestata })
        });
        if (!oResp.ok) {
          const oErr = await oResp.json();
          throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
        }
        const oContratto = await oResp.json();
        MessageToast.show("Contratto creato.");
        window.location.href = "/contratti/webapp/index.html#/detail/" + encodeURIComponent(oContratto.ID);
      } catch (e) {
        MessageBox.error("Salvataggio fallito: " + (e.message || String(e)));
      }
    }
  });
});
