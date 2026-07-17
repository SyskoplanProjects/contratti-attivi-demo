/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core"
], function (BaseManager, SessionExpiredManager, ErrorManager, JSONModel, Core) {
    "use strict";

    var DocumentManagementManager = {

        /* =========================================================== */
        /* private functions                                           */
        /* =========================================================== */

        _prepareModelDocument: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("supplierscube");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierBe.sequentialRead("/Document", {
                    filters: aFilters,
                    // urlParameters: {
                    //     //$expand: "infoByYear",
                    //     contentType: "application/json; charset=utf-8",
                    //     dataType: "json"
                    // },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "Document");
                            sap.ui.getCore().getEventBus().publish("DocumentModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "Document");
                            sap.ui.getCore().getEventBus().publish("DocumentModelInizialized");
                            if (!ErrorManager) {
                                ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                            }
                            ErrorManager.showServiceError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }.bind(this)
                });
            }.bind(this));
        },

        _prepareModelMaintenanceException: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("supplierscube");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierBe.sequentialRead("/MaintenanceException", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "MaintenanceException");
                            sap.ui.getCore().getEventBus().publish("MaintenanceExceptionModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "MaintenanceException");
                            sap.ui.getCore().getEventBus().publish("MaintenanceExceptionModelInizialized");
                            if (!ErrorManager) {
                                ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                            }
                            ErrorManager.showServiceError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }.bind(this)
                });
            }.bind(this));
        },

        _prepareModelDocNote: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("supplierscube");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierBe.sequentialRead("/DocNote", {
                    filters: aFilters,
                    // urlParameters: {
                    //     //$expand: "infoByYear",
                    //     contentType: "application/json; charset=utf-8",
                    //     dataType: "json"
                    // },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "DocNote");
                            sap.ui.getCore().getEventBus().publish("DocNoteModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "DocNote");
                            sap.ui.getCore().getEventBus().publish("DocNoteModelInizialized");
                            if (!ErrorManager) {
                                ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                            }
                            ErrorManager.showServiceError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }.bind(this)
                });
            }.bind(this));
        },

        _prepareModelgetDocumentsBySuppliers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                /*var aCodeSupplier = oQueryParams.codeSupplier && Array.isArray(oQueryParams.codeSupplier) ? oQueryParams.codeSupplier : [
                    oQueryParams.codeSupplier
                ];*/
                var sSAPID = oQueryParams.SAPID;

                /*aCodeSupplier = aCodeSupplier.filter(function (sCodeSupplier) {
                    return sCodeSupplier !== "";
                });*/

                /*this._recursiveSearchSupplier(aCodeSupplier)*/
                this._getDocumentsBySuppliers(sSAPID)
                    .then(function (aResults) {
                        resolve(aResults);
                    }.bind(this))
                    .catch(function (oError) {
                        reject(oError);
                    }.bind(this));

            }.bind(this));
        },

        _getDocumentsBySuppliers: function (sSAPID) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("supplierscube");
                oSupplierBe.callFunction("/getDocumentsBySuppliers", {
                    method: "GET",
                    urlParameters: {
                        SAPID: sSAPID
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (!ErrorManager) {
                            ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                        }
                        ErrorManager.showServiceError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject(oError);
                    }.bind(this)
                });
            }.bind(this));
        },

        _updateEntryCollectionDocument: function (oQueryParams, oDocument) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierModel = oComponent.getModel("supplierscube");
                oSupplierModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oSupplierModel.createKey("Document", {
                    version: oDocument.version,
                    year: oDocument.year,
                    SAPID: oDocument.SAPID,
                    taxCodeOfTheIssuingCompany: oDocument.taxCodeOfTheIssuingCompany,
                });
                oSupplierModel.update("/" + sObjectPath, oDocument, {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (!ErrorManager) {
                            ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                        }
                        ErrorManager.showServiceError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject(oError);
                    }.bind(this)
                });
            }.bind(this));
        },

        /* =========================================================== */
        /* public functions                                           */
        /* =========================================================== */

        subscribeToModelRequest: function (sModelName) {
            Core.getEventBus().subscribe("Models" + sModelName, function (channel, event, oParameters) {
                var oQueryParams = oParameters.parameters;
                this["_prepareModel" + sModelName](oQueryParams).then(function (aResults) {
                    oParameters.resolve(aResults);
                }.bind(this)).catch(function (error) {
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

    BaseManager.extend(DocumentManagementManager);

    return DocumentManagementManager;
});