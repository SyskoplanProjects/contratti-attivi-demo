/* eslint-disable sap-no-element-creation */
sap.ui.define([
	"com/buyerui/buyerui/modules/managers/BaseManager",
	"com/buyerui/buyerui/modules/managers/SessionExpiredManager",
	"com/buyerui/buyerui/modules/managers/ErrorManager",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Core"
], function (BaseManager, SessionExpiredManager, ErrorManager, JSONModel, Core) {
	"use strict";

	var oInfoProviderManager = {

		_prepareModelSupplierRequest: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oSupplierBE = oComponent.getModel("suppliersbe");
				var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
				oSupplierBE.sequentialRead("/SupplierRequest", {
					filters: aFilters,
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							var oJSONModel = new JSONModel(oData.results);
							var iLengthModel = Math.max(oData.results.length, 100);
							oJSONModel.setSizeLimit(iLengthModel);
							oComponent.setModel(oJSONModel, "SupplierRequest");
							sap.ui.getCore().getEventBus().publish("SupplierRequestModelInizialized");
							resolve(oData.results);
						}
					}.bind(this),
					error: function (oError) {
						oComponent.setModel(new JSONModel({}), "SupplierRequest");
						sap.ui.getCore().getEventBus().publish("SupplierRequestModelInizialized");
						ErrorManager.showServiceError(oError, {
							title: "Generic.error.title",
							message: "Generic.error.body"
						});
						reject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		_prepareModelSuppliers: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oSupplierBE = oComponent.getModel("suppliersbe");
				var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
				oSupplierBE.sequentialRead("/Suppliers", {
					filters: aFilters,
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							var oJSONModel = new JSONModel(oData.results);
							var iLengthModel = Math.max(oData.results.length, 100);
							oJSONModel.setSizeLimit(iLengthModel);
							oComponent.setModel(oJSONModel, "Suppliers");
							sap.ui.getCore().getEventBus().publish("SuppliersModelInizialized");
							resolve(oData.results);
						}
					}.bind(this),
					error: function (oError) {
						oComponent.setModel(new JSONModel({}), "Suppliers");
						sap.ui.getCore().getEventBus().publish("SuppliersModelInizialized");
						ErrorManager.showServiceError(oError, {
							title: "Generic.error.title",
							message: "Generic.error.body"
						});
						reject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		_prepareModelSupplierCertificates: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oSupplierBE = oComponent.getModel("suppliersbe");
				var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
				oSupplierBE.sequentialRead("/SupplierCertificates", {
					filters: aFilters,
					/*urlParameters: {
                        $expand: "docId,docId/supplier"
                    },*/
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							var oJSONModel = new JSONModel(oData.results);
							var iLengthModel = Math.max(oData.results.length, 100);
							oJSONModel.setSizeLimit(iLengthModel);
							oComponent.setModel(oJSONModel, "SupplierCertificates");
							sap.ui.getCore().getEventBus().publish("SupplierCertificatesModelInizialized");
							resolve(oData.results);
						}
					}.bind(this),
					error: function (oError) {
						oComponent.setModel(new JSONModel({}), "SupplierCertificates");
						sap.ui.getCore().getEventBus().publish("SupplierCertificatesModelInizialized");
						ErrorManager.showServiceError(oError, {
							title: "Generic.error.title",
							message: "Generic.error.body"
						});
						reject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		_updateEntryCollectionSupplierRequest: function (oQueryParams, oSupplierRequest) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oSupplierBe = oComponent.getModel("suppliersbe");
				oSupplierBe.sDefaultUpdateMethod = "PATCH";
				var sObjectPath = oSupplierBe.createKey("SupplierRequest", {
					ID: oSupplierRequest.ID
				});
				oSupplierBe.update("/" + sObjectPath, oSupplierRequest, {
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							resolve(oData);
						}
					}.bind(this),
					error: function (oError) {
						ErrorManager.showServiceError(oError, {
							title: "Generic.error.title",
							message: "Generic.error.body"
						});
						reject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

        _createEntryCollectionSupplierRequest: function (oQueryParams, oSupplierRequest) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oSupplierBe = oComponent.getModel("suppliersbe");
				var sObjectPath = "SupplierRequest";
				oSupplierBe.create("/" + sObjectPath, oSupplierRequest, {
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							resolve(oData);
						}
					}.bind(this),
					error: function (oError) {
						ErrorManager.showServiceError(oError, {
							title: "Generic.error.title",
							message: "Generic.error.body"
						});
						reject(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		_setEntryCollectionReadAttachmentWithManagerSupplier: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				this._readAttachmentInfo(oQueryParams.ID, oQueryParams.showPreview, oQueryParams.fileName)
					.then(function (oData) {
						resolve(oData);
					}.bind(this)).catch(function () {
						reject();
					}.bind(this));
			}.bind(this));
		},

		_readAttachmentInfo: function (sID, showPreview, sFileName) {
			this._setDocumentManagementInfo();
			//return AttachmentManager['{{{user-provided.documentManagementSLP.destinationName}}}'].readDocument(sID, showPreview, sFileName);
		},

		_setEntryCollectionAttachmentsWithManagerSupplier: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				this._attachDocuments(oQueryParams.document)
					.then(function (oData) {
						resolve();
					}.bind(this))
					.catch(function (oError) {
						reject(oError);
					}.bind(this));
			}.bind(this));
		},

		_attachDocuments: function (oDocument) {
			/*return new Promise(function (resolve, reject) {
				var sUUID = oDocument.ID;
				var oContent = oDocument.content;
				this._setDocumentManagementInfo();

				AttachmentManager['{{{user-provided.documentManagementSLP.destinationName}}}'].uploadDocument(oContent, sUUID)
					.then(function () {
						resolve();
					}.bind(this))
					.catch(function (oError) {
						reject(oError);
					}.bind(this));
			}.bind(this));*/
		},

		_setDocumentManagementInfo: function () {
			var sRepositoryId = '{{{user-provided.documentManagementSLP.repositoryId}}}';
			var sFolderName = '{{{user-provided.documentManagementSLP.folderName}}}';
			var sFolderURL = "browser/" + sRepositoryId + "/root/" + sFolderName;
			var sRootURL = "browser/" + sRepositoryId + "/root";
			var sDocumentManagementDestinatio = '{{{user-provided.documentManagementSLP.destinationName}}}';
			/*return AttachmentManager['{{{user-provided.documentManagementSLP.destinationName}}}']
				.setDocumentManagementInfo(sFolderURL, sRootURL, sDocumentManagementDestinatio);*/
		},

		_generateUrl: function (sUrl, oQueryParams) {
			var aKeys = Object.keys(oQueryParams);
			for (var i = 0; i < aKeys.length; i++) {
				sUrl += (i === 0 ? "?" : "&") + aKeys[i] + "=" + oQueryParams[aKeys[i]];
			}
			return sUrl;
		},

		/* =========================================================== */
		/* public functions */
		/* =========================================================== */

		subscribeToModelRequest: function (sModelName) {
			Core.getEventBus().subscribe("Models" + sModelName, function (channel, event, oParameters) {
				var oQueryParams = oParameters.parameters;
				this["_prepareModel" + sModelName](oQueryParams).then(function (aResults) {
					oParameters.resolve(aResults);
				}.bind(this)).catch(function () {
					oParameters.error();
				}.bind(this));
			}.bind(this));
		},

		subscribeToSetEntry: function (sModelName) {
			Core.getEventBus().subscribe("setEntry" + sModelName, function (channel, event, oParameters) {
				var oQueryParams = oParameters.parameters;
				var oBody = oParameters.body;
				this["_setEntryCollection" + sModelName](oQueryParams, oBody).then(function (oData) {
					oParameters.resolve(oData);
				}.bind(this)).catch(function () {
					oParameters.error();
				}.bind(this));
			}.bind(this));
		},

		subscribeToUpdateEntry: function (sModelName) {
			Core.getEventBus().subscribe("updateEntry" + sModelName, function (channel, event, oParameters) {
				var oQueryParams = oParameters.parameters;
				var oBody = oParameters.body;
				this["_updateEntryCollection" + sModelName](oQueryParams, oBody).then(function (oData) {
					oParameters.resolve(oData);
				}.bind(this)).catch(function () {
					oParameters.error();
				}.bind(this));
			}.bind(this));
		},

        subscribeToCreateEntry: function (sModelName) {
			Core.getEventBus().subscribe("createEntry" + sModelName, function (channel, event, oParameters) {
				var oQueryParams = oParameters.parameters;
				var oBody = oParameters.body;
				this["_createEntryCollection" + sModelName](oQueryParams, oBody).then(function (oData) {
					oParameters.resolve(oData);
				}.bind(this)).catch(function () {
					oParameters.error();
				}.bind(this));
			}.bind(this));
		},

		subscribeToDeleteEntry: function (sModelName) {
			Core.getEventBus().subscribe("deleteEntry" + sModelName, function (channel, event, oParameters) {
				var oQueryParams = oParameters.parameters;
				var oBody = oParameters.body;
				this["_deleteEntryCollection" + sModelName](oQueryParams, oBody).then(function (oData) {
					oParameters.resolve(oData);
				}.bind(this)).catch(function () {
					oParameters.error();
				}.bind(this));
			}.bind(this));
		}

	};

	BaseManager.extend(oInfoProviderManager);

	return oInfoProviderManager;
});