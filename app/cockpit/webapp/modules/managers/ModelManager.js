/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/CSRFTokenManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "com/buyerui/buyerui/modules/managers/AribaSoapManager",
    "com/buyerui/buyerui/modules/managers/AribaRestManager",
    "com/buyerui/buyerui/modules/managers/UserManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/InfoProviderManager",
    "com/buyerui/buyerui/modules/managers/DocumentManagementManager",
    "com/buyerui/buyerui/modules/managers/ResilienceCockpitManager",
    "com/buyerui/buyerui/modules/managers/ConfigurationManager",
    "com/buyerui/buyerui/modules/managers/SupplierManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/resource/ResourceModel",
    "sap/ui/core/Core",
    "sap/base/Log"
], function (BaseManager, CSRFTokenManager, ErrorManager, AribaSoapManager, AribaRestManager,
    UserManager, SessionExpiredManager, InfoProviderManager, DocumentManagementManager, ResilienceCockpitManager, ConfigurationManager, SupplierManager,
    JSONModel, ResourceModel, Core, Log) {
    "use strict";

    var ModelManager = {

        /* =========================================================== */
        /* private functions                                           */
        /* =========================================================== */
        _createModelInizializedEvents: function () {
            var oComponent = this.getComponent();
            var aModelNames = ["userAPI"];

            var oEventBus = Core.getEventBus();
            aModelNames.forEach(function (sModelName) {
                oComponent.getModel(sModelName).attachRequestCompleted(function () {
                    oEventBus.publish(sModelName + "ModelInizialized");
                });
            });
        },

        _getPromiseForModel: function (sModelName) {
            var oComponent = this.getComponent();
            return new Promise(function (resolve) {
                var oModel = oComponent.getModel(sModelName);
                var oModelData = null;
                var sModelType = "";

                if (oModel !== undefined) {
                    sModelType = oModel.getMetadata()._sClassName;
                    if (sModelType === "sap.ui.model.resource.ResourceModel") { //getData is no defined on ResourceModel
                        oModelData = oModel.getResourceBundle();
                    } else {
                        oModelData = oModel.getData();
                    }
                }

                if (sModelType === "sap.ui.model.odata.v2.ODataModel") {
                    oModel.metadataLoaded().then(function (mParams) {
                        resolve();
                    });
                    return;
                }

                if (oModelData !== null && Object.keys(oModelData).length >= 0) {
                    resolve();
                } else {
                    Core.getEventBus().subscribe(sModelName + "ModelInizialized", function () {
                        resolve();
                    });
                }
            });
        },

        _getPromiseForModels: function (aModelNames) {
            var aModelPromises = [];
            aModelNames.forEach(function (sModelName) {
                aModelPromises.push(this.getPromiseForModel(sModelName));
            }.bind(this));

            var oModelPromises = Promise.all(aModelPromises);
            oModelPromises.catch(function (oError) {
                Log.error("ModelManager: Error: " + oError.toString());
            });
            return oModelPromises.then(function (values) {
                return new Promise(function (resolve) {
                    resolve();
                });
            });
        },

        _prepareNavigationModel: function () {
            var oComponent = this.getComponent();
            var oNavigationModel = new JSONModel({
                "RouterHistory": [],
                "RouteStepBack": false,
                "CurrentRoute": ""
            });
            oComponent.setModel(oNavigationModel, "Navigation");
            sap.ui.getCore().getEventBus().publish("NavigationModelInizialized");
        },

        /* =========================================================== */
        /* public functions                                           */
        /* =========================================================== */

        getPromiseForModel: function (sModelName) {
            if (typeof sModelName === "string") {
                return this._getPromiseForModel(sModelName);
            }

            if (Array.isArray(sModelName)) {
                return this._getPromiseForModels(sModelName);
            } else {
                Log.error("ModelManager: Error: unsupported input");
                return null;
            }
        },

		_prepareUserModel: function () {
			if (!UserManager) {
				UserManager = sap.ui.require("com/buyerui/buyerui/modules/managers/UserManager")
			}
			UserManager.retrieveUserData()
				.then(function (oUserData) {
					var oComponent = this.getComponent();
					var oUserModel = new JSONModel(oUserData);
					oComponent.setModel(oUserModel, "User");
					sap.ui.getCore().getEventBus().publish("UserModelInizialized");
				}.bind(this)).catch(function () {
					var oComponent = this.getComponent();
					var oUserModel = new JSONModel({});
					oComponent.setModel(oUserModel, "User");
					sap.ui.getCore().getEventBus().publish("UserModelInizialized");
				}.bind(this));
		},

        _prepareApplicationsModel: function () {
            var oComponent = this.getComponent();
            var oApplicationsModel = new JSONModel({
                gesub: "gesub.",
                sourcing: "sourcing.",
                digitalsign: "digitalsign.",
                vendormanagement: "vendormanagement.",
                contractsorder: "contractsorder.",
                configuration: "configuration.",
                cumanagement: "cumanagement."
            });
            oComponent.setModel(oApplicationsModel, "Applications");
            sap.ui.getCore().getEventBus().publish("ApplicationsModelInizialized");
        },

        _prepareLanguageModel: function () {
            var oComponent = this.getComponent();
            var oNavigationModel = new JSONModel({
                "languageSelected": "en"
            });
            oComponent.setModel(oNavigationModel, "Language");
            sap.ui.getCore().getEventBus().publish("LanguageModelInizialized");
        },

        _prepareI18nModel: function () {
            var oComponent = this.getComponent();
            var oLangModel = oComponent.getModel("Language");
            return new Promise(function (resolve) {
                var sCurrentBrowserLanguage = navigator.language || navigator.userLanguage;
                if (!sCurrentBrowserLanguage) {
                    sCurrentBrowserLanguage = oLangModel.getProperty("/languageSelected");
                } else {
                    var aCurrentBrowserLanguage = sCurrentBrowserLanguage.split("-");
                    var sLanguage = aCurrentBrowserLanguage[0];
                }
                var resourceModel = new ResourceModel({
                    bundleName: "com.buyerui.buyerui.i18n.i18n",
                    bundleLocale: sLanguage + "_" + sLanguage.toUpperCase()
                });
                oLangModel.setProperty("/languageSelected", sLanguage);
                oComponent.setModel(resourceModel, "i18n");
                sap.ui.getCore().getEventBus().publish("i18nModelInizialized");
                resolve();
            }.bind(this));
        },

        _fetchTokenForApplication: function () {
            CSRFTokenManager.fetchCSRFToken();
        },

        _prepareSendEmailConfigModel: function () {
            var oComponent = this.getComponent();
            var oConfigData = new JSONModel();
            oConfigData.loadData("/buyerui/model/json/SendEmailConfig.json");
            oConfigData.attachRequestCompleted(function () {
                var aSteps = oConfigData.getProperty("/Steps");
                var oConfigModel = new JSONModel(aSteps);
                oConfigModel.setDefaultBindingMode(sap.ui.model.BindingMode.OneWay);
                oComponent.setModel(oConfigModel, "SendEmailConfig");
                sap.ui.getCore().getEventBus().publish("SendEmailConfigModelInizialized");
            });
        },

        initApplicationsModel: function () {
            if (!ErrorManager) {
                ErrorManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ErrorManager")
            }
            ErrorManager.registerBackendServices();
            this._prepareSendEmailConfigModel();
            this._fetchTokenForApplication();
            this._prepareNavigationModel();
            this._prepareUserModel();
            this._prepareApplicationsModel();

            if (!SessionExpiredManager) {
                SessionExpiredManager = sap.ui.require("com/buyerui/buyerui/modules/managers/SessionExpiredManager")
            }
            if (!AribaSoapManager) {
                AribaSoapManager = sap.ui.require("com/buyerui/buyerui/modules/managers/AribaSoapManager")
            }
            if (!AribaRestManager) {
                AribaRestManager = sap.ui.require("com/buyerui/buyerui/modules/managers/AribaRestManager")
            }
            if (!InfoProviderManager) {
                InfoProviderManager = sap.ui.require("com/buyerui/buyerui/modules/managers/InfoProviderManager")
            }
            if (!DocumentManagementManager) {
                DocumentManagementManager = sap.ui.require("com/buyerui/buyerui/modules/managers/DocumentManagementManager")
            }
            if (!ResilienceCockpitManager) {
                ResilienceCockpitManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ResilienceCockpitManager")
            }
            if (!SupplierManager) {
                SupplierManager = sap.ui.require("com/buyerui/buyerui/modules/managers/SupplierManager")
            }
            if (!ConfigurationManager) {
                ConfigurationManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ConfigurationManager")
            }
            SessionExpiredManager.ajaxUnauthorized();

            AribaSoapManager.subscribeToEventImport();
            AribaSoapManager.subscribeToDocumentImport();
            ["Project", "EntityType", "SuppliersCheck", "Supplier", "Attachments", "TeamRotationMembers", "Tasks",
                "BusinessPartnerMasterData", "Approvers", "Teams", "TeamMembers", "AribaHistory", "TeamRotation", "ValidatorsTeam"
            ].map(function (sModelName) {
                AribaRestManager.subscribeToModelRequest(sModelName);
            }.bind(this));

            ["AribaHistory", "MemberScore"].map(function (sModelName) {
                AribaRestManager.subscribeToSetEntry(sModelName);
            });

            ["WriteQuestionnary", "SupplierPatch", "TeamRotation", "TeamMembers"].map(function (sModelName) {
                AribaRestManager.subscribeToUpdateEntry(sModelName);
            });
            AribaRestManager.subscribeToAction();

            ["IPSuppliers", "ESGSuppliers", "ActivateIP","ActivateIPESG","ActivateIPSynesgy", "InfoProviderMasterData",
                "DocumentDownload", "DocumentDownloadESG", "DocumentDownloadSynesgy", "SupplierRotationHistory", "CategoryMasterData","SupplierQualifications","MotivationMasterData",
                "SupplierUpdateFromBccResults", "ServiceList"
            ].forEach(function (sModelName) {
                InfoProviderManager.subscribeToModelRequest(sModelName);
            }.bind(this));
            ["IPSuppliers","CategoryMasterData","SupplierRotationHistory", "SupplierUpdateFromBccResults"].forEach(function (sModelName) {
                InfoProviderManager.subscribeToUpdateEntry(sModelName);
            }.bind(this));
            ["RegisterSupplierFile","ManualSupplierQualifications","SupplierForQualification", "SupplierUpdateFromBccResults", "IPSuppliers"].forEach(function (sModelName) {
                InfoProviderManager.subscribeToSetEntry(sModelName);
            }.bind(this));


            ["getDocumentsBySuppliers", "Document", "DocNote", "MaintenanceException"].forEach(function (sModelName) {
                DocumentManagementManager.subscribeToModelRequest(sModelName);
            }.bind(this));

            ["Document", "DocNote"].forEach(function(sModelName){
            DocumentManagementManager.subscribeToUpdateEntry(sModelName);
            }.bind(this));

           ["ResilienceSuppliers", "ResilienceSuppliersArchive","SuppliersFromS4","CalculateResilience","ResilienceSuppliersInsertData",
                "DocumentDownloadResilience", "SupplierRotationHistory", "CategoryMasterData","SupplierQualifications","MotivationMasterData"
            ].forEach(function (sModelName) {
                ResilienceCockpitManager.subscribeToModelRequest(sModelName);
            }.bind(this));
            ["ResilienceSuppliers","SuppliersFromS4","ResilienceSuppliersArchive","CategoryMasterData","SupplierRotationHistory"].forEach(function (sModelName) {
                ResilienceCockpitManager.subscribeToUpdateEntry(sModelName);
            }.bind(this));
            ["RegisterSupplierFile","SuppliersFromS4","ResilienceSuppliersArchive","ManualSupplierQualifications","SupplierForQualification","SaveSuppliersFromS4","CalculateResilience"].forEach(function (sModelName) {
                ResilienceCockpitManager.subscribeToSetEntry(sModelName);
            }.bind(this));

            ResilienceCockpitManager.subscribeToAction();
            
            ["SupplierRequest","Suppliers", "SupplierCertificates"].forEach(function (sModelName) {
                SupplierManager.subscribeToModelRequest(sModelName);
            }.bind(this));

            ["AttachmentsWithManagerSupplier", "ReadAttachmentWithManagerSupplier"].forEach(function (sModelName) {
                SupplierManager.subscribeToSetEntry(sModelName);
            }.bind(this));

            ["SupplierRequest"].forEach(function (sModelName) {
                SupplierManager.subscribeToUpdateEntry(sModelName);
            }.bind(this));

            ["Configurations", "EmailTemplates", "TemplatePlaceholders",
                "Template", "ConfigurationMembers", "ConfigurationTextsMasterData", "ConfigurableEmailTextsLanguages",
                "ConfigurationParametersMasterData", "ConfigurableDocumentsLanguages",
                "DocumentTypeMasterData", "DocumentTemplate", "ApplyWatermark", "Sections"
            ].map(function (sModelName) {
                ConfigurationManager.subscribeToConfigurationsService(sModelName);
            });

            ["ConfigurationText", "ConfigurationParameters", "DocumentTemplate"].map(function (sModelName) {
                ConfigurationManager.subscribeToSetEntry(sModelName);
            });

        }

    };

    BaseManager.extend(ModelManager);
    ModelManager.onInit(function () {
        ModelManager._prepareLanguageModel();
        ModelManager._prepareI18nModel().then(function () {
            ModelManager.initApplicationsModel();
        }.bind(this));
    });

    return ModelManager;
});