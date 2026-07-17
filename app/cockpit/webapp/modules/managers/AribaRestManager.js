/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/ModelManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseManager, ModelManager, SessionExpiredManager,
    ErrorManager, JSONModel, Core, Filter, FilterOperator) {
    "use strict";

    var nAttachedNumber = 0;

    var AribaRestManager = {

        _prepareModelProject: function (oQueryParams) {
            if (!ModelManager) {
                ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
            }
            oQueryParams = oQueryParams ? oQueryParams : {};
            return new Promise(function (resolve, reject) {
                ModelManager.getPromiseForModel("User").then(function () {
                    var oComponent = this.getComponent();
                    var oUserModel = oComponent.getModel("User");
                    var sUserEmail = oUserModel.getProperty("/email");
                    jQuery.ajax({
                        url: "/ariba_rest_external_approval/pendingApprovables",
                        method: "GET",
                        async: true,
                        success: function (aPendingApprovables, oHeader) {
                            if (SessionExpiredManager.checkHeader(oHeader)) {
                                if (aPendingApprovables && Array.isArray(aPendingApprovables) && aPendingApprovables.length > 0) {
                                    nAttachedNumber = 0;
                                    var aEntityType = [];
                                    if (oQueryParams && !oQueryParams.exludeWorkSpace) {
                                        aEntityType.push({
                                            entityType: "Workspace",
                                            field: "workspaceId"
                                        });
                                    }
                                    //apply imported filter if exists
                                    if (oQueryParams && oQueryParams.tasksFilter) {
                                        aPendingApprovables = aPendingApprovables.filter(oQueryParams.tasksFilter.bind(this), oQueryParams);
                                    } else {
                                        if (oQueryParams && oQueryParams.description) {
                                            aPendingApprovables = aPendingApprovables.filter(function (oProject) {
                                                return oProject.description.toLowerCase() === oQueryParams.description.toLowerCase();
                                            });
                                        }
                                    }
                                    //default filter
                                    aPendingApprovables = aPendingApprovables.filter(function (oProject) {
                                        return oProject.email === sUserEmail;
                                    });
                                    if (aPendingApprovables.length > 0) {
                                        /*var aPromises = aPendingApprovables.map(function (oProject) {
                                            return this._prepareModelAribaHistory({
                                                filters: [new Filter("id", FilterOperator.EQ, oProject.uniqueName)]
                                            });
                                        }.bind(this));
                                        Promise.all(aPromises)
                                            .then(function (aResults) {
                                                aResults.map(function (oHistoryLog, i) {
                                                    aPendingApprovables[i].TaskHistory = oHistoryLog;
                                                }.bind(this));*/
                                                aPendingApprovables.map(function (oProject, i) {
                                                    this._prepareModelEntityType("Task", oProject.uniqueName, resolve, aPendingApprovables, i,
                                                        aEntityType.length > 0, aEntityType,
                                                        oQueryParams.urlParams);
                                                    return oProject;
                                                }.bind(this));
                                            /*}.bind(this))
                                            .catch(function (oError) {
                                                ErrorManager.showServiceRestError(oError, {
                                                    title: "Generic.error.title",
                                                    message: "Generic.error.body"
                                                });
                                                this._publishEmptyModel(reject);
                                            }.bind(this));*/
                                    } else {
                                        this._publishEmptyModel(resolve);
                                    }
                                } else {
                                    this._publishEmptyModel(resolve);
                                }
                            }
                        }.bind(this),
                        error: function (oError) {

                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            this._publishEmptyModel(reject);
                        }.bind(this)
                    });
                }.bind(this));
            }.bind(this));
        },

        _prepareModelTasks: function (oQueryParams) {
			return new Promise(function (resolve, reject) {
				var oComponent = this.getComponent();
				var oMiddlewareModel = oComponent.getModel("aribaBe");
				var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
				oMiddlewareModel.read("/Tasks", {
					filters: aFilters,
					success: function (oData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							var oJSONModel = new JSONModel(oData.results);
							var iLengthModel = Math.max(oData.results.length, 100);
							oJSONModel.setSizeLimit(iLengthModel);
							oComponent.setModel(oJSONModel, "Tasks");
							sap.ui.getCore().getEventBus().publish("TasksModelInizialized");
							resolve(oData.results);
						}
					}.bind(this),
					error: function (oError) {
						if (SessionExpiredManager.checkHeader(oError)) {
							oComponent.setModel(new JSONModel({}), "Tasks");
							sap.ui.getCore().getEventBus().publish("TasksModelInizialized");
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

        _publishEmptyModel: function (fnResolve) {
            var oComponent = this.getComponent();
            oComponent.setModel(new JSONModel([]), "Project");
            sap.ui.getCore().getEventBus().publish("ProjectModelInizialized");
            fnResolve();
        },

        _setModelProject: function (sEntityType, oData, fnResolve, aDataToAttach, iCurrentIndex, bAttachMore, aEntityType) {
            aDataToAttach[iCurrentIndex][sEntityType] = oData;
            if (!bAttachMore) {
                var nCheckAllAttached = aEntityType && aEntityType.length > 0 ? aEntityType.length : 1;
                nAttachedNumber++;
                if (nAttachedNumber === (aDataToAttach.length * nCheckAllAttached)) {
                    var oComponent = this.getComponent();
                    var oJSONModel = new JSONModel(aDataToAttach);
                    var iLengthModel = Math.max(aDataToAttach.length, 100);
                    oJSONModel.setSizeLimit(iLengthModel);
                    oComponent.setModel(oJSONModel, "Project");
                    sap.ui.getCore().getEventBus().publish("ProjectModelInizialized");
                    fnResolve(aDataToAttach);
                }
            } else {
                aEntityType.map(function (oEntityType) {
                    this._prepareModelEntityType(oEntityType.entityType, aDataToAttach[iCurrentIndex][sEntityType][oEntityType.field],
                        fnResolve, aDataToAttach, iCurrentIndex, false, aEntityType);
                }.bind(this));
            }
        },

        _prepareModelEntityType: function (entityType, sEntityID, fnResolve, aDataToAttach, iCurrentIndex, bAttachMore, aEntityType, urlParams) {
            if (!ModelManager) {
                ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
            }
            return new Promise(function (resolve, reject) {
                ModelManager.getPromiseForModel("User").then(function () {
                    var sEntityType = "";
                    if (typeof entityType === "object") {
                        sEntityID = entityType.entityID;
                        sEntityType = entityType.entityType;
                    } else if (typeof entityType === "string") {
                        sEntityType = entityType;
                    }
                    var sURL = "/ariba_rest_external_approval/" + sEntityType + "/" + sEntityID;
                    if (urlParams) {
                        sURL += "?" + urlParams;
                    }
                    jQuery.ajax({
                        url: sURL,
                        method: "GET",
                        async: true,
                        success: function (oData, oHeader) {
                            if (SessionExpiredManager.checkHeader(oHeader)) {
                                if (!fnResolve) resolve(oData);
                                else this._setModelProject(sEntityType, oData, fnResolve, aDataToAttach, iCurrentIndex, bAttachMore, aEntityType);
                            }
                        }.bind(this),
                        error: function (oError) {

                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject();
                        }.bind(this)
                    });
                }.bind(this));
            }.bind(this));
        },

        _prepareModelAttachments: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sEntityID = oQueryParams.entityID;
                var sEntityType = oQueryParams.entityType;
                jQuery.ajax({
                    url: "/ariba_rest_external_approval/" + sEntityType + "/" + sEntityID,
                    method: "GET",
                    xhrFields: {
                        responseType: 'blob',
                    },
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            this._readBase64FromBlob(oData, resolve);
                        }
                    }.bind(this),
                    error: function (oError) {

                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }.bind(this)
                });
            }.bind(this));
        },

        _readBase64FromBlob: function (blob, fnCallback) {
            var oFileReader = new FileReader();
            oFileReader.readAsDataURL(blob);
            oFileReader.onloadend = function () {
                var sBase64Data = oFileReader.result;
                fnCallback(sBase64Data.split(",")[1]);
            };
        },

        _prepareModelSuppliersCheck: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierModel = oComponent.getModel("suppliersbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierModel.sequentialRead("/Suppliers", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "SuppliersCheck");
                            sap.ui.getCore().getEventBus().publish("SuppliersCheckModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "Suppliers");
                            sap.ui.getCore().getEventBus().publish("SuppliersCheckModelInizialized");
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

        _prepareModelBusinessPartnerMasterData: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierModel = oComponent.getModel("suppliersbe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oSupplierModel.sequentialRead("/BusinessPartnerMasterData", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "BusinessPartnerMasterData");
                            sap.ui.getCore().getEventBus().publish("BusinessPartnerMasterDataModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "BusinessPartnerMasterData");
                            sap.ui.getCore().getEventBus().publish("BusinessPartnerMasterDataModelInizialized");
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

        _setAction: function (oQueryParams, oBody) {
            if (!ModelManager) {
                ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
            }
            return new Promise(function (resolve, reject) {
                ModelManager.getPromiseForModel("User").then(function () {
                    var oComponent = this.getComponent();
                    var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                    var sToken = oCSFRTokenModel.getProperty("/token");
                    jQuery.ajax({
                        url: "/ariba_rest_external_approval/action",
                        method: "POST",
                        data: JSON.stringify(oBody),
                        contentType: "application/json; charset=utf-8",
                        headers: {
                            'X-CSRF-Token': sToken
                        },
                        async: true,
                        success: function (oDataResponse, oHeader) {
                            if (SessionExpiredManager.checkHeader(oHeader)) {
                                resolve();
                            }
                        }.bind(this),
                        error: function (oError) {
                            ErrorManager.showServiceRestError(oError, {
                                title: "Generic.error.title",
                                message: "Generic.error.body"
                            });
                            reject();
                        }.bind(this)
                    });
                }.bind(this));
            }.bind(this));
        },

        _prepareModelApprovers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                if (!ModelManager) {
                    ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
                }
                ModelManager.getPromiseForModel(["gesub"])
                    .then(function () {
                        var oComponent = this.getComponent();
                        var oGesubModel = oComponent.getModel("gesub");
                        var sApproverGroupName = oGesubModel.getProperty("/gesub.aribaapprovergroup.name/value");
                        jQuery.ajax({
                            url: "/ariba_rest_external_approval/usergroups/" + sApproverGroupName + "/members",
                            method: "GET",
                            async: true,
                            success: function (oData, oHeader) {
                                if (SessionExpiredManager.checkHeader(oHeader)) {
                                    var oJSONModel = new JSONModel(oData);
                                    var iLengthModel = Math.max(oData.length, 100);
                                    oJSONModel.setSizeLimit(iLengthModel);
                                    oComponent.setModel(oJSONModel, "Approvers");
                                    sap.ui.getCore().getEventBus().publish("ApproversModelInizialized");
                                    resolve(oData);
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

        _prepareModelTeamRotationMembers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                if (!ModelManager) {
                    ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
                }
                ModelManager.getPromiseForModel(["teamrotation"])
                    .then(function () {
                        var oComponent = this.getComponent();
                        var oGesubModel = oComponent.getModel("teamrotation");
                        var sApproverGroupName = oGesubModel.getProperty("/teamrotation.aribarotationgroup.name/value");
                        jQuery.ajax({
                            url: "/ariba_rest_external_approval/usergroups/" + sApproverGroupName + "/members",
                            method: "GET",
                            async: true,
                            success: function (oData, oHeader) {
                                if (SessionExpiredManager.checkHeader(oHeader)) {
                                    var oJSONModel = new JSONModel(oData);
                                    var iLengthModel = Math.max(oData.length, 100);
                                    oJSONModel.setSizeLimit(iLengthModel);
                                    oComponent.setModel(oJSONModel, "TeamRotationMembers");
                                    sap.ui.getCore().getEventBus().publish("TeamRotationMembersModelInizialized");
                                    resolve(oData);
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

        _prepareModelValidatorsTeam: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                if (!ModelManager) {
                    ModelManager = sap.ui.require("com/buyerui/buyerui/modules/managers/ModelManager");
                }
                ModelManager.getPromiseForModel(["gesub"])
                    .then(function () {
                        var oComponent = this.getComponent();
                        var oGesubModel = oComponent.getModel("gesub");
                        var sValidatorTeam = oGesubModel.getProperty("/gesub.aribavalidatorgroup.name/value");
                        jQuery.ajax({
                            url: "/ariba_rest_external_approval/usergroups/" + sValidatorTeam + "/members",
                            method: "GET",
                            async: true,
                            success: function (oData, oHeader) {
                                if (SessionExpiredManager.checkHeader(oHeader)) {
                                    var oJSONModel = new JSONModel(oData);
                                    var iLengthModel = Math.max(oData.length, 100);
                                    oJSONModel.setSizeLimit(iLengthModel);
                                    oComponent.setModel(oJSONModel, "ValidatorsTeam");
                                    sap.ui.getCore().getEventBus().publish("ValidatorsTeamModelInizialized");
                                    resolve(oData);
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

        _prepareModelTeams: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sWorkSpaceId = oQueryParams.workspaceId;
                var oComponent = this.getComponent();
                jQuery.ajax({
                    url: "/ariba_rest_sourcing_project_management/projects/" + sWorkSpaceId + "/teams",
                    method: "GET",
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oProjectTeamGroups = oData.projectTeamGroups || oData.payload || [];
                            var oJSONModel = new JSONModel(oProjectTeamGroups);
                            var iLengthModel = Math.max(oProjectTeamGroups.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "Teams");
                            sap.ui.getCore().getEventBus().publish("TeamsModelInizialized");
                            resolve(oData);
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

        _prepareModelTeamMembers: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var sWorkSpaceId = oQueryParams.workspaceId;
                var sTeamId = oQueryParams.teamId;
                var oComponent = this.getComponent();
                jQuery.ajax({
                    url: "/ariba_rest_sourcing_project_management/projects/" + sWorkSpaceId + "/teams/" + sTeamId,
                    method: "GET",
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var aData = oData.payload? oData.payload.users : oData.users;
                            aData = aData || [];
                            var oJSONModel = new JSONModel(aData);
                            var iLengthModel = Math.max(aData.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "TeamMembers");
                            sap.ui.getCore().getEventBus().publish("TeamMembersModelInizialized");
                            resolve(aData);
                        }
                    }.bind(this),
                    error: function (oError) {
                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }.bind(this)
                });
            }.bind(this));
        },

        _prepareModelAribaHistory: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oAribaHistory = oComponent.getModel("aribaHistoryBe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oAribaHistory.sequentialRead("/History", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "AribaHistory");
                            sap.ui.getCore().getEventBus().publish("AribaHistoryModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _prepareModelTeamRotation: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oAribaHistory = oComponent.getModel("aribaTeamRotationBe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oAribaHistory.sequentialRead("/TeamRotation", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oDataMember = {};
                            if (oData.results.length > 0 && !!oQueryParams) {
                                var oResult = oData.results[0];
                                oDataMember = {
                                    extractedMember: oResult.extractedMember.map(function (oExtractedMember) {
                                        return JSON.parse(oExtractedMember);
                                    }),
                                    memberNr: oResult.memberNr,
                                };
                                var oJSONModel = new JSONModel(oDataMember.extractedMember);
                                var iLengthModel = Math.max(oResult.extractedMember.length, 100);
                                oJSONModel.setSizeLimit(iLengthModel);
                                oComponent.setModel(oJSONModel, "Member");
                                sap.ui.getCore().getEventBus().publish("TeamRotationModelInizialized");
                            }
                            resolve(oDataMember);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
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

        _updateEntryCollectionTeamRotation: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierModel = oComponent.getModel("aribaTeamRotationBe");
                oSupplierModel.sDefaultUpdateMethod = "PUT";
                var sObjectPath = oSupplierModel.createKey("TeamRotation", {
                    docID: oBody.docID
                });
                oSupplierModel.update("/" + sObjectPath, oBody, {
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

        _updateEntryCollectionWriteQuestionnary: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var sUrl = oQueryParams.url;
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                jQuery.ajax({
                    url: "/ariba_rest_supplier_management/" + sUrl,
                    method: "POST",
                    data: JSON.stringify(oBody),
                    contentType: "application/json; charset=utf-8",
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
                        }
                    }.bind(this),
                    error: function (oError) {
                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }.bind(this)
                });
            }.bind(this));
        },

        _updateEntryCollectionTeamMembers: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                var sWorkSpaceId = oQueryParams.workspaceId;
                var sTeamId = oQueryParams.teamId;
                jQuery.ajax({
                    url: "/ariba_rest_sourcing_project_management/projects/" + sWorkSpaceId + "/teams/" + sTeamId + "/users",
                    method: "POST",
                    data: JSON.stringify(oBody),
                    contentType: "application/json; charset=utf-8",
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    async: true,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
                        }
                    }.bind(this),
                    error: function (oError) {
                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }.bind(this)
                });
            }.bind(this));
        },

        _setEntryCollectionAribaHistory: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oAribaHistory = oComponent.getModel("aribaHistoryBe");
                oAribaHistory.sDefaultUpdateMethod = "POST";
                var sObjectPath = "History";

                oAribaHistory.create("/" + sObjectPath, oBody, {
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

        _updateEntryCollectionSupplierPatch: function (oQueryParams, oBody) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oSupplierModel = oComponent.getModel("suppliersbe");
                oSupplierModel.sDefaultUpdateMethod = "PATCH";
                var sObjectPath = oSupplierModel.createKey("Suppliers", {
                    vatCode: oBody.vatCode,
                    taxNumber: oBody.taxNumber,
                    email: oBody.email
                });
                oSupplierModel.update("/" + sObjectPath, oBody, {
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

        _setEntryCollectionMemberScore: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                this._readMemeberScore(oQueryParams.memberEmail).then(function (oData) {
                    resolve(oData);
                }.bind(this)).catch(function () {
                    reject();
                }.bind(this));
            }.bind(this));
        },

        _readMemeberScore: function (sMemberEmail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oGesubBeModel = oComponent.getModel("aribaTeamRotationBe");
                oGesubBeModel.callFunction("/getMemberScore", {
                    method: "GET",
                    urlParameters: {
                        memberEmail: sMemberEmail,
                    },
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            resolve(oData);
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

        subscribeToModelRequest: function (sModelName) {
            Core.getEventBus().subscribe("Models" + sModelName, function (channel, event, oParameters) {
                var oQueryParams = oParameters.parameters;
                this["_prepareModel" + sModelName](oQueryParams).then(function (aResults) {
                    oParameters.resolve(aResults);
                }.bind(this)).catch(function (oError) {
                    oParameters.error(oError);
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

        subscribeToAction: function () {
            Core.getEventBus().subscribe("setAction", function (channel, event, oParameters) {
                var oQueryParams = oParameters.parameters;
                var oBody = oParameters.body;
                this._setAction(oQueryParams, oBody).then(function () {
                    oParameters.resolve();
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

        _generateUrl: function (sUrl, oQueryParams) {
            var aKeys = Object.keys(oQueryParams);
            for (var i = 0; i < aKeys.length; i++) {
                sUrl += (i === 0 ? "?" : "&") + aKeys[i] + "=" + oQueryParams[aKeys[i]];
            }
            return sUrl;
        }
    };

    BaseManager.extend(AribaRestManager);

    return AribaRestManager;
});