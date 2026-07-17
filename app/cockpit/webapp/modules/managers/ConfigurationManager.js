/* eslint-disable */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseManager, SessionExpiredManager, ErrorManager,
    JSONModel, Core, Filter, FilterOperator) {
    "use strict";

    var ConfigurationManager = {

        _fetchTemplatePlaceholders: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = oLanguageModel.getProperty("/languageSelected");
                var sType = oQueryParams.params.type;
                var sModelName = oQueryParams.modelName;
                oConfigurationBeModel.callFunction("/templatePlaceholders", {
                    method: "GET",
                    urlParameters: {
                        type: sType,
                        language: sLanguage,
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {

                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }.bind(this)
                });
            }.bind(this));
        },

        _fetchTemplate: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = oLanguageModel.getProperty("/languageSelected");
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                var sName = oQueryParams.params.name;
                var sType = oQueryParams.params.type;
                var oParams = oQueryParams.params.params;
                var bPdf = oQueryParams.params.pdf;
                $.ajax({
                    type: "POST",
                    url: "/configuration_be/v2/configuration/downloadTemplatedFullfilled",
                    data: JSON.stringify({
                        "name": sName,
                        "type": sType,
                        "language": sLanguage,
                        "params": JSON.stringify(oParams),
                        "pdf": bPdf
                    }),
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    contentType: "application/json",
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve({
                                value: oData.d.downloadTemplatedFullfilled
                            });
                        }
                    },
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {

                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }
                });
            }.bind(this));
        },

        _fetchEmailTemplates: function (oQueryParams) {
            var sModelName = oQueryParams.modelName;
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = (oQueryParams.params && oQueryParams.params.language) || oLanguageModel.getProperty("/languageSelected");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                aFilters.push(
                    new Filter("language", FilterOperator.EQ, sLanguage)
                );
                oConfigurationBeModel.sequentialRead("/ConfigurationTextValues", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oResults = this._mapResultsEmailTemplate(oData.results);
                            var oJSONModel = new JSONModel(oResults);
                            var iLengthModel = Math.max(oResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(oResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _mapResultsEmailTemplate: function (aValues) {
            var oMappedValues = {};
            aValues.map(function (oValue) {
                var sID = oValue.ID;
                var aSplittedID = sID.split(".");
                var sLastPart = aSplittedID.splice(aSplittedID.length - 1, 1)[0];
                var sKey = aSplittedID.join(".");

                oMappedValues[sKey] = oMappedValues.hasOwnProperty(sKey) ? oMappedValues[sKey] : {};

                oMappedValues[sKey][sLastPart] = oValue.value ? oValue.value : oValue.defaultValue;
            });

            return oMappedValues;
        },

        _fetchConfigurations: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = oLanguageModel.getProperty("/languageSelected");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                aFilters.push(
                    new Filter("language", FilterOperator.EQ, "global"),
                    new Filter("language", FilterOperator.EQ, sLanguage)
                );
                oConfigurationBeModel.sequentialRead("/ConfigurationParameterValues", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = this._mapResultsConfiguration(oData.results);
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchConfigurationMembers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                oConfigurationBeModel.sequentialRead("/ConfigurationMembers", {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results; //this._mapResultsConfiguration(oData.results);
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchConfigurationTextsMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = (oQueryParams.params && oQueryParams.params.language) || oLanguageModel.getProperty("/languageSelected");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var aSorter = oQueryParams && oQueryParams.params && oQueryParams.params.sorter ? oQueryParams.params.sorter : [];
                aFilters.push(
                    new Filter("language", FilterOperator.EQ, sLanguage)
                );
                oConfigurationBeModel.sequentialRead("/ConfigurationTextsMasterData", {
                    filters: aFilters,
                    sorters: aSorter,
                    urlParameters: {
                        $expand: "placeholders/placeholder"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchConfigurationParametersMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = (oQueryParams.params && oQueryParams.params.language) || oLanguageModel.getProperty("/languageSelected");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var aSorter = oQueryParams && oQueryParams.params && oQueryParams.params.sorter ? oQueryParams.params.sorter : [];
                aFilters.push(
                    new Filter("language", FilterOperator.EQ, sLanguage)
                );
                oConfigurationBeModel.sequentialRead("/ConfigurationParametersMasterData", {
                    filters: aFilters,
                    sorters: aSorter,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchDocumentTypeMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var oLanguageModel = oComponent.getModel("Language");
                var sLanguage = (oQueryParams.params && oQueryParams.params.language) || oLanguageModel.getProperty("/languageSelected");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var aSorter = oQueryParams && oQueryParams.params && oQueryParams.params.sorter ? oQueryParams.params.sorter : [];
                aFilters.push(
                    new Filter("language", FilterOperator.EQ, sLanguage)
                );
                oConfigurationBeModel.sequentialRead("/DocumentTypeMasterData", {
                    filters: aFilters,
                    sorters: aSorter,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchDocumentTemplate: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var oURLParams = oQueryParams && oQueryParams.params && oQueryParams.params.select ? {
                    "$select": oQueryParams.params.select
                } : {};
                oConfigurationBeModel.read("/DocumentTemplate", {
                    filters: aFilters,
                    urlParameters: oURLParams,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            if (Object.keys(oURLParams).length > 0) {
                                var oJSONModel = new JSONModel(aResults);
                                var iLengthModel = Math.max(aResults.length, 100);
                                oJSONModel.setSizeLimit(iLengthModel);
                                oComponent.setModel(oJSONModel, sModelName);
                                sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            }
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _fetchConfigurableEmailTextsLanguages: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                oConfigurationBeModel.sequentialRead("/ConfigurableEmailTextsLanguages", {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchConfigurableDocumentsLanguages: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                oConfigurationBeModel.sequentialRead("/ConfigurableDocumentsLanguages", {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchConfigurationParametersMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                aFilters.push(
                    new Filter("ID", FilterOperator.EQ, oQueryParams.filters[0].oValue1)
                );
                oConfigurationBeModel.sequentialRead("/ConfigurationParametersMasterData", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _fetchSections: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sModelName = oQueryParams.modelName;
                var oComponent = this.getComponent();
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                var oConfigurationBeModel = oComponent.getModel("configurationBe");
                oConfigurationBeModel.sequentialRead("/Sections", {
                    filters: aFilters,
                    urlParameters: {
                        $expand: "fields/field,fields/field/possibleValues,fields/field/childs/possibleValues"
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aResults = oData.results;
                            var oJSONModel = new JSONModel(aResults);
                            var iLengthModel = Math.max(aResults.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
                            resolve(aResults);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), sModelName);
                            sap.ui.getCore().getEventBus().publish(sModelName + "ModelInizialized");
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

        _setEntryConfigurationText: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");

                oConfigurationBeModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oConfigurationBeModel.createKey("ConfigurationText", {
                    name_ID: oBody.name_ID,
                    name_language: oBody.name_language
                });
                oConfigurationBeModel.update("/" + sObjectPath, oBody, {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve();
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _setEntryConfigurationParameters: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");

                oConfigurationBeModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oConfigurationBeModel.createKey("ConfigurationParameters", {
                    parameter_ID: oBody.parameter_ID,
                    parameter_language: oBody.parameter_language
                });
                oConfigurationBeModel.update("/" + sObjectPath, oBody, {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve();
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _setEntryDocumentTemplate: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oConfigurationBeModel = oComponent.getModel("configurationBe");

                oConfigurationBeModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oConfigurationBeModel.createKey("DocumentTemplate", {
                    name: oBody.name,
                    documentType_ID: oBody.documentType_ID,
                    documentType_language: oBody.documentType_language
                });
                oConfigurationBeModel.update("/" + sObjectPath, oBody, {
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve();
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _fetchApplyWatermark: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                var sBase64File = oQueryParams.params.base64file;
                var sWatermark = oQueryParams.params.watermark;
                $.ajax({
                    type: "POST",
                    url: "/configuration_be/v2/configuration/applyWatermarkPDF",
                    data: JSON.stringify({
                        "base64file": sBase64File,
                        "watermark": sWatermark
                    }),
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    contentType: "application/json",
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var sResult = oData.d.value || oData.d.applyWatermarkPDF;
                            resolve({value: sResult});
                        }
                    },
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject(oError);
                        }
                    }
                });
            }.bind(this));
        },

        _mapResultsConfiguration: function (aValues) {
            var oResult = {};
            aValues.map(function (oValue) {
                oResult[oValue["ID"]] = {
                    type: oValue.type,
                    language: oValue.language,
                    description: oValue.description
                };
                if (oValue.type === "array") {
                    oResult[oValue["ID"]].value = oValue.value.length > 0 ? oValue.value : oValue.defaultValue;
                } else {
                    oResult[oValue["ID"]].value = oValue.value.length > 0 ? oValue.value[0] : oValue.defaultValue[0];
                }
            });
            return oResult;
        },

        _mapFilters: function (sUrl, aFilters) {
            var sUrlFilters = sUrl.search(/\?/) === -1 ? "?$filter=" : "$filter=";
            aFilters.map(function (oFilter, index) {
                var sAndOperator = index === 0 ? "" : " and ";
                var sFilterText = this._generateFilterFromOperator(oFilter);
                sUrlFilters += sAndOperator + sFilterText;
            }.bind(this));
            return sUrl + sUrlFilters;
        },

        _generateFilterFromOperator: function (oFilter) {
            var sFilter = "";
            switch (oFilter.operator) {
            case 'Contains':
                sFilter = "contains(" + oFilter.path + ",'" + oFilter.value + "')";
                break;
            case 'EQ':
                sFilter = oFilter.path + " eq '" + oFilter.value + "'";
                break;
                //TODO: define other cases;
            }

            return sFilter;
        },

        subscribeToConfigurationsService: function (sModelName) {
            Core.getEventBus().subscribe("Models" + sModelName, function (channel, event, oParameters) {
                this["_fetch" + sModelName](oParameters.parameters).then(function (oResponse) {
                    oParameters.resolve(oResponse);
                }.bind(this)).catch(function () {
                    oParameters.error();
                }.bind(this));
            }.bind(this));
        },

        subscribeToSetEntry: function (sModelName) {
            Core.getEventBus().subscribe("setEntry" + sModelName, function (channel, event, oParameters) {
                this["_setEntry" + sModelName](oParameters.parameters, oParameters.body).then(function (oResponse) {
                    oParameters.resolve(oResponse);
                }.bind(this)).catch(function () {
                    oParameters.error();
                }.bind(this));
            }.bind(this));
        }
    };

    BaseManager.extend(ConfigurationManager);

    return ConfigurationManager;
});