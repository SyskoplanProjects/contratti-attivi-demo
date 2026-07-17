/*eslint-disable no-console, no-alert */
sap.ui.define([
	"com/buyerui/buyerui/modules/managers/BaseManager",
	"sap/ui/model/json/JSONModel"
], function (BaseManager, JSONModel) {
	"use strict";
	
	var oCSRFTokenManager = {
		
		fetchCSRFToken: function () {
			return new Promise(function (resolve) {				
				$.ajax({
					url: "/",
					type: "GET",
					async: true,
					headers: {
						'X-CSRF-Token': "Fetch"
					},
					complete: function (xhr) {
						var sToken = xhr.getResponseHeader("X-CSRF-Token");
						var oComponent = this.getComponent();
						oComponent.setModel(new JSONModel({token: sToken}), "CSRFToken");
						sap.ui.getCore().getEventBus().publish("CSRFTokenModelInizialized");
						resolve(sToken);
					}.bind(this)
				});
			}.bind(this));
		}
		
	};
	
	BaseManager.extend(oCSRFTokenManager);

	return oCSRFTokenManager;
});