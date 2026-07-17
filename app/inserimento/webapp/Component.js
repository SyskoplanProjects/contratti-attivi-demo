sap.ui.define(["sap/ui/core/UIComponent"],
function (UIComponent) {
  "use strict";

  return UIComponent.extend("com.reply.contrattiattivi.inserimento", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      if (this.getRouter) {
        this.getRouter().initialize();
      }
    }
  });
});
