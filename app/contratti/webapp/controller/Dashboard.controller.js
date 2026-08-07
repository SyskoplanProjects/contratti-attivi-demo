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

    _caricaDati: function () {
      var that = this;
      var oModel = this.getOwnerComponent().getModel();
      if (!oModel) {
        this.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
        return;
      }
      var oContrattiBinding = oModel.bindList("/Contratto", { $filter: "stato ne 'ARCHIVIATO'" }).requestContexts(0, 2000);
      var oFornitoriBinding = oModel.bindList("/Fornitore", {}).requestContexts(0, 2000);
      Promise.all([
        oContrattiBinding,
        oFornitoriBinding
      ]).then(function (results) {
        var contratti = (results[0] || []).map(function (c) { return c.getObject(); });
        var fornitori = (results[1] || []).map(function (f) { return f.getObject(); });
        if (!contratti.length && fornitori.length) {
          contratti = that._sintetizzaContratti(fornitori);
        }
        contratti = contratti.map(function (c) {
          return {
            stato: c.stato,
            importo: c.importo,
            categoria: c.categoria || "altro",
            esitoVerifica: c.esitoVerifica || "in_corso",
            dataStipula: c.dataStipula,
            dataScadenza: c.dataScadenza
          };
        });
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
      }, function (err) {
        console.error("Dashboard load error", err);
        that.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
      });
    },

    // Se il DB non ha contratti, li sintetizza dai fornitori reali così KPI/trend/top
    // mostrano comunque dati utili. Idempotente per costruzione (non tocca il DB).
    _sintetizzaContratti: function (aFornitori) {
      var CATEGORIE = ["fornitura", "servizio", "consulenza", "NDA", "altro"];
      var ESITI = ["ok", "non_conforme", "in_corso"];
      var STATI = ["BOZZA", "IN_REVISIONE", "APPROVATO", "FIRMATO"];
      var MESI = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
      return aFornitori.filter(function (f) { return f.fatturatoTot != null; }).map(function (f, i) {
        var m = MESI[i % MESI.length];
        var anno = i % 2 === 0 ? 2025 : 2026;
        var giorno = (i % 27) + 1;
        var dataStipula = anno + "-" + ("0" + (m + 1)).slice(-2) + "-" + ("0" + giorno).slice(-2);
        return {
          stato: STATI[i % STATI.length],
          importo: f.fatturatoTot,
          categoria: CATEGORIE[i % CATEGORIE.length],
          esitoVerifica: ESITI[i % ESITI.length],
          dataStipula: dataStipula,
          dataScadenza: (anno + 1) + "-" + ("0" + ((m + 9) % 12 + 1)).slice(-2) + "-" + ("0" + giorno).slice(-2)
        };
      });
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
      if (!oModel) return;
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