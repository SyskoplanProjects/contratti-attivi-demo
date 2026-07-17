sap.ui.define(["sap/m/HBox"], function (HBox) {
	"use strict";

	var oClickableHbox = HBox.extend("com.buyerui.buyerui.controls.ClickableHbox", {
		metadata: {
			properties: {
				key: {
					type: "string",
					defaultValue: null
				}
			},
			events: {
				press: {
					parameters: {
						key: {
							type: "string",
							defaultValue: "test"
						}
					}
				}
			}
		},

		renderer: "sap.m.HBoxRenderer"
	});

	oClickableHbox.prototype.onclick = function (oEvent) {
		this.firePress({});
	};

	return oClickableHbox;

});