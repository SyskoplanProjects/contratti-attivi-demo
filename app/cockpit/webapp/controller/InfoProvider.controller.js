sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"sap/ui/core/Component"
], function (BaseController, Component) {
	"use strict";

	return BaseController.extend("com.buyerui.buyerui.controller.InfoProvider", {

		onInit: function () {
			var oChildContainer = this.byId("infoProvider");
			this.getOwnerComponent().runAsOwner(function () {
				Component.create({
					name: "com.buyerui.infoProvider",
					id: "infoProvider",
					url: "/infoprovider/infoProvider",
					manifest: true
				}).then(function (component) {
					oChildContainer.setComponent(component);
				}.bind(this));
			}.bind(this));
		}

	});

});