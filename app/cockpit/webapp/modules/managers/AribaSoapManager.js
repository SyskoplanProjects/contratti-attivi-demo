/* eslint-disable sap-no-element-creation */
sap.ui.define([
		"com/buyerui/buyerui/modules/managers/BaseManager",
		"com/buyerui/buyerui/modules/managers/ModelManager",
		"com/buyerui/buyerui/modules/managers/SessionExpiredManager",
		"com/buyerui/buyerui/modules/managers/ErrorManager",
		"sap/ui/model/json/JSONModel",
		"sap/ui/model/resource/ResourceModel",
		"sap/ui/core/Core",
		"com/buyerui/buyerui/modules/constants",
		"sap/m/MessageToast"
	],
	function (BaseManager, ModelManager, SessionExpiredManager, ErrorManager, JSONModel, ResourceModel, Core, constants, MessageToast) {
		"use strict";

		var AribaSoapManager = {

			subscribeToEventImport: function () {
				Core.getEventBus().subscribe("aribaSoapEventImport", function (channel, event, oParameters) {
					var sFileContent = oParameters.parameters.base64fileContent;
					var sDocumentId = oParameters.parameters.documentId;
					this._importEvent(sFileContent, sDocumentId).then(function () {
						oParameters.resolve();
					}.bind(this)).catch(function () {
						oParameters.error();
					}.bind(this));
				}.bind(this));
			},

			_importEvent: function (sFileContent, sDocumentId) {
				return new Promise(function (resolve, reject) {
					var sUrl = "/ariba_soap_sourcing/EventImport";
					var oComponent = this.getComponent();
					var oCSFRTokenModel = oComponent.getModel("CSRFToken");
					var sToken = oCSFRTokenModel.getProperty("/token");
					jQuery.ajax({
						url: sUrl,
						method: "POST",
						data: "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:urn=\"urn:Ariba:Sourcing:vrealm_3387\">\r\n   <soapenv:Header>\r\n      <urn:Headers>\r\n         <!--You may enter the following 2 items in any order-->\r\n         <!--Optional:-->\r\n         <urn:variant>?</urn:variant>\r\n         <!--Optional:-->\r\n         <urn:partition>?</urn:partition>\r\n      </urn:Headers>\r\n   </soapenv:Header>\r\n   <soapenv:Body>\r\n      <urn:EventImportRequest partition=\"?\" variant=\"?\">\r\n         <!--Optional:-->\r\n         <urn:WSRFXDocumentInputBean_Item>\r\n            <!--Optional:-->\r\n            <urn:item>\r\n               <!--You may enter the following 11 items in any order-->\r\n               <urn:Action>Update</urn:Action>\r\n               <urn:Attachments></urn:Attachments>\r\n               <urn:Contents>" +
							sFileContent +
							"</urn:Contents>\r\n               <urn:DocumentId>" + sDocumentId +
							"</urn:DocumentId>\r\n               <urn:DocumentName></urn:DocumentName>\r\n               <urn:OnBehalfUserId></urn:OnBehalfUserId>\r\n               <!--Optional:-->\r\n               <urn:OnBehalfUserPasswordAdapter></urn:OnBehalfUserPasswordAdapter>\r\n               <!--Optional:-->\r\n               <!--<urn:RFXDocumentHeaderFields>-->\r\n                  <!--You may enter the following 5 items in any order-->\r\n                  <!--Optional:-->\r\n               <!--   <urn:BaseLanguage>-->\r\n                     <!--Optional:-->\r\n               <!--      <urn:UniqueName>?</urn:UniqueName>-->\r\n               <!--   </urn:BaseLanguage>-->\r\n                  <!--Optional:-->\r\n               <!--   <urn:Commodity>-->\r\n                     <!--Zero or more repetitions:-->\r\n               <!--      <urn:item>-->\r\n                        <!--You may enter the following 2 items in any order-->\r\n               <!--         <urn:Domain>?</urn:Domain>-->\r\n               <!--         <urn:UniqueName>?</urn:UniqueName>-->\r\n               <!--      </urn:item>-->\r\n               <!--   </urn:Commodity>-->\r\n                  <!--Optional:-->\r\n               <!--   <urn:Currency>-->\r\n                     <!--Optional:-->\r\n               <!--      <urn:UniqueName>?</urn:UniqueName>-->\r\n               <!--   </urn:Currency>-->\r\n                  <!--Optional:-->\r\n               <!--   <urn:Description>-->\r\n                     <!--Optional:-->\r\n               <!--      <urn:DefaultStringTranslation>?</urn:DefaultStringTranslation>-->\r\n               <!--   </urn:Description>-->\r\n                  <!--Optional:-->\r\n               <!--   <urn:Title>-->\r\n                     <!--Optional:-->\r\n               <!--      <urn:DefaultStringTranslation>?</urn:DefaultStringTranslation>-->\r\n               <!--   </urn:Title>-->\r\n               <!--</urn:RFXDocumentHeaderFields>-->\r\n               <urn:ReplaceEventContent>false</urn:ReplaceEventContent>\r\n               <urn:TemplateId></urn:TemplateId>\r\n               <urn:WorkspaceId></urn:WorkspaceId>\r\n            </urn:item>\r\n         </urn:WSRFXDocumentInputBean_Item>\r\n      </urn:EventImportRequest>\r\n   </soapenv:Body>\r\n</soapenv:Envelope>",
						contentType: "application/xml",
						headers: {
							'X-CSRF-Token': sToken
						},
						async: true,
						success: function (oData, oHeader) {
							if (SessionExpiredManager.checkHeader(oHeader)) {
								var statusPosition = oData.search("Status") + 7;
								var stringLength = oData.length;
								var sStatus = oData.substr(statusPosition, oData.substr(statusPosition, stringLength).search("<"));
								if (oData.search("Faultcode") !== -1 || (sStatus && sStatus != 0)) {
									var sResponseText = oData.match(/ErrorMessage>(.*)<\/ErrorMessage/)[1] || "Failed to import event";
									var oError = {
										status: "400",
										responseText: sResponseText
									};
									ErrorManager.showServiceRestError(oError, {
										title: "Generic.error.title",
										message: "Generic.error.body"
									});
									reject();
								} else {
									resolve();
								}
							}
						}.bind(this),
						error: function (oError) {
							
							ErrorManager.showServiceRestError(oError, {
								title: "Generic.error.title",
								message: "Generic.error.body"
							});
							reject(oError);
						}.bind(this)
					});
				}.bind(this));
			},

			subscribeToDocumentImport: function () {
				Core.getEventBus().subscribe("aribaSoapDocumentImport", function (channel, event, oParameters) {
					var sFileContent = oParameters.parameters.base64fileContent;
					var sFileName = oParameters.parameters.fileName;
					var sWorkspaceId = oParameters.parameters.workspaceId;
					this._importDocument(sFileContent, sFileName, sWorkspaceId).then(function () {
						oParameters.resolve();
					}.bind(this)).catch(function () {
						oParameters.error();
					}.bind(this));
				}.bind(this));
			},

			_importDocument: function (sFileContent, sFileName, sWorkspaceId) {
				return new Promise(function (resolve, reject) {
					var sUrl = "/ariba_soap_sourcing/DocumentImport";
					var oComponent = this.getComponent();
					var oCSFRTokenModel = oComponent.getModel("CSRFToken");
					var sToken = oCSFRTokenModel.getProperty("/token");
					jQuery.ajax({
						url: sUrl,
						method: "POST",
						data: "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:urn=\"urn:Ariba:Sourcing:vrealm_3387\">\r\n   <soapenv:Header>\r\n      <urn:Headers>\r\n         <!--You may enter the following 2 items in any order-->\r\n         <!--Optional:-->\r\n         <urn:variant>?</urn:variant>\r\n         <!--Optional:-->\r\n         <urn:partition>?</urn:partition>\r\n      </urn:Headers>\r\n   </soapenv:Header>\r\n   <soapenv:Body>\r\n      <urn:DocumentImportRequest partition=\"?\" variant=\"?\">\r\n         <!--Optional:-->\r\n         <urn:WSDocumentInputBean_Item>\r\n            <!--Optional:-->\r\n            <urn:item>\r\n               <!--You may enter the following 7 items in any order-->\r\n               <urn:Action>Create</urn:Action>\r\n               <urn:Contents>" +
							sFileContent +
							"</urn:Contents>\r\n               <urn:DocumentId></urn:DocumentId>\r\n               <urn:DocumentName>" + sFileName +
							"</urn:DocumentName>\r\n               <urn:OnBehalfUserId></urn:OnBehalfUserId>\r\n               <!--Optional:-->\r\n               <!--<urn:OnBehalfUserPasswordAdapter></urn:OnBehalfUserPasswordAdapter>-->\r\n               <urn:WorkspaceId>" +
							sWorkspaceId +
							"</urn:WorkspaceId>\r\n            </urn:item>\r\n         </urn:WSDocumentInputBean_Item>\r\n      </urn:DocumentImportRequest>\r\n   </soapenv:Body>\r\n</soapenv:Envelope>",
						contentType: "application/xml",
						headers: {
							'X-CSRF-Token': sToken
						},
						async: true,
						success: function (oData, oHeader) {
							if (SessionExpiredManager.checkHeader(oHeader)) {
								resolve();
							}
						}.bind(this),
						error: function (oError) {
							
							ErrorManager.showServiceRestError(oError, {
								title: "Generic.error.title",
								message: "Generic.error.body"
							});
							reject(oError);
						}.bind(this)
					});
				}.bind(this));
			},

		};

		BaseManager.extend(AribaSoapManager);

		return AribaSoapManager;
	});