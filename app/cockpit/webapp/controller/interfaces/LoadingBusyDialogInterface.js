sap.ui.define([
	"com/buyerui/buyerui/controller/interfaces/AbstractInterface",
	"com/buyerui/buyerui/controls/BusyDialog"
], function (AbstractInterface, CustomBusyDialog) {
	"use strict";

	var LoadingBusyDialogInterface = {
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/* =========================================================== */
		/* private functions                                           */
		/* =========================================================== */

		/* =========================================================== */
		/* public functions                                            */
		/* =========================================================== */
		openBusyDialogLoadingView: function (fnOpen, sText) {
			var oBusyDialog = sap.ui.getCore().byId("idLoadingViewBusyDialog");

			if (!oBusyDialog) {
				this.openBusyDialogLoadingViewBootstrap(sText);
				if (typeof fnOpen === "function") {
					fnOpen.bind(this)();
				}
				return;
			}

			if (!oBusyDialog._oDialog.isOpen()) {
				if (typeof fnOpen === "function") {
					oBusyDialog.attachEventOnce("afterOpen", {}, fnOpen, this);
				}
				oBusyDialog.open();
			} else {
				if (typeof fnOpen === "function") {
					fnOpen.bind(this)();
				}
			}
		},

		closeBusyDialogLoadingView: function () {
			var oBusyDialog = sap.ui.getCore().byId("idLoadingViewBusyDialog");
			if (oBusyDialog._oDialog.isOpen())
				setTimeout(function () {
					oBusyDialog.close(oBusyDialog);
				}, 0);
		},

		resetBusyDialog: function () {
			var oBusyDialog = sap.ui.getCore().byId("idLoadingViewBusyDialog");
			var bBusyDialogCanBeClosed = oBusyDialog && oBusyDialog._oDialog && oBusyDialog._oDialog.isOpen();
			if (bBusyDialogCanBeClosed) {
				oBusyDialog.close();
			}
		},

		openBusyDialogLoadingViewBootstrap: function (sText) {
			var oCustomBusyDialog = sap.ui.getCore().byId("idLoadingViewBusyDialog");
			if (!oCustomBusyDialog) {
				oCustomBusyDialog = new CustomBusyDialog("idLoadingViewBusyDialog", {
					showCancelButton: false,
					busyIndicatorDelay: 0,
					customIcon: "/buyerui/images/GearBusy.svg",
					customIconWidth: "6rem",
					customIconHeight: "6rem",
					customIconDensityAware: false
				});
			}
			oCustomBusyDialog.open();
		}
	};

	AbstractInterface.extend(LoadingBusyDialogInterface);

	return LoadingBusyDialogInterface;
});