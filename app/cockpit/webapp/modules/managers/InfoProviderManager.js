/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core"
], function (BaseManager, SessionExpiredManager, ErrorManager, JSONModel, Core) {
    "use strict";

    var InfoProviderManager = {

        /* =========================================================== */
        /* private functions                                           */
        /* =========================================================== */

        _prepareModelIPSuppliers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var sCustomModelName = oQueryParams && oQueryParams.customModelName ? oQueryParams.customModelName : "IPSuppliers";
                oIPBEModel.sequentialRead("/IPSuppliers", {
                    filters: aFilters,
                    urlParameters: {
                        //$expand: "infoByYear",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sCustomModelName);
                            sap.ui.getCore().getEventBus().publish(sCustomModelName + "ModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sCustomModelName);
                            sap.ui.getCore().getEventBus().publish(sCustomModelName + "ModelInizialized");
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

        _prepareModelESGSuppliers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var sCustomModelName = oQueryParams && oQueryParams.customModelName ? oQueryParams.customModelName : "ESGSuppliers";
                oIPBEModel.sequentialRead("/ESGSuppliers", { 
                    filters: aFilters,
                    urlParameters: {
                        //$expand: "infoByYear",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sCustomModelName);
                            sap.ui.getCore().getEventBus().publish(sCustomModelName + "ModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sCustomModelName);
                            sap.ui.getCore().getEventBus().publish(sCustomModelName + "ModelInizialized");
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

        _prepareModelCategoryMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationModel = oComponent.getModel("qualificationbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oQualificationModel.sequentialRead("/CategoryMasterData", {
                    filters: aFilters,
                    urlParameters: {
                        $expand: "",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "CategoryMasterData");
                            sap.ui.getCore().getEventBus().publish("CategoryMasterDataModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "CategoryMasterData");
                            sap.ui.getCore().getEventBus().publish("CategoryMasterDataInizialized");
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

        _prepareModelMotivationMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationModel = oComponent.getModel("qualificationbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oQualificationModel.sequentialRead("/MotivationMasterData", {
                    filters: aFilters,
                    urlParameters: {
                        $expand: "",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "MotivationMasterData");
                            sap.ui.getCore().getEventBus().publish("MotivationMasterDataModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "MotivationMasterData");
                            sap.ui.getCore().getEventBus().publish("MotivationMasterDataInizialized");
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

        _prepareModelSupplierQualifications: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationBEModel = oComponent.getModel("qualificationbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oQualificationBEModel.sequentialRead("/SupplierQualifications", {
                    filters: aFilters,
                    urlParameters: {
                        $expand: "supplier/infoByYear"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var fnMapData = oQueryParams.fnMapData;
                            if(!!fnMapData) {
                                aResults = aResults.map(fnMapData);
                            }
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "SupplierQualifications");
                            sap.ui.getCore().getEventBus().publish("SupplierQualificationsModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "SupplierQualifications");
                            sap.ui.getCore().getEventBus().publish("SupplierQualificationsModelInizialized");
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

        _prepareModelSupplierUpdateFromBccResults: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oIPBEModel.sequentialRead("/SupplierUpdateFromBccResults", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var fnMapData = oQueryParams.fnMapData;
                            if(!!fnMapData) {
                                aResults = aResults.map(fnMapData);
                            }
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "SupplierUpdateFromBccResults");
                            sap.ui.getCore().getEventBus().publish("SupplierUpdateFromBccResultsModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "SupplierUpdateFromBccResults");
                            sap.ui.getCore().getEventBus().publish("SupplierUpdateFromBccResultsModelInizialized");
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

        _prepareModelServiceList: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oIPBEModel.sequentialRead("/ServiceList", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var fnMapData = oQueryParams.fnMapData;
                            if(!!fnMapData) {
                                aResults = aResults.map(fnMapData);
                            }
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "ServiceList");
                            sap.ui.getCore().getEventBus().publish("ServiceListModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "ServiceList");
                            sap.ui.getCore().getEventBus().publish("ServiceListModelInizialized");
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

        _updateEntryCollectionIPSuppliers: function (oQueryParams, oIPSupplier) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                oIPBEModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oIPBEModel.createKey("Suppliers", {
                    vatCode: oIPSupplier.vatCode,
                    taxNumber: oIPSupplier.taxNumber,
                    email: oIPSupplier.email
                });
                oIPBEModel.update("/" + sObjectPath, oIPSupplier, {
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

        _setEntryCollectionIPSuppliers: function (oQueryParams, oIPSupplier) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                oIPBEModel.sDefaultUpdateMethod = "POST";
                var sObjectPath = oIPBEModel.createKey("Suppliers", {
                    vatCode: oIPSupplier.vatCode,
                    taxNumber: oIPSupplier.taxNumber,
                    email: oIPSupplier.email
                });
                oIPBEModel.create("/Suppliers", oIPSupplier, {
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

        _prepareModelActivateIP: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                /*var aCodeSupplier = oQueryParams.codeSupplier && Array.isArray(oQueryParams.codeSupplier) ? oQueryParams.codeSupplier : [
                    oQueryParams.codeSupplier
                ];*/
                var sVatCode = oQueryParams.vatCode;
                var sTaxNumber = oQueryParams.taxNumber;
                var sEmail = oQueryParams.email;

                /*aCodeSupplier = aCodeSupplier.filter(function (sCodeSupplier) {
                    return sCodeSupplier !== "";
                });*/

                /*this._recursiveSearchSupplier(aCodeSupplier)*/
                this._activateIP(sVatCode, sTaxNumber, sEmail)
                    .then(function (aResults) {
                        resolve(aResults);
                    }.bind(this))
                    .catch(function (oError) {
                        reject(oError);
                    }.bind(this));

            }.bind(this));
        },

        _prepareModelActivateIPESG: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                /*var aCodeSupplier = oQueryParams.codeSupplier && Array.isArray(oQueryParams.codeSupplier) ? oQueryParams.codeSupplier : [
                    oQueryParams.codeSupplier
                ];*/
                var sVatCode = oQueryParams.vatCode;
                var sTaxNumber = oQueryParams.taxNumber;
                var sEmail = oQueryParams.email;

                /*aCodeSupplier = aCodeSupplier.filter(function (sCodeSupplier) {
                    return sCodeSupplier !== "";
                });*/

                /*this._recursiveSearchSupplier(aCodeSupplier)*/
                this._activateIPESG(sVatCode, sTaxNumber, sEmail)
                    .then(function (aResults) {
                        resolve(aResults);
                    }.bind(this))
                    .catch(function (oError) {
                        reject(oError);
                    }.bind(this));

            }.bind(this));
        },

        _prepareModelActivateIPSynesgy: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                /*var aCodeSupplier = oQueryParams.codeSupplier && Array.isArray(oQueryParams.codeSupplier) ? oQueryParams.codeSupplier : [
                    oQueryParams.codeSupplier
                ];*/
                var sVatCode = oQueryParams.vatCode;
                var sTaxNumber = oQueryParams.taxNumber;
                var sEmail = oQueryParams.email;

                /*aCodeSupplier = aCodeSupplier.filter(function (sCodeSupplier) {
                    return sCodeSupplier !== "";
                });*/

                /*this._recursiveSearchSupplier(aCodeSupplier)*/
                this._activateIPSynesgy(sVatCode, sTaxNumber, sEmail)
                    .then(function (aResults) {
                        resolve(aResults);
                    }.bind(this))
                    .catch(function (oError) {
                        reject(oError);
                    }.bind(this));

            }.bind(this));
        },

        _recursiveSearchSupplier: function (aCodeSupplier) {
            return new Promise(function (resolve, reject) {
                var sCodeSupplier = aCodeSupplier.shift();
                if (!sCodeSupplier || sCodeSupplier === "") {
                    resolve([]);
                } else {
                    this._searchSupplier(sCodeSupplier).then(function (aResults) {
                            if (aResults.length > 0) {
                                resolve(aResults);
                            } else {
                                this._recursiveSearchSupplier(aCodeSupplier).then(function (aResults2) {
                                        resolve(aResults2);
                                    })
                                    .catch(function (oError) {
                                        reject(oError);
                                    }.bind(this));
                            }
                        }.bind(this))
                        .catch(function (oError) {
                            reject(oError);
                        }.bind(this));
                }

            }.bind(this));
        },

        _activateIP: function (/*sCodeSupplier*/sVatCode, sTaxNumber, sEmail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                oIPBE.callFunction("/activateIP", {
                    method: "GET",
                    urlParameters: {
                        vatCode: sVatCode, 
                        taxNumber: sTaxNumber, 
                        email: sEmail
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

        _activateIPESG: function (/*sCodeSupplier*/sVatCode, sTaxNumber, sEmail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                oIPBE.callFunction("/activateIPESG", {
                    method: "GET",
                    urlParameters: {
                        vatCode: sVatCode, 
                        taxNumber: sTaxNumber, 
                        email: sEmail
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

        _activateIPSynesgy: function (/*sCodeSupplier*/sVatCode, sTaxNumber, sEmail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                oIPBE.callFunction("/activateIPSynesgy", {
                    method: "GET",
                    urlParameters: {
                        vatCode: sVatCode, 
                        taxNumber: sTaxNumber, 
                        email: sEmail
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


        _prepareModelInfoProviderMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oIPBE.sequentialRead("/InfoProviderMasterData", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "InfoProviderMasterData");
                            sap.ui.getCore().getEventBus().publish("InfoProviderMasterDataModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        oComponent.setModel(new JSONModel({}), "InfoProviderMasterData");
                        sap.ui.getCore().getEventBus().publish("InfoProviderMasterDataModelInizialized");
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

        _prepareModelDocumentDownload: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                /*var id = oQueryParams.id;
                var format = oQueryParams.format;
                var documentType = oQueryParams.documentType;*/
                oIPBE.read("/documentDownload", {
                    method: "GET",
                    urlParameters: {
                        /*id: id,
                        format: format,
                        documentType: documentType*/
                        vatCode: oQueryParams.vatCode,
                        taxNumber: oQueryParams.taxNumber
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData.documentDownload);
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

        _prepareModelDocumentDownloadESG: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                /*var id = oQueryParams.id;
                var format = oQueryParams.format;
                var documentType = oQueryParams.documentType;*/
                oIPBE.read("/documentDownloadESG", {
                    method: "GET",
                    urlParameters: {
                        /*id: id,
                        format: format,
                        documentType: documentType*/
                        vatCode: oQueryParams.vatCode,
                        taxNumber: oQueryParams.taxNumber
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData.documentDownloadESG);
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

        _prepareModelDocumentDownloadSynesgy: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBE = oComponent.getModel("ipbe");
                /*var id = oQueryParams.id;
                var format = oQueryParams.format;
                var documentType = oQueryParams.documentType;*/
                oIPBE.read("/documentDownloadSynesgy", {
                    method: "GET",
                    urlParameters: {
                        /*id: id,
                        format: format,
                        documentType: documentType*/
                        vatCode: oQueryParams.vatCode,
                        taxNumber: oQueryParams.taxNumber
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData.documentDownloadSynesgy);
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

        _prepareModelSupplierRotationHistory: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("suppliersbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierBe.sequentialRead("/SupplierRotation", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oDataSupplier = {};
                            if (oData.results.length > 0 && !!oQueryParams) {
                                var oResult = oData.results[0];
                                oDataSupplier = {
                                    extractedSupplier: oResult.extractedSupplier.map(function (oExtractedSupplier) {
                                        return JSON.parse(oExtractedSupplier);
                                    }),
                                    supplierNr: oResult.supplierNr,
                                    certifications: oResult.certifications,
                                    certificationAnd: oResult.certificationAnd,
                                    categoryAnd: oResult.categoryAnd
                                };
                                var oJSONModel = new JSONModel(oDataSupplier.extractedSupplier);
                                var iLengthModel = Math.max(oResult.extractedSupplier.length, 100);
                                oJSONModel.setSizeLimit(iLengthModel);
                                oComponent.setModel(oJSONModel, "Supplier");
                                sap.ui.getCore().getEventBus().publish("SupplierModelInizialized");
                            } else {
                                var aResults = oData.results.map(function (oResult) {
                                    oResult.documentAttached = oResult.documentAttached.map(function (oAttachment) {
                                        return JSON.parse(oAttachment);
                                    });

                                    oResult.lottoArray = oResult.lottoArray.map(function (oLottoItem) {
                                        return JSON.parse(oLottoItem);
                                    });

                                    oResult.commodities = oResult.commodities.map(function (oCommodities) {
                                        return JSON.parse(oCommodities);
                                    });

                                    oResult.extractedSupplier = oResult.extractedSupplier.map(function (oExtractedSupplier) {
                                        return JSON.parse(oExtractedSupplier);
                                    });

                                    return oResult;
                                });
                                var oJSONModel = new JSONModel(oData.results);
                                var iLengthModel = Math.max(oData.results.length, 100);
                                oJSONModel.setSizeLimit(iLengthModel);
                                oComponent.setModel(oJSONModel, "SupplierRotationHistory");
                                sap.ui.getCore().getEventBus().publish("SupplierRotationHistoryModelInizialized");
                            }

                            resolve(oDataSupplier);
                        }
                    }.bind(this),
                    error: function (oError) {
                        oComponent.setModel(new JSONModel({}), "Supplier");
                        sap.ui.getCore().getEventBus().publish("SupplierModelInizialized");
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

        _updateEntryCollectionSupplierRotationHistory: function (oQueryParams, oSupplierRotationHistory) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("suppliersbe");
                oSupplierBe.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oSupplierBe.createKey("SupplierRotation", {
                    docID: oSupplierRotationHistory.docID,
                    taskId: oSupplierRotationHistory.taskId
                });
                oSupplierBe.update("/" + sObjectPath, oSupplierRotationHistory, {
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

        _setEntryCollectionSupplierForQualification: function (oQueryParams, oManualSupplierQualifications) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationBEModel = oComponent.getModel("qualificationbe");
                oQualificationBEModel.sDefaultUpdateMethod = "POST";

                oQualificationBEModel.create("/Suppliers", oManualSupplierQualifications, {
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

        _setEntryCollectionCategoryCustom: function (oQueryParams, oManualSupplierQualifications) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationBEModel = oComponent.getModel("qualificationbe");
                oQualificationBEModel.sDefaultUpdateMethod = "POST";

                oQualificationBEModel.create("/Suppliers", oManualSupplierQualifications, {
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


        _setEntryCollectionManualSupplierQualifications: function (oQueryParams, oManualSupplierQualifications) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationBEModel = oComponent.getModel("qualificationbe");
                oQualificationBEModel.sDefaultUpdateMethod = "POST";

                oQualificationBEModel.create("/ManualSupplierQualifications", oManualSupplierQualifications, {
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

        
        _setEntryCollectionRegisterSupplierFile: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierBe = oComponent.getModel("suppliersbe");
                var sDocID = oQueryParams.docID;
                var sLanguage = oQueryParams.lang;
                oSupplierBe.callFunction("/generateRegisterSupplierFile", {
                    method: "GET",
                    urlParameters: {
                        docID: sDocID,
                        lang: sLanguage
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData.value);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (!ErrorManager) {
                            ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager");
                        }
                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject(oError);
                    }.bind(this)
                });
            }.bind(this));
        },

        _setEntryCollectionSupplierUpdateFromBccResults: function (oQueryParams, oSupplierUpdateFromBccResults) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oIPBEModel = oComponent.getModel("ipbe");
                oIPBEModel.sDefaultUpdateMethod = "POST";

                oIPBEModel.create("/SupplierUpdateFromBccResults", oSupplierUpdateFromBccResults, {
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

        _generateUrl: function (sUrl, oQueryParams) {
            var aKeys = Object.keys(oQueryParams);
            for (var i = 0; i < aKeys.length; i++) {
                sUrl += (i === 0 ? "?" : "&") + aKeys[i] + "=" + oQueryParams[aKeys[i]];
            }
            return sUrl;
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

    BaseManager.extend(InfoProviderManager);

    return InfoProviderManager;
});