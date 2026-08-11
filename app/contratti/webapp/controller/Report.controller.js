sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../formatter"
], function (Controller, Filter, FilterOperator, formatter) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.app.controller.Report", {
    formatter: formatter,
    onInit: function () {
      this._oHighlighted = null;
      this._oFornitoreAtteso = null;
      this.getOwnerComponent().getRouter().getRoute("report").attachPatternMatched(this._onRouteMatched, this);
    },
    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      var sFornitore = oArgs.fornitore ? decodeURIComponent(oArgs.fornitore) : null;
      this._clearHighlight();
      if (!sFornitore) return;
      var oT = this.byId("rfSearch");
      if (oT) oT.setValue(sFornitore);
      this._applyFilter(sFornitore);
      this._oFornitoreAtteso = sFornitore;
      var oTable = this.byId("fornitoriTable");
      if (!oTable) return;
      var oBinding = oTable.getBinding("items");
      if (!oBinding) return;
      var that = this;
      oBinding.attachEventOnce("dataReceived", function () {
        that._evidenziaDopoCaricamento(oTable, oBinding);
      }, oBinding);
      setTimeout(function () {
        if (that._oFornitoreAtteso) {
          that._evidenziaDopoCaricamento(oTable, oBinding);
        }
      }, 600);
    },
    _evidenziaDopoCaricamento: function (oTable, oBinding) {
      var sAtteso = this._oFornitoreAtteso;
      if (!sAtteso) return;
      var aCtx = oBinding.getContexts(0, 1000);
      if (!aCtx || !aCtx.length) return;
      var sPath = null;
      for (var i = 0; i < aCtx.length; i++) {
        if (aCtx[i].getProperty("nomeFornitore") === sAtteso) {
          sPath = aCtx[i].getPath();
          break;
        }
      }
      if (!sPath) return;
      var aItems = oTable.getItems();
      for (var j = 0; j < aItems.length; j++) {
        var oCtx = aItems[j].getBindingContext();
        if (oCtx && oCtx.getPath() === sPath) {
          this._oHighlighted = aItems[j];
          aItems[j].addStyleClass("app-report-selected");
          var oDom = aItems[j].getDomRef();
          if (oDom) oDom.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      }
    },
    _clearHighlight: function () {
      if (this._oHighlighted) {
        this._oHighlighted.removeStyleClass("app-report-selected");
        this._oHighlighted = null;
      }
      this._oFornitoreAtteso = null;
    },
    onNavBack: function () { this.getOwnerComponent().getRouter().navTo("main"); },
    onSearch: function (oEvent) {
      var sValue = oEvent.getParameter("query") || "";
      this._applyFilter(sValue);
    },
    onChange: function (oEvent) {
      this._applyFilter(oEvent.getSource().getValue());
    },
    onReset: function () {
      var oT = this.byId("rfSearch"); if (oT) oT.setValue("");
      this._applyFilter("");
    },
    _applyFilter: function (sValue) {
      var sTrim = (sValue || "").trim();
      var aFilters = [];
      if (sTrim) {
        aFilters.push(new Filter({
          filters: [
            new Filter({ path: "nomeFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false }),
            new Filter({ path: "idSapFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false })
          ],
          and: false
        }));
      }
      var oTable = this.byId("fornitoriTable");
      if (oTable) {
        var oBinding = oTable.getBinding("items");
        if (oBinding) oBinding.filter(aFilters);
      }
    }
  });
});