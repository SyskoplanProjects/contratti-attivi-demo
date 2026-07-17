sap.ui.define([
	"sap/m/MessageBox",
	"sap/m/Button",
	"sap/m/Dialog",
	"sap/m/Text",
	"com/buyerui/buyerui/modules/managers/BaseManager"
],
function (MessageBox, Button, Dialog, Text, BaseManager) {
	"use strict";

	var SessionExpiredManager = {

		oExpiredTimeoutDialog: undefined,

		showRefreshNotification: function (onConfirm) {
			if (!this.oExpiredTimeoutDialog) {

				var oExpiredTimeoutDialog = new Dialog({
					title: this.getLocalizedText("SessionExpiredDialog.title"),
					type: "Message",
					content: new Text({
						text: this.getLocalizedText("SessionExpiredDialog.text")
					}),
					beginButton: new Button({
						text: this.getLocalizedText("SessionExpiredDialog.ok"),
						press: function () {
							if (onConfirm)
								onConfirm();
							oExpiredTimeoutDialog.close();
						}
					}),
					afterClose: function () {
						oExpiredTimeoutDialog.destroy();
						window.location.href = "/do/logout";
					}
				});
				oExpiredTimeoutDialog.open();
				this.oExpiredTimeoutDialog = oExpiredTimeoutDialog;
			}
		},
		
		checkHeader: function (oHeader) {
			var bResult = true;
			var bSessionIsExpired = oHeader && oHeader.headers && 
				oHeader.headers["com.sap.cloud.security.login"] === "login-request";
			if (bSessionIsExpired) {
				SessionExpiredManager.showRefreshNotification();
				bResult = false;
			}
			return bResult;
		},
		
		ajaxUnauthorized: function() {
			$( document ).ajaxError(function( event, jqxhr, settings, exception ) {
			    if ( jqxhr.status === 401 ) {
					this.showRefreshNotification();
			    }
			}.bind(this));
		}
	};

	BaseManager.extend(SessionExpiredManager);

	return SessionExpiredManager;
});