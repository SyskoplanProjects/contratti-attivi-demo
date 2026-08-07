sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../model/dashboardUtils",
  "../model/aggregateCockpit",
  "../formatter"
], function (BaseController, JSONModel, Filter, FilterOperator, dashboardUtils, aggregateCockpit, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({ fornitoreAttivo: null }), "filtro");
      this._caricaDati();
      this.getOwnerComponent().getRouter().getRoute("dashboard").attachPatternMatched(this._onRouteMatched, this);
    },

    _caricaDati: async function () {
      var oModel = this.getView().getModel();
      if (!oModel) {
        this.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
        return;
      }
      var that = this;
      try {
        var aContrattiCtx = await oModel.bindList("/Contratto", { $filter: "stato ne 'ARCHIVIATO'" }).requestContexts(0, 999);
        var aFornitoriCtx = await oModel.bindList("/Fornitore", {}).requestContexts(0, 999);
        var contratti = aContrattiCtx.map(function (c) { return c.getObject(); });
        var fornitori = aFornitoriCtx.map(function (f) { return f.getObject(); });
        var ui = aggregateCockpit({ contratti: contratti, fornitori: fornitori });
        var sTopFornitoriHtml = dashboardUtils.buildTopFornitoriHtml(ui.topFornitori, "fatturato");
        that.getView().setModel(new JSONModel({
          totaleContrattiAnno: ui.totaleContratti,
          importoTotaleAnno: ui.importoTotaleAnno,
          donutTipologiaHtml: dashboardUtils.buildDonutHtml(ui.donutTipologia),
          donutSurveyHtml: dashboardUtils.buildDonutHtml(ui.donutSurvey),
          trendHtml: dashboardUtils.buildTrendHtml(ui.trend)
        }), "cockpit");
        that.getView().setModel(new JSONModel({
          lista: ui.topFornitori,
          vista: "importi",
          topFornitoriHtml: sTopFornitoriHtml
        }), "fornitori");
      } catch (err) {
        console.error("Dashboard load error", err);
      }
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

    onApriContrattoDettaglio: function (oEvent) {
      var sID = oEvent.getSource().getBindingContext().getProperty("ID");
      if (!sID) return;
      this.getOwnerComponent().getRouter().navTo("detail", { id: encodeURIComponent(sID) });
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    }
  });
});