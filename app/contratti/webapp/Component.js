sap.ui.define(["sap/ui/core/UIComponent", "sap/ui/model/json/JSONModel"],
function (UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("com.reply.contrattiattivi.app", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      var oRoleModel = new JSONModel({ isUtente: false, isRevisore: false });
      this.setModel(oRoleModel, "roleModel");
      fetch("/user-info").then(function (res) { return res.json(); }).then(function (data) {
        oRoleModel.setData({ isUtente: !!data.isUtente, isRevisore: !!data.isRevisore });
      });

      if (this.getRouter) {
        this.getRouter().initialize();
      }
    }
  });
});
