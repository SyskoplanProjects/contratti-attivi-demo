sap.ui.define([
	"sap/m/Button"
], function (Button) {
	"use strict";
	var oCustomButton = Button.extend("com.buyerui.buyerui.controls.Button", {
		metadata: {
			events: {
				"hover": {}
			}
		}
	});

	oCustomButton.prototype.onmouseover = function (oEvent) {
		setTimeout(function () {
			this.fireHover((this.firePress()));
		}.bind(this), 600);
	};

	return oCustomButton;
});