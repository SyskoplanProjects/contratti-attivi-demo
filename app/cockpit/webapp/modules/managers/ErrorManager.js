sap.ui.define([
		"com/buyerui/buyerui/controller/interfaces/LoadingBusyDialogInterface",
		"com/buyerui/buyerui/modules/managers/BaseManager",
		"com/buyerui/buyerui/modules/managers/ModelManager",
		"com/buyerui/buyerui/modules/managers/SessionExpiredManager",
		"sap/ui/model/json/JSONModel",
		"sap/m/Button",
		"sap/m/Dialog",
		"sap/m/Text",
		"sap/m/MessageBox",
		"sap/base/Log"
	],
	function (LoadingBusyDialogInterface, BaseManager, ModelManager, SessionExpiredManager,
		JSONModel, Button, Dialog, Text, MessageBox, Log) {
		"use strict";

		var ErrorManager = {

			_bIsDialogOpened: false,

			METADATA_ERROR: "metadata",

			REQUEST_FAILED_ERROR: "request_failed",

			USER_SERVICE_ERROR: "user_service_error",

			_replaceHeaderHTMLTag: function (oHTMLString) {
				return oHTMLString.replace(/<h1>|<\/h1>/gi, "");
			},

			// Use sap.ui.require to solve dependency troubles 
			// _oLogoutManager: undefined,

			_executeOnErrorMessageBoxClose: function (sErrorType, oErrorParams) {
				var oErrorResponse = oErrorParams && oErrorParams.response ? oErrorParams.response : undefined;
				var aErrorHeaders = oErrorResponse && oErrorResponse.headers ? oErrorResponse.headers : undefined;
				var sHTTPStatusCode = oErrorResponse && oErrorResponse.statusCode ?
					oErrorResponse.statusCode : "0";
				sHTTPStatusCode = typeof sHTTPStatusCode !== "string" ?
					JSON.stringify(sHTTPStatusCode) :
					sHTTPStatusCode;

				var bIsA403Error = sHTTPStatusCode === "403";
				var bIsA503Error = sHTTPStatusCode === "503";
				var bIsAZeroError = sHTTPStatusCode === "0";
				var bIsACSRFTokenRequiredError = bIsA403Error &&
					aErrorHeaders &&
					aErrorHeaders["x-csrf-token"] === "Required";
				var bIsSessionExpired = aErrorHeaders && aErrorHeaders["com.sap.cloud.security.login"] === "login-request";
				var bIsAMetadataError = sErrorType === this.METADATA_ERROR;
				var bRequestFailedError = sErrorType === this.REQUEST_FAILED_ERROR;
				var bRefreshApp = ((bIsAZeroError || bIsACSRFTokenRequiredError) && bIsAMetadataError) ||
					(bIsACSRFTokenRequiredError && bRequestFailedError) ||
					(bIsA503Error && bRequestFailedError);

				if (bRefreshApp) {
					sap.m.URLHelper.redirect("index.html#", false);
					window.location.reload(true);
					return;
				}

				if (bIsA403Error) {
					// this._oLogoutManager = this._oLogoutManager ? this._oLogoutManager :
					// 	sap.ui.require("com/enel/waste/wastemanagement/modules/managers/LogoutManager");
					// this._oLogoutManager.onLogout();
					// return;
				}

				if (bIsSessionExpired) {
					SessionExpiredManager.showRefreshNotification();
					return;
				}

				if (bIsAMetadataError) {
					sap.m.URLHelper.redirect("index.html#", false);
					window.location.reload(true);
					return;
				}
				return;
			},

			showServiceError: function (oErrorParams, oGenericError) {
				Log.error("Error: " + oErrorParams.toString());
				LoadingBusyDialogInterface.resetBusyDialog();
				if (!this._bIsDialogOpened) {
					this._bIsDialogOpened = true;
					var oComponent = this.getComponent();
					var oI18nPromise = this.getPromiseForI18nModel();
					oI18nPromise.then(function () {
						var oResourceBundle = oComponent.getModel("i18n").getResourceBundle();

						var sHTTPStatusCode = oErrorParams && oErrorParams.statusCode ? oErrorParams.statusCode : oErrorParams.status;
						sHTTPStatusCode = typeof sHTTPStatusCode !== "string" ?
							JSON.stringify(sHTTPStatusCode) :
							sHTTPStatusCode;
						var sMessageBoxTitle = oResourceBundle.getText("connectionError.messageBoxErrorTitle");

						var b503NoMetadataError = sHTTPStatusCode === "503";
						var sMessageBoxText = sHTTPStatusCode === "0" || b503NoMetadataError ?
							oResourceBundle.getText("connectionError.checkInternetConnection") :
							oResourceBundle.getText("connectionError.remoteSystem");

						var aErrorHeaders = oErrorParams && oErrorParams.headers ? oErrorParams.headers : [];
						var bIsSessionExpired = aErrorHeaders["com.sap.cloud.security.login"] === "login-request" ||
							sHTTPStatusCode === "401";
						this._bIsDialogOpened = true;

						if (bIsSessionExpired) {
							SessionExpiredManager.showRefreshNotification();
							return;
						}

						if (oErrorParams.response) {
							var iSubStringInnerError = oErrorParams.response.responseText.search("innererror");
							var iErrorMessageLength = oErrorParams.response.responseText.length;
							var sSubStringError = oErrorParams.response.responseText.substr(iSubStringInnerError + 13, iErrorMessageLength);
							var iInnerErrorEnd = sSubStringError.search("}");
							var sSubError = oErrorParams.response.responseText.substr(iSubStringInnerError + 13, iInnerErrorEnd - 1);
						}

						sMessageBoxTitle = oResourceBundle.getText("connectionError.messageBoxErrorTitle");

						if (sMessageBoxText === "") {
							sMessageBoxText = oResourceBundle.getText("connectionError.remoteUserSystem");
						}

						var mMessageBoxOption = {
							title: sMessageBoxTitle,
							details: oErrorParams,
							actions: [MessageBox.Action.OK],
							onClose: function () {
								this._bIsDialogOpened = false;
								this._executeOnErrorMessageBoxClose(oErrorParams.statusText, oErrorParams);
							}.bind(this)
						};
						MessageBox.error(sMessageBoxText, mMessageBoxOption);
					}.bind(this));

					oI18nPromise.catch(function (oError) {
						Log.error("ErrorManager: Error: " + oError.toString());
					});
				}
			},

			_executeOnRestServiceErrorMessageBoxClose: function (oErrorParams) {
				var aErrorHeaders = oErrorParams.getAllResponseHeaders();
				var sHTTPStatusCode = oErrorParams.status.toString();
				var bIsA403Error = sHTTPStatusCode === "403";
				var bIsA503Error = sHTTPStatusCode === "503";
				var bIsAZeroError = sHTTPStatusCode === "0";
				var bIsACSRFTokenRequiredError = bIsA403Error && aErrorHeaders && aErrorHeaders.indexOf("x-csrf-token: Required") > 0;

				if (bIsACSRFTokenRequiredError || bIsA503Error || bIsAZeroError) {
					sap.m.URLHelper.redirect("index.html#", false);
					window.location.reload(true);
					return;
				}

				// if (bIsA403Error) {
				// 	this._oLogoutManager = this._oLogoutManager ? this._oLogoutManager :
				// 		sap.ui.require("com/enel/waste/wastemanagement/modules/managers/LogoutManager");
				// 	this._oLogoutManager.onLogout();
				// 	return;
				// }

				return;
			},

			showServiceRestError: function (oErrorParams, oGenericError) {
				Log.error("Error: " + oErrorParams.toString());
				LoadingBusyDialogInterface.resetBusyDialog();
				if (!this._bIsDialogOpened) {
					this._bIsDialogOpened = true;
					var oComponent = this.getComponent();
					var oI18nPromise = this.getPromiseForI18nModel();
					oI18nPromise.then(function () {
						var oResourceBundle = oComponent.getModel("i18n").getResourceBundle();
						var sHTTPStatusCode = oErrorParams.status.toString();
						var sErrorText = oErrorParams.responseText;
						var bSessionTimeOutAriba = oErrorParams.responseJSON && oErrorParams.responseJSON.fault && oErrorParams.responseJSON.fault.faultstring &&
							oErrorParams.responseJSON.fault.faultstring.search("request.header.Authorization") !== -1;
						var sErrorTranslated = "";
						if (sErrorText && sErrorText.search("TL") !== -1) {
							var sCodeErrorToTranslate = sErrorText.split(" ")[sErrorText.split(" ").length - 1];
							sErrorTranslated = oResourceBundle.getText(sCodeErrorToTranslate);
						}
						var sMessageBoxText = sErrorTranslated ? sErrorTranslated : sHTTPStatusCode === "0" || sHTTPStatusCode === "503" ?
							oResourceBundle.getText("connectionError.checkInternetConnection") :
							oResourceBundle.getText("connectionError.remoteSystem");
						var sMessageBoxTitle = oResourceBundle.getText("connectionError.messageBoxErrorTitle");
						this._bIsDialogOpened = true;

						if (sHTTPStatusCode === "401" || (sHTTPStatusCode === "500" && bSessionTimeOutAriba)) {
							SessionExpiredManager.showRefreshNotification();
							return;
						}

						var mMessageBoxOption = {
							title: sMessageBoxTitle,
							details: oErrorParams,
							actions: [MessageBox.Action.OK],
							onClose: function () {
								this._bIsDialogOpened = false;
								this._executeOnRestServiceErrorMessageBoxClose(oErrorParams);
							}.bind(this)
						};
						MessageBox.error(sMessageBoxText, mMessageBoxOption);
					}.bind(this));

					oI18nPromise.catch(function (oError) {
						Log.error("ErrorManager: Error: " + oError.toString());
					});
				}
			},

			registerBackendServices: function () {
				this._registerBackendService();
			},

			_registerBackendService: function () {
				var oComponent = this.getComponent();
				["ipbe","configurationBe", "suppliersbe", "resiliencebe"].map(function (sModelName) {
					var oModel = oComponent.getModel(sModelName);
					if (!oModel) return;

					oModel.attachEvent("metadataFailed", function (oEvent) {
						var oParams = oEvent.getParameters();
						Log.error("ErrorManager: Loading of metadata failed for " + sModelName.toUpperCase() + " service");
						this.showServiceError(this.METADATA_ERROR, oParams);
					}.bind(this));

					oModel.attachEvent("requestFailed", function (oEvent) {
						Log.error("ErrorManager: Request failed for " + sModelName.toUpperCase() + " service");
						var oParams = oEvent.getParameters();

						//Force Reload in case of 403 Forbidden. Scenarios: Missing CSRF or in case of Gateway Timeout
						if (oParams.response.statusCode === 403 || oParams.response.statusCode === 504) {
							SessionExpiredManager.showRefreshNotification();

						} else if (!oParams.response.headers["com.sap.cloud.security.login"]) {
							this.showServiceError(this.REQUEST_FAILED_ERROR, oParams);
						}
					}.bind(this));
				}.bind(this));
			}

		};

		BaseManager.extend(ErrorManager);

		return ErrorManager;
	});