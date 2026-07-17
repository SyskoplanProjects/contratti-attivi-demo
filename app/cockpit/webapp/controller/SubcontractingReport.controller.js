sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"sap/ui/core/Component"
], function (BaseController, Component) {
	"use strict";

	return BaseController.extend("com.buyerui.buyerui.controller.SubcontractingReport", {
		onInit: function () {

			var oChildContainer = this.byId("subcontractingreport");
			this.getOwnerComponent().runAsOwner(function () {
				Component.create({
					name: "com.buyerui.subcontractingreport",
					id: "subcontractingreport",
					url: "/subcontractingreport/subcontractingreport",
					manifest: true
				}).then(function (component) {
					oChildContainer.setComponent(component);
				}.bind(this));
			}.bind(this));
		}

	});
});