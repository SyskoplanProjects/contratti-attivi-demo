sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../model/dashboardUtils",
  "../model/mockCockpit",
  "../model/mockFornitori",
  "../formatter"
], function (BaseController, JSONModel, Filter, FilterOperator, dashboardUtils, mockCockpit, mockFornitori, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel(this._buildCockpitViewData()), "cockpit");
      this.getView().setModel(new JSONModel({
        lista: mockFornitori,
        vista: "numero",
        topFornitoriHtml: dashboardUtils.buildTopFornitoriHtml(mockFornitori, "numero")
      }), "fornitori");
      this.getView().setModel(new JSONModel({ fornitoreAttivo: null }), "filtro");
      this.getView().setModel(new JSONModel([]), "integrazione");

      this.getOwnerComponent().getRouter().getRoute("dashboard").attachPatternMatched(this._onRouteMatched, this);
      this._loadIntegrazioneContratti();
    },

    _buildCockpitViewData: function () {
      return {
        totaleContrattiAnno: mockCockpit.totaleContrattiAnno,
        importoTotaleAnno: mockCockpit.importoTotaleAnno,
        donutTipologiaHtml: dashboardUtils.buildDonutHtml(mockCockpit.tipologia),
        donutSurveyHtml: dashboardUtils.buildDonutHtml(mockCockpit.survey),
        trendHtml: dashboardUtils.buildTrendHtml(mockCockpit.trend)
      };
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      var sFornitore = oArgs.fornitore ? decodeURIComponent(oArgs.fornitore) : null;
      this.getView().getModel("filtro").setProperty("/fornitoreAttivo", sFornitore);
      this.byId("dashboardTabBar").setSelectedKey("cockpit");
      this._applyFiltroFornitore(sFornitore);
    },

    _applyFiltroFornitore: function (sFornitore) {
      var oTable = this.byId("dettaglioContrattiTable");
      if (!oTable) return;
      var oBinding = oTable.getBinding("items");
      if (!oBinding) return;
      if (sFornitore) {
        oBinding.filter([new Filter({ path: "intestatario", operator: FilterOperator.Contains, value1: sFornitore, caseSensitive: false })]);
      } else {
        oBinding.filter([new Filter({ path: "stato", operator: FilterOperator.NE, value1: "ARCHIVIATO" })]);
      }
    },

    onResetFiltroFornitore: function () {
      this.getOwnerComponent().getRouter().navTo("dashboard");
    },

    onCambiaVistaFornitori: function (oEvent) {
      var sVista = oEvent.getParameter("key");
      var oModel = this.getView().getModel("fornitori");
      var aLista = oModel.getProperty("/lista");
      oModel.setProperty("/vista", sVista);
      oModel.setProperty("/topFornitoriHtml", dashboardUtils.buildTopFornitoriHtml(aLista, sVista));
    },

    onFornitoreVendorMeshPress: function (oEvent) {
      var sNome = oEvent.getSource().getBindingContext("fornitori").getProperty("nome");
      this.getOwnerComponent().getRouter().navTo("dashboard", { fornitore: sNome });
    },

    onApriContrattoIntegrazione: function (oEvent) {
      var sID = oEvent.getSource().getBindingContext("integrazione").getProperty("ultimoContrattoID");
      if (!sID) return;
      this.getOwnerComponent().getRouter().navTo("detail", { id: encodeURIComponent(sID) });
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    },

    _loadIntegrazioneContratti: async function () {
      var oModel = this.getOwnerComponent().getModel();
      var sBase = oModel.getServiceUrl();
      var aLista = this.getView().getModel("fornitori").getProperty("/lista");
      try {
        var oResp = await fetch(sBase + "Contratto?$filter=stato ne 'ARCHIVIATO'&$select=ID,intestatario,importo,dataStipula&$orderby=dataStipula desc");
        var oJson = await oResp.json();
        var aContratti = oJson.value || [];
        var aRisultati = aLista.map(function (f) {
          var aMatch = aContratti.filter(function (c) { return dashboardUtils.matchFornitore(f.nome, c.intestatario); });
          if (!aMatch.length) return null;
          return {
            nome: f.nome,
            numeroContratti: aMatch.length,
            importoTotale: aMatch.reduce(function (n, c) { return n + (c.importo || 0); }, 0),
            ultimaDataStipula: aMatch[0].dataStipula,
            ultimoContrattoID: aMatch[0].ID
          };
        }).filter(function (r) { return !!r; });
        this.getView().setModel(new JSONModel(aRisultati), "integrazione");
      } catch (e) { /* rete non disponibile: tabella integrazione resta vuota */ }
    }
  });
});
