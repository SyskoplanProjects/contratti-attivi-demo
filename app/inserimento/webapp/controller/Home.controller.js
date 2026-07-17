sap.ui.define(["./BaseController"],
function (BaseController) {
  "use strict";
  return BaseController.extend("com.reply.contrattiattivi.inserimento.controller.Home", {
    onInit: function () {
      window.location.href = "/contratti/webapp/index.html";
    }
  });
});
