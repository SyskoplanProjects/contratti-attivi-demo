sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"com/buyerui/buyerui/model/models",
	"com/buyerui/buyerui/modules/managers/BaseManager",
	"com/buyerui/buyerui/controller/interfaces/LoadingBusyDialogInterface",
	"sap/ui/model/json/JSONModel"
], function (UIComponent, Device, models, BaseManager, LoadingBusyDialogInterface, JSONModel) {
	"use strict";

	return UIComponent.extend("com.buyerui.buyerui.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);
			// Bootstrap busy dialog rimosso nella copia locale: nell'originale resta aperto
			// finché ModelManager non risolve User/CSRFToken (backend enterprise assente qui).

			// enable routing
			this.getRouter().initialize();

			// set component for the managers
			BaseManager.setComponent(this);

			// set the device model
			var oDeviceModel = models.createDeviceModel();
			this.setModel(oDeviceModel, "device");
			var isIE = oDeviceModel.getProperty("/browser/name") === "ie";
			this.setModel(new JSONModel({
				noRoles: false,
				noSupportedBrowser: isIE
			}), "ExceptionPages");

			var oRoleModel = new JSONModel({ isUtente: false, isRevisore: false });
			this.setModel(oRoleModel, "roleModel");
			fetch("/user-info").then(function (res) { return res.json(); }).then(function (data) {
				oRoleModel.setData({ isUtente: !!data.isUtente, isRevisore: !!data.isRevisore });
			});
		}
	});
});