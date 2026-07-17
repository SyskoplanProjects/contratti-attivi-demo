/* eslint-disable sap-no-element-creation */
sap.ui.define([
    "com/buyerui/buyerui/modules/managers/BaseManager",
    "com/buyerui/buyerui/modules/managers/SessionExpiredManager",
    "com/buyerui/buyerui/modules/managers/ErrorManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core"
], function (BaseManager, SessionExpiredManager, ErrorManager, JSONModel, Core) {
    "use strict";

    var MailManager = {

        /* =========================================================== */
        /* private functions                                           */
        /* =========================================================== */

        _setEntryCollectionSendMail: function (oQueryParams, oMail) {
            return new Promise(function (resolve, reject) {
                if (!!oMail?.mail?.sender) {
                    delete oMail.mail.sender
                }
                this._sendMail(oMail).then(function (oData) {
                    resolve(oData);
                }.bind(this)).catch(function () {
                    reject();
                }.bind(this));
            }.bind(this));
        },

        _sendMail: function (oMail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                oMail.isHTML = oMail.isHTML || false;
                $.ajax({
                    type: "POST",
                    url: "/mailService/v2/mail/sendMail",
                    data: JSON.stringify(oMail),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    success: function (oData) {
                        resolve(oData.d);
                    },
                    error: function (oError) {

                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }
                });
            }.bind(this));

        },

        _setEntryCollectionSendPECMail: function (oQueryParams, oMail) {
            return new Promise(function (resolve, reject) {
                this._sendPECMail(oMail).then(function (oData) {
                    resolve(oData);
                }.bind(this)).catch(function () {
                    reject();
                }.bind(this));
            }.bind(this));
        },

        _sendPECMail: function (oMail) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oCSFRTokenModel = oComponent.getModel("CSRFToken");
                var sToken = oCSFRTokenModel.getProperty("/token");
                $.ajax({
                    type: "POST",
                    url: "/mailService/v2/mail/sendPECMail",
                    data: JSON.stringify(oMail),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                    headers: {
                        'X-CSRF-Token': sToken
                    },
                    success: function (oData) {
                        resolve(oData.d);
                    },
                    error: function (oError) {

                        ErrorManager.showServiceRestError(oError, {
                            title: "Generic.error.title",
                            message: "Generic.error.body"
                        });
                        reject();
                    }
                });
            }.bind(this));

        },

        _prepareModelHistory: function (oQueryParams) {
            return new Promise(function (resolve, reject) {
                var oComponent = this.getComponent();
                var oMailBeModel = oComponent.getModel("mailHistoryBe");
                var aFilters = oQueryParams && oQueryParams.filters ? oQueryParams.filters : [];
                oMailBeModel.sequentialRead("/History", {
                    filters: aFilters,
                    success: function (oData, oHeader) {
                        if (SessionExpiredManager.checkHeader(oHeader)) {
                            var oJSONModel = new JSONModel(oData.results);
                            var iLengthModel = Math.max(oData.results.length, 100);
                            oJSONModel.setSizeLimit(iLengthModel);
                            oComponent.setModel(oJSONModel, "History");
                            sap.ui.getCore().getEventBus().publish("HistoryModelInizialized");
                            resolve(oData.results);
                        }
                    }.bind(this),
                    error: function (oError) {
                        if (SessionExpiredManager.checkHeader(oError)) {
                            oComponent.setModel(new JSONModel({}), "History");
                            sap.ui.getCore().getEventBus().publish("HistoryModelInizialized");
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

        /* =========================================================== */
        /* public functions                                           */
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

    BaseManager.extend(MailManager);

    return MailManager;
});