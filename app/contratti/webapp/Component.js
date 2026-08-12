sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/json/JSONModel"],
function (UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("com.reply.contrattiattivi.app", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      var oRoleModel = new JSONModel({ isUtente: false, isRevisore: false });
      this.setModel(oRoleModel, "roleModel");
      // Senza retry, un fallimento di rete/sessione lascia il modello sul default restrittivo
      // per tutta la vita della pagina: un ritentativo copre il caso comune (blip transitorio).
      function caricaRuoli(bRetry) {
        return fetch("/user-info").then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        }).then(function (data) {
          oRoleModel.setData({ isUtente: !!data.isUtente, isRevisore: !!data.isRevisore });
        }).catch(function (e) {
          if (bRetry) return caricaRuoli(false);
          // eslint-disable-next-line no-console
          console.error("[roleModel] /user-info fallito, ruoli non caricati:", e);
        });
      }
      caricaRuoli(true);

      if (this.getRouter) {
        this.getRouter().initialize();
      }
    }
  });
});
