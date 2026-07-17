sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"sap/ui/core/Component"
], function (BaseController, Component) {
	"use strict";

	return BaseController.extend("com.buyerui.buyerui.controller.SupplierApproval", {
		onInit: function () {

			var oChildContainer = this.byId("supplierapproval");
			this.getOwnerComponent().runAsOwner(function () {
				Component.create({
					name: "com.buyerui.supplierapproval",
					id: "supplierapproval",
					url: "/supplierapproval/supplierapproval",
					manifest: true
				}).then(function (component) {
					oChildContainer.setComponent(component);
				}.bind(this));
			}.bind(this));
		}

	});
});