/*eslint-disable no-console, no-alert */
/*eslint no-debugger: "error"*/
sap.ui.define([
		"sap/ui/model/FilterOperator",
		"sap/ui/model/Filter",
	],
	function (FilterOperator, Filter) {
		"use strict";

		var _oComponent;

		return {

			getComponent: function () {
				return _oComponent;
			},

			setComponent: function (oComponent) {
				if (_oComponent === undefined) {
					_oComponent = oComponent;
					sap.ui.getCore().getEventBus().publish("BaseManagerComponentIsReady");
				} else {
					console.error("Component is already set");
				}
			},

			getPromiseForI18nModel: function () {
				var oComponent = this.getComponent();
				return new Promise(function (resolve) {
					var oI18nModel = oComponent.getModel("i18n");
					if (oI18nModel !== undefined && oI18nModel.getResourceBundle() !== null) {
						resolve();
					} else {
						sap.ui.getCore().getEventBus().subscribe("i18nModelInizialized", function () {
							resolve();
						});
					}
				});
			},

			getLocalizedText: function (sKey, aArgs) {
				var oComponent = this.getComponent();
				var oI18nModel = oComponent.getModel("i18n");
				return oI18nModel.getResourceBundle().getText(sKey, aArgs);
			},

			getPromiseForComponent: function () {
				var oComponent = this.getComponent();
				return new Promise(function (resolve) {
					if (oComponent !== undefined) {
						resolve();
					} else {
						sap.ui.getCore().getEventBus().subscribe("BaseManagerComponentIsReady", function () {
							resolve();
						});
					}
				});
			},

			onInit: function (fnCallBack) {
				var oPromiseComponent = this.getPromiseForComponent();
				oPromiseComponent.then(fnCallBack.bind(this));
				oPromiseComponent.catch(function (oError) {
					console.log(oError);
				});
			},

			getModelFromComponent: function (sModelName) {
				return this.getComponent().getModel(sModelName);
			},

			getI18nText: function (sTextID, oParamList) {
				var sText = this.getModelFromComponent("i18n").getResourceBundle().getText(sTextID, oParamList);
				var sCleanedText = sText.replace(new RegExp("\'\'", "g"), "\'");
				return sCleanedText;
			},

			extend: function (oClassData) {
				oClassData.getComponent = this.getComponent;
				oClassData.getModelFromComponent = this.getModelFromComponent;
				oClassData.getI18nText = this.getI18nText;
				oClassData.getLocalizedText = this.getLocalizedText;
				oClassData.getPromiseForComponent = this.getPromiseForComponent;
				oClassData.getPromiseForI18nModel = this.getPromiseForI18nModel;
				oClassData.onInit = this.onInit;
				oClassData.requestBusyIndicator = this.requestBusyIndicator;
				oClassData.resetBusyIndicator = this.resetBusyIndicator;
				oClassData.isBusyIndicatorRequested = this.isBusyIndicatorRequested;
			},
			/**
			 * Request a BusyIndicator, state can be read with isBusyIndicatorRequested
			 *
			 * @public
			 */
			requestBusyIndicator: function () {
				var oUIControlModel = this.getModelFromComponent("uicontrol");
				var iBusyIndicatorCount = oUIControlModel.getProperty("/BusyIndicatorRequested");
				iBusyIndicatorCount += 1;
				oUIControlModel.setProperty("/BusyIndicatorRequested", iBusyIndicatorCount);
			},
			/**
			 * Reset the BusyIndicator request
			 *
			 * @public
			 */
			resetBusyIndicator: function () {
				var oUIControlModel = this.getModelFromComponent("uicontrol");
				var iBusyIndicatorCount = oUIControlModel.getProperty("/BusyIndicatorRequested");
				iBusyIndicatorCount -= 1;
				oUIControlModel.setProperty("/BusyIndicatorRequested", iBusyIndicatorCount);
			},
			
		};
	});