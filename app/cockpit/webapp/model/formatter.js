sap.ui.define([], function () {
	"use strict";

	return {

		ringBell: function (nNotification) {
			return nNotification > 0 ? "true" : "false";
		},

		formatTabVisible: function (sNameTab, oRoles) {
			for (var key in oRoles) {
				if (key.search(sNameTab) == !-1) {
					return true;
				}
			}

			return false;
		},

		formatTextException: function (bNoRoles, bNoSupportedBrowser) {
			var oResourceBundle = this.getResourceBundle();
			var sText = "";
			if (bNoRoles) {
				sText = oResourceBundle.getText("exception.noRoles");
			} else if (bNoSupportedBrowser) {
				sText = oResourceBundle.getText("exception.noSupportedBrowser");
			}

			return sText;
		}

	};
});