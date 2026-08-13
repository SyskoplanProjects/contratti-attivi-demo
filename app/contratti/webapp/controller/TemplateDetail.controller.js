sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/ui/model/json/JSONModel"
], function (BaseController, MessageBox, JSONModel) {
  "use strict";
  return BaseController.extend("com.reply.contrattiattivi.app.controller.TemplateDetail", {
    onInit: function () {
      this._initChatState();
      this.getOwnerComponent().getRouter()
        .getRoute("templateDetail")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    onAlertDetail: function () {
      // navigation placeholder — extend per requirements
    },

    onAfterRendering: function () {
      const oContestoModel = this.getView().getModel("contesto");
      if (!oContestoModel) return;
      const templateID = oContestoModel.getProperty("/ID");
      if (!templateID) return;
      const oModel = this.getOwnerComponent().getModel();
      // Edm.Guid nel $filter senza apici: letterale GUID, non stringa (su HANA "eq '<guid>'"
      // da' 400 "Edm.Guid is not compatible to Edm.String").
      fetch(oModel.getServiceUrl() + `AlertModificaTemplate?$filter=template_ID eq ${templateID} and risolto eq false&$expand=contrattiCoinvolti`)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          const aAlerts = (data.value || []).map(function (a) {
            a.numContratti = (a.contrattiCoinvolti || []).length;
            return a;
          });
          this.getView().setModel(new sap.ui.model.json.JSONModel({ alerts: aAlerts, hasAlerts: aAlerts.length > 0 }), "alertModel");
        }.bind(this))
        .catch(function () {});
    },

    _onRouteMatched: function (oEvent) {
      const sId = decodeURIComponent(oEvent.getParameter("arguments").id);
      this._templateID = sId;
      // _caricaCommenti dipende solo da this._templateID (già noto qui), non dal risultato
      // di _caricaTemplate: prima erano incatenate in sequenza senza motivo, un round-trip
      // pagato due volte invece che in parallelo.
      this._caricaTemplate();
      this._caricaCommenti();
    },

    _caricaTemplate: async function () {
      const oModel = this.getOwnerComponent().getModel();
      const oContext = oModel.bindContext(`/Template(${this._templateID})`, null, {
        $expand: "versioni"
      }).getBoundContext();
      const oData = await oContext.requestObject();
      this.getView().setModel(new JSONModel(oData), "contesto");
    },

    _caricaCommenti: async function () {
      const oModel = this.getOwnerComponent().getModel();
      try {
        const oResp = await fetch(oModel.getServiceUrl() + `TemplateCommento?$filter=template_ID eq ${this._templateID}&$orderby=createdAt desc`);
        const oJson = await oResp.json();
        this.getView().setModel(new JSONModel({ value: oJson.value || [] }), "commenti");
      } catch (e) { /* commenti non bloccanti per la pagina */ }
    },

    onInviaCommentoTemplate: async function () {
      const oInput = this.byId("nuovoCommentoTemplateInput");
      const sTesto = (oInput.getValue() || "").trim();
      if (!sTesto) return;
      const oModel = this.getOwnerComponent().getModel();
      try {
        await oModel.bindContext("/aggiungiCommentoTemplate(...)").setParameter("templateID", this._templateID)
          .setParameter("testo", sTesto).execute();
        oInput.setValue("");
        this._caricaCommenti();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onRisolviCommentoTemplate: async function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext("commenti");
      const sCommentoID = oContext.getObject().ID;
      const oModel = this.getOwnerComponent().getModel();
      try {
        await oModel.bindContext("/risolviCommentoTemplate(...)").setParameter("commentoID", sCommentoID).execute();
        this._caricaCommenti();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("template");
    },

    onVersionePress: async function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext("contesto");
      const oVersione = oContext.getObject();
      const oModel = this.getOwnerComponent().getModel();
      try {
        const oResp = await fetch(oModel.getServiceUrl() + `Contratto?$filter=templateVersion_ID eq ${oVersione.ID}&$select=ID,intestatario,stato,importo`);
        if (!oResp.ok) { MessageBox.error("HTTP " + oResp.status); return; }
        const oJson = await oResp.json();
        const aContratti = oJson.value || [];

        const oList = new sap.m.List({
          items: aContratti.length
            ? aContratti.map(c => new sap.m.StandardListItem({
                title: c.intestatario,
                description: `${c.stato || 'N/D'}${c.importo ? ' — € ' + c.importo : ''}`,
                type: "Navigation",
                press: () => {
                  var sHash = this.getOwnerComponent().getRouter().getURL("detail", { id: encodeURIComponent(c.ID) });
                  if (sHash.charAt(0) !== "#") {
                    sHash = "#/" + sHash.replace(/^\//, "");
                  }
                  window.open(sHash, "_blank");
                  oDialog.close();
                }
              }))
            : [new sap.m.StandardListItem({ title: "Nessun contratto per questa versione." })]
        });

        const oDialog = new sap.m.Dialog({
          title: `Contratti — v${oVersione.numero}`,
          contentWidth: "30rem",
          content: oList,
          endButton: new sap.m.Button({ text: "Chiudi", press: () => oDialog.close() }),
          afterClose: () => oDialog.destroy()
        });
        oDialog.open();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    }
  });
});
