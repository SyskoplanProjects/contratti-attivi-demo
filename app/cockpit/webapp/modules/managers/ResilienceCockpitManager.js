/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core",
    "com/buyerui/buyerui/modules/managers/ModelManager"
], function (BaseManager, SessionExpiredManager, ErrorManager, JSONModel, Core, ModelManager) {
    "use strict";

    var ResilienceCockpitManager = {

        /* =========================================================== */
        /* private functions                                           */
        /* =========================================================== */

        _prepareModelResilienceSuppliers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oResilienceBEModel.sequentialRead("/ResilienceSuppliers", {
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
                            oComponent.setModel(oJSONModel, "ResilienceSuppliers");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "ResilienceSuppliers");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersModelInizialized");
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

        _prepareModelResilienceSuppliersArchive: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oResilienceBEModel.sequentialRead("/ResilienceSuppliersArchive", {
                    filters: aFilters,
                    urlParameters: {
                        //$expand: "infoByYear",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            oData.results.forEach(function(record) {
                                // Se il flag non è già definito, lo impostiamo in base al valore
                                record.isEconomicBalanceEditable = (record.isEconomicBalanceEditable !== undefined) 
                                    ? record.isEconomicBalanceEditable 
                                    : !record.economicBalance;
                                record.isLiquidityBalanceEditable  = (record.isLiquidityBalanceEditable !== undefined) 
                                    ? record.isLiquidityBalanceEditable 
                                    : !record.liquidityBalance;
                                record.isAssetBalanceEditable      = (record.isAssetBalanceEditable !== undefined) 
                                    ? record.isAssetBalanceEditable 
                                    : !record.assetBalance;
                                record.isFinancialScoreEditable    = (record.isFinancialScoreEditable !== undefined) 
                                    ? record.isFinancialScoreEditable 
                                    : !record.financialScore;
                            });                            
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "ResilienceSuppliersArchive");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersArchiveModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "ResilienceSuppliersArchive");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersArchiveModelInizialized");
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


        _prepareModelResilienceSuppliersInsertData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oResilienceBEModel.sequentialRead("/ResilienceSuppliersInsertData", {
                    filters: aFilters,
                    urlParameters: {
                        //$expand: "infoByYear",
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            oData.results.forEach(function(record) {
                                // Se il flag non è già definito, lo impostiamo in base al valore
                                record.isEconomicBalanceEditable = (!!record.isEconomicBalanceEditable) 
                                    ? record.isEconomicBalanceEditable 
                                    : !record.economicBalance;
                                record.isLiquidityBalanceEditable  = (!!record.isLiquidityBalanceEditable) 
                                    ? record.isLiquidityBalanceEditable 
                                    : !record.liquidityBalance;
                                record.isAssetBalanceEditable      = (!!record.isAssetBalanceEditable) 
                                    ? record.isAssetBalanceEditable 
                                    : !record.assetBalance;
                                record.isFinancialScoreEditable    = (!!record.isFinancialScoreEditable) 
                                    ? record.isFinancialScoreEditable 
                                    : !record.financialScore;
                            });                           
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "ResilienceSuppliersInsertData");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersInsertDataModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "ResilienceSuppliersInsertData");
                            sap.ui.getCore().getEventBus().publish("ResilienceSuppliersInsertDataModelInizialized");
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

        _prepareModelSuppliersFromS4: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");
                oResilienceBEModel.sequentialRead("/SuppliersFromS4", {
                    urlParameters: {
                        contentType: "application/json; charset=utf-8",
                        dataType: "json"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "SuppliersFromS4");
                            sap.ui.getCore().getEventBus().publish("SuppliersFromS4ModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "SuppliersFromS4");
                            sap.ui.getCore().getEventBus().publish("SuppliersFromS4ModelInizialized");
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

        _prepareModelCalculateResilience: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var SAPID = oQueryParams.SAPID;

                this._calculateResilience(SAPID)
                    .then(function (aResults) {
                        resolve(aResults);
                    }.bind(this))
                    .catch(function (oError) {
                        reject(oError);
                    }.bind(this));

            }.bind(this));
        },

        _fetchCSRFToken: function () {
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
                        resolve(sToken);
                    }.bind(this)
                });
            }.bind(this));
        },

        _calculateResilience: function (SAPID) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                this._fetchCSRFToken().then(token => {
                    $.ajax({
                        url: "/suppliers_be/v2/resilience/calculateResilience",
                        method: "POST",
                        data: SAPID,
                        headers: {
                            'X-CSRF-Token': token
                        },
                        contentType: "application/json; charset=utf-8",
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
                        }.bind(this)
                    });
                })
            }.bind(this));
        },

        _updateEntryCollectionResilienceSuppliers: function (oQueryParams, oResilienceSupplier) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");
                oResilienceBEModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oResilienceBEModel.createKey("Suppliers", {
                    vatCode: oResilienceSupplier.vatCode,
                    taxNumber: oResilienceSupplier.taxNumber,
                    email: oResilienceSupplier.email
                });
                oResilienceBEModel.update("/" + sObjectPath, oResilienceSupplier, {
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

        _updateEntryCollectionResilienceSuppliersArchive: function (oQueryParams, oResilienceSupplierKey) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oResilienceBEModel = oComponent.getModel("resiliencebe");

                // Crea la chiave per il record da leggere (con isLast = true)
                var sObjectPath = oResilienceBEModel.createKey("ResilienceSuppliersArchive", {
                    SAPID: oResilienceSupplierKey.SAPID,
                    lastUpdate: oResilienceSupplierKey.lastUpdate,
                    isLast: true
                });

                // 1. Recupera il record completo dal backend
                oResilienceBEModel.read("/" + sObjectPath, {
                    success: function (oCompleteRecord) {
                        // Ora oCompleteRecord contiene il record completo.
                        // 2. Rimuovi il record esistente
                        oResilienceBEModel.remove("/" + sObjectPath, {
                            success: function (oData, oHeader) {
                                if (SessionExpiredManager.checkHeader(oHeader)) {
                                    // 3. Prepara il nuovo record copiando i dati completi e impostando isLast a false
                                    var oNewRecord = Object.assign({}, oCompleteRecord, {
                                        isLast: false,
                                    });

                                    // 4. Inserisci il nuovo record
                                    oResilienceBEModel.create("/ResilienceSuppliersArchive", oNewRecord, {
                                        success: function (oData2, oHeader2) {
                                            if (SessionExpiredManager.checkHeader(oHeader2)) {
                                                resolve(oData2);
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

        _setActionResilienceSuppliersArchive: function (sActionName, oQueryParams, oBody) {
            if (!ModelManager) {
                ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
            }
            return new Promise(function (resolve, reject) {
                ModelManager.getPromiseForModel("User").then(function () {
                    var oComponent = this.getComponent();
                    var oCSRFTokenModel = oComponent.getModel("CSRFToken");
                    var sToken = oCSRFTokenModel.getProperty("/token");

                    var sUrl = "/suppliers_be/v2/resilience/updateAndInsert";

                    jQuery.ajax({
                        url: sUrl,
                        method: "POST",
                        data: JSON.stringify({
                            // Il BE si aspetta un oggetto con le proprietà oldKey e newRecord
                            oldKey: oQueryParams.oldKey, // es: { SAPID: "..."}
                            newRecord: oBody            // l'intero nuovo record
                        }),
                        contentType: "application/json; charset=utf-8",
                        headers: {
                            'X-CSRF-Token': sToken
                        },
                        async: true,
                        success: function (oDataResponse, oHeader) {
                            if (SessionExpiredManager.checkHeader(oHeader)) {
                                resolve(oDataResponse);
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
            }.bind(this));
        },


        _setEntryCollectionResilienceSuppliersArchive: function (oQueryParams, oManualSupplierQualifications) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oQualificationBEModel = oComponent.getModel("resiliencebe");
                oQualificationBEModel.sDefaultUpdateMethod = "POST";

                oQualificationBEModel.create("/ResilienceSuppliersArchive", oManualSupplierQualifications, {
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

        _setEntryCollectionSaveSuppliersFromS4: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");

                $.ajax({
                    type: "POST",
                    url: "/suppliers_be/v2/resilience/saveSuppliersFromS4",
                    data: JSON.stringify(oBody),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
                        }
                    },
                    error: function (oError) {
                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject(oError);
                    }
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
                    oParameters.error(error);
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
        },

        subscribeToAction: function () {
            Core.getEventBus().subscribe("setActionResilienceSuppliersArchive", function (channel, event, oParameters) {
                // Estrai anche il nome dell'azione
                var sActionName = oParameters.actionName;
                var oQueryParams = oParameters.parameters;
                var oBody = oParameters.body;
                this._setActionResilienceSuppliersArchive(sActionName, oQueryParams, oBody).then(function () {
                    oParameters.resolve();
                }.bind(this)).catch(function () {
                    oParameters.error();
                }.bind(this));
            }.bind(this));
        },

    };

    BaseManager.extend(ResilienceCockpitManager);

    return ResilienceCockpitManager;
});