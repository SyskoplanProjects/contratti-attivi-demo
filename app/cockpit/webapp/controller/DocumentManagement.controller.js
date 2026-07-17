sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"sap/ui/core/Component"
], function (BaseController, Component) {
	"use strict";

	return BaseController.extend("com.buyerui.buyerui.controller.DocumentManagement", {

		onInit: function () {
			var oChildContainer = this.byId("documentManagement");
			this.getOwnerComponent().runAsOwner(function () {
				Component.create({
					name: "com.buyerui.documentManagement",
					id: "documentManagement",
					url: "/documentmanagement/documentManagement",
					manifest: true
				}).then(function (component) {
					oChildContainer.setComponent(component);
				}.bind(this));
			}.bind(this));
		}

	});

});