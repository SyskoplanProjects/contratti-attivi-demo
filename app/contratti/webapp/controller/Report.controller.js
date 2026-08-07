sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../formatter"
], function (Controller, Filter, FilterOperator, formatter) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.app.controller.Report", {
    formatter: formatter,
    onInit: function () {},
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
