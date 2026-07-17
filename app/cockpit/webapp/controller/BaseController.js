/*global history */
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/ui/core/routing/History",
	"sap/m/MessageBox",
	"com/buyerui/buyerui/model/formatter",
	"com/buyerui/buyerui/controller/interfaces/ValidationInterface",
	"com/buyerui/buyerui/controller/interfaces/LoadingBusyDialogInterface",
	"sap/base/Log"
], function (Controller, UIComponent, History, MessageBox, formatter, ValidationInterface, LoadingBusyDialogInterface, Log) {
	"use strict";

	var oBaseController = {
		formatter: formatter,
		// lifecycle methods only
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		// functions that used only in this class
		/* =========================================================== */
		/* private functions                                           */
		/* =========================================================== */

		// functions that used in this or other classes
		/* =========================================================== */
		/* public functions                                            */
		/* =========================================================== */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		onNavButtonPressBack: function () {
			var oComponent = this.getOwnerComponent();
			var oNavigationModel = oComponent.getModel("Navigation");
			var aHistory = oNavigationModel.getProperty("/RouterHistory");

			if (aHistory.length < 2) {
				oNavigationModel.setProperty("/CurrentRoute", "Main");
				oNavigationModel.setProperty("/RouterHistory", []);
				this.navTo("Main");
			} else {
				aHistory.pop();
				oNavigationModel.setProperty("/RouteStepBack", true);
				var oLastRoute = aHistory[aHistory.length - 1];
				oNavigationModel.setProperty("/CurrentRoute", oLastRoute.routename);
				this.navTo(oLastRoute.routename, oLastRoute.parameters);
			}
		},

		addRouteToRouterHistory: function (sRouteName, oParameters) {
			var oComponent = this.getOwnerComponent();
			var oNavigationModel = oComponent.getModel("Navigation");
			var aHistory = oNavigationModel.getProperty("/RouterHistory");
			var bRouteStepBack = oNavigationModel.getProperty("/RouteStepBack");

			if (bRouteStepBack) {
				oNavigationModel.setProperty("/RouteStepBack", false);
				return;
			}

			if (aHistory.length === 0) {
				var aExceptRoutes = [];
				if (aExceptRoutes.indexOf(sRouteName) !== -1) {
					this.cleanHistoryEntries();
					oNavigationModel.setProperty("/CurrentRoute", "Main");
					this.navTo("Main");
					return;
				}
			} else {
				var oLastRoute = aHistory[aHistory.length - 1];
				if (oLastRoute && oLastRoute.routename === sRouteName) {
					aHistory.pop();
				}
			}
			oNavigationModel.setProperty("/CurrentRoute", sRouteName);
			aHistory.push({
				routename: sRouteName,
				parameters: oParameters
			});
		},

		cleanHistoryEntries: function (aRoutes) {
			if (aRoutes === undefined) {
				aRoutes = [];
			}
			var oComponent = this.getOwnerComponent();
			var oNavigationModel = oComponent.getModel("Navigation");
			var aHistory = oNavigationModel.getProperty("/RouterHistory");
			if (aRoutes.length === 0) {
				oNavigationModel.setProperty("/RouterHistory", []);
			} else {
				aHistory.reverse();
				aRoutes.forEach(function (sRoute) {
					var iRouteIndex = aHistory.findIndex(function (oHistory) {
						return oHistory.routename === sRoute;
					});
					if (iRouteIndex !== -1) {
						aHistory.splice(iRouteIndex, 1);
					}
				});
				aHistory.reverse();
			}

		},

		getCurrentRoute: function (iEnd) {
			if (iEnd === undefined) {
				iEnd = 1;
			}
			var oComponent = this.getOwnerComponent();
			var oNavigationModel = oComponent.getModel("Navigation");
			var aHistory = oNavigationModel.getProperty("/RouterHistory");
			var oCurrentRoute;
			if (aHistory.length > 0) {
				oCurrentRoute = aHistory[aHistory.length - iEnd];
			}
			return oCurrentRoute;
		},

		navTo: function (sRouteName, mOptions) {
			try {
				var oComponent = this.getOwnerComponent();
				var oRouter = oComponent.getRouter();
				oRouter.navTo(sRouteName, mOptions);
			} catch (sError) {
				Log.error("navTo: navTo " + sRouteName + " failed - " + sError);
			}
		},

		changeValueState: function (oEvent) {
			var oSource = oEvent.getSource();
			oSource.setValueState("None");
		},

		// functions that assign to a event of ui controls
		/* =========================================================== */
		/* events                                                      */
		/* =========================================================== */

		onPressHome: function () {
			this.cleanHistoryEntries();
			var oComponent = this.getOwnerComponent();
			var oNavigationModel = oComponent.getModel("Navigation");
			oNavigationModel.setProperty("/CurrentRoute", "Main");
			this.navTo("Main");
		},

		onPressLogout: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var sMessageBoxTitle = oResourceBundle.getText("logout.title");
			var sMessageBoxDescription = oResourceBundle.getText("logout.message");
			var sActionYes = oResourceBundle.getText("logout.ok");
			var sActionNo = oResourceBundle.getText("logout.cancel");

			var mMessageBoxOption = {
				title: sMessageBoxTitle,
				actions: [sActionYes, sActionNo],
				onClose: function (sAction) {
					if (sAction === sActionYes) {
						window.location.href = "/do/logout";
					}
				}.bind(this)
			};

			MessageBox.show(sMessageBoxDescription, mMessageBoxOption);
		}

	};

	ValidationInterface.implement(oBaseController);
	LoadingBusyDialogInterface.implement(oBaseController);

	return Controller.extend("com.buyerui.buyerui.controller.BaseController", oBaseController);

});