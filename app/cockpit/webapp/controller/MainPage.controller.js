sap.ui.define([
	"com/buyerui/buyerui/controller/BaseController",
	"com/buyerui/buyerui/controller/interfaces/EmailInterface",
], function (BaseController, EmailInterface) {
	"use strict";

	var oMainPageController = {

		// Copia locale senza i backend enterprise (User/CSRFToken/OData suppliers): niente
		// busy dialog di attesa, la sezione Contratti Attivi non ne ha bisogno.
		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("Main").attachMatched({}, this.onRouteMatched, this);
		},

		onRouteMatched: function (oEvent) {
			var oParameters = oEvent.getParameters();
			var oArguments = oParameters.arguments;
			this.addRouteToRouterHistory(oParameters.name, oArguments);
		},

		onPressSubcontractingReport: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("SubcontractingReportApp");
		},

		onPressGesub: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("GesubCockpit");
		},

		onPressContracts: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("ContractsApp");
		},

		onPressPurchaseOrders: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("PurchaseOrdersApp");
		},

		onPressContractApproval: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("RFXApprovalApp");
		},

		onPressOpenInvitations: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("OpenInvitationsApp");
		},

		onPressSuppliersRotation: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("SuppliersRotationApp");
		},

		onPressAdminGesub: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("GesubAdminCockpit");
		},

		onPressSupplierApproval: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("SupplierApprovalApp");
		},

		onPressRFXReport: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("RFXReportApp");
		},

		onPressVerifyDigitalSignCockpit: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("VerifyDigitalSignApp");
		},

		onPressInfoProvider: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("InfoProviderApp");
		},

		onPressDocumentManagement: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("DocumentManagementApp");
		},

		onPressResilienceCockpit: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("ResilienceCockpitApp");
		},

		onPressGesubKPIReport: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("GesubKPIReportApp");
		},

		onPressDigitalSign: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("DigitalSignApp");
		},

		onPressGesubExpirationTile: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("ExpirationManagementApp");
		},

		onPressInstStakeholder: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("InstStakeholderApp");
		},

		onPressSendPEC: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("SendPECApp");
		},

		onPressQualificationGrid: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("QualificationGridApp");
		},

		onPressTeamRotation: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("TeamRotationApp");
		},

		onPressConfiguration: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("ConfigurationApp");
		},

		onPressSupplierRequest: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.navTo("SupplierRequest");
		},

		onPressSendEmail: function (oEvent) {
			this._openDialogSendEmail();
		},

		// Contratti Attivi non è un componente lazy del cockpit ma un'app CAP separata
		// servita dallo stesso host: si naviga con l'URL reale, non con il router interno.
		onPressTemplateClausole: function () {
			this.openBusyDialogLoadingView();
			window.location.href = "/contratti/webapp/index.html#/clausole";
		},

		onPressContratti: function () {
			this.openBusyDialogLoadingView();
			window.location.href = "/contratti/webapp/index.html";
		},

		onPressComparator: function () {
			this.openBusyDialogLoadingView();
			window.location.href = "/comparator/webapp/index.html";
		}

	};

	EmailInterface.implement(oMainPageController);

	return BaseController.extend("com.buyerui.buyerui.controller.MainPage", oMainPageController);

});