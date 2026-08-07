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
