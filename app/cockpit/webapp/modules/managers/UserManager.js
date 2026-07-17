sap.ui.define([
	"com/buyerui/buyerui/modules/managers/BaseManager",
	"com/buyerui/buyerui/modules/managers/SessionExpiredManager",
	"com/buyerui/buyerui/modules/managers/ErrorManager",
], function (BaseManager, SessionExpiredManager, ErrorManager) {
	"use strict";

	var UserManager = {

		retrieveUserData: function () {
			return new Promise(function (fnResolve, fnError) {
				$.ajax({
					url: "/integrationProject_user/userinfo",
					type: "GET",
					async: true,
					success: function (oUserData, oHeader) {
						this._retrieveUserRoles(oUserData)
							.then(function (oUserWithRole) {
								fnResolve(oUserWithRole);
							}.bind(this))
							.catch(function (oError) {
								fnError(oError);
							}.bind(this));
					}.bind(this),
					error: function (oError) {
						//ErrorManager.showServiceError(ErrorManager.USER_SERVICE_ERROR, oError);
						fnError(oError);
					}.bind(this)
				});
			}.bind(this));
		},

		_retrieveUserRoles: function (oUserInfoData) {
			return new Promise(function (resolve, reject) {
				var sUserId = oUserInfoData.user_id;
				$.ajax({
					url: "/integrationProject_user/Users/" + sUserId,
					type: "GET",
					async: true,
					success: function (aUserData, oHeader) {
						if (SessionExpiredManager.checkHeader(oHeader)) {
							var oRoles = {};
							var aScopeRoles = aUserData.groups.filter(function (oRole) {
								return oRole.display.toString().match(/Ariba-FE-Buyer-BuyerUI[^\.]+\.(.*)/);
							});
							if (aScopeRoles.length === 0) reject("No roles defined to access the app");
							aScopeRoles.map(function (oRole) {
								oRoles[oRole.display.toString().match(/Ariba-FE-Buyer-BuyerUI[^\.]+\.(.*)/)[1]] = true;
							});
							oUserInfoData.roles = oRoles;
							resolve(oUserInfoData);
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

	};

	BaseManager.extend(UserManager);

	return UserManager;
});