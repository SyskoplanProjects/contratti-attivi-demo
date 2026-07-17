sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "../formatter"
], function (Controller, MessageToast, MessageBox, formatter) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.app.controller.Archiviati", {
    formatter: formatter,

    onInit: function () {
      this.getOwnerComponent().getRouter()
        .getRoute("archiviati")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function () {
      var oTable = this.byId("archiviatiTable");
      if (oTable) {
        var oBinding = oTable.getBinding("items");
        if (oBinding) oBinding.refresh();
      }
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo('main');
    },

    onRipristina: async function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext();
      const contrattoID = oCtx.getProperty('ID');
      try {
        await this.getOwnerComponent().getModel()
          .bindContext('/ripristinaContratto(...)')
          .setParameter('contrattoID', contrattoID)
          .execute();
        MessageToast.show('Contratto ripristinato');
        this.getOwnerComponent().getRouter().navTo('main');
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    }
  });
});
