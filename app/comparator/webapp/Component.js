sap.ui.define(["sap/ui/core/UIComponent"],
function (UIComponent) {
  "use strict";
  return UIComponent.extend("com.reply.contrattiattivi.comparator", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      var oRouter = this.getRouter && this.getRouter();
      if (oRouter) {
        oRouter.initialize();
      }
    }
  });
});
