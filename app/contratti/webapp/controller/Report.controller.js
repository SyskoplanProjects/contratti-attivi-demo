sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../formatter",
  "../model/dashboardUtils"
], function (Controller, JSONModel, Filter, FilterOperator, formatter, dashboardUtils) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.app.controller.Report", {
    formatter: formatter,
    onInit: function () {
      this._oHighlighted = null;
      this._oFornitoreAtteso = null;
      this.getView().setModel(new JSONModel({ righe: [], nome: "" }), "contrattiFornitore");
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
    },
    onApriContrattiFornitore: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext();
      var oFornitore = oCtx && oCtx.getObject();
      if (!oFornitore || !oFornitore.ID) return;
      var oModel = this.getOwnerComponent().getModel();
      oModel.bindList("/Contratto", {}).requestContexts(0, 2000)
        .then(function (aCtx) {
          var aRighe = (aCtx || [])
            .map(function (c) { return c.getObject(); })
            .filter(function (o) { return o.fornitore_ID === oFornitore.ID && o.stato !== 'ARCHIVIATO'; })
            .map(function (o) {
              var oRischio = dashboardUtils.buildRischioFornitore(oFornitore);
              return {
                ID: o.ID, codice: o.codice, intestatario: o.intestatario, responsabile: o.responsabile,
                oggetto: o.oggetto, categoria: o.categoria, stato: o.stato, importo: o.importo,
                dataStipula: o.dataStipula, dataScadenza: o.dataScadenza,
                rischioLabel: oRischio.label, rischioState: that._statoRischio(oRischio.livello)
              };
            });
          var oModel = that.getView().getModel("contrattiFornitore");
          oModel.setProperty("/nome", oFornitore.nomeFornitore);
          oModel.setProperty("/righe", aRighe);
          var oDrill = that.byId("contrattiDrill");
          oDrill.setVisible(true);
          var oDom = oDrill.getDomRef();
          if (oDom) oDom.scrollIntoView({ block: "start", behavior: "smooth" });
        })
        .catch(function (err) {
          console.error("Report drill load error", err);
        });
    },
    onDrillBack: function () {
      this.byId("contrattiDrill").setVisible(false);
    },
    onApriContrattoDettaglio: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("contrattiFornitore");
      var sID = oCtx && oCtx.getProperty("ID");
      if (!sID) return;
      var sHash = this.getOwnerComponent().getRouter().getURL("detail", { id: encodeURIComponent(sID) });
      if (sHash.charAt(0) !== "#") {
        sHash = "#/" + sHash.replace(/^\//, "");
      }
      window.open(sHash, "_blank");
    },
    _statoRischio: function (sLivello) {
      return sLivello === 'alto' ? 'Error' : sLivello === 'medio' ? 'Warning' : sLivello === 'basso' ? 'Success' : 'None';
    }
  });
});