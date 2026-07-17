/* eslint-disable sap-no-element-creation */
sap.ui.define([
	"com/buyerui/buyerui/modules/managers/BaseManager",
	"sap/ui/core/Core",
],

function (BaseManager, Core) {
	"use strict";

	var ConfigurationManagerSendRequest = {

		fetchConfigurations: function (aModelRequests) {
			var aPromises = aModelRequests.map(function (oModelRequest) {
				return new Promise(function (resolve, error) {
					var oParameters = {
						resolve: resolve,
						error: error,
						parameters: {
							modelName: oModelRequest.modelName,
							filters: oModelRequest.parameters.filters,
							params: oModelRequest.params
						}
					};
					Core.getEventBus().publish("Models" + oModelRequest.modelName, oParameters);
				});
			});

			return aPromises;
		},
		
		mapParametersIntoText: function (sText, oParams) {
			for(var key in oParams) {
				sText = sText.replace("{"+key+"}", oParams[key]);
			}
			
			return sText;
		}

	};

	BaseManager.extend(ConfigurationManagerSendRequest);

	return ConfigurationManagerSendRequest;
});