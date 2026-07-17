sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"sap/ui/core/Component"
], function (BaseController, Component) {
	"use strict";

	return BaseController.extend("com.buyerui.buyerui.controller.ResilienceCockpit", {

		onInit: function () {
			var oChildContainer = this.byId("ResilienceCockpit");
			this.getOwnerComponent().runAsOwner(function () {
				Component.create({
					name: "com.buyerui.ResilienceCockpit",
					id: "ResilienceCockpit",
					url: "/ResilienceCockpit/ResilienceCockpit",
					manifest: true
				}).then(function (component) {
					oChildContainer.setComponent(component);
				}.bind(this));
			}.bind(this));
		}

	});

});