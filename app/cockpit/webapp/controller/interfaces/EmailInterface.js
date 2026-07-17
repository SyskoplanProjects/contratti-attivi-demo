sap.ui.define([
	"com/buyerui/buyerui/controller/interfaces/AbstractInterface",
	"com/buyerui/buyerui/modules/managers/SessionExpiredManager",
	"com/buyerui/buyerui/modules/managers/ConfigurationManagerSendRequest",
	"com/buyerui/buyerui/modules/managers/AribaRestManager",
	"com/buyerui/buyerui/modules/managers/MailManager",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (AbstractInterface, SessionExpiredManager,ConfigurationManagerSendRequest, AribaRestManager,
	MailManager, JSONModel, Fragment, Filter, FilterOperator, MessageBox) {
	"use strict";

	var EmailInterface = {

		_openDialogSendEmail: function () {
			var oView = this.getView();
			this.openBusyDialogLoadingView();
			this._loadSuppliers()
				.then(function () {
					try {
						if (!this._oDialogSendEmail) {
							Fragment.load({
								id: oView.getId(),
								controller: this,
								name: "com.buyerui.buyerui.view.fragments.Dialogs.SendEmailDialog"
							}).then(function (oFragmentResp) {
								this._oDialogSendEmail = oFragmentResp;
								oView.addDependent(this._oDialogSendEmail);
								this._oDialogSendEmail.open();
							}.bind(this));
						} else {
							oView.addDependent(this._oDialogSendEmail);
							this._oDialogSendEmail.open();
						}
						this._createViewModel();
						this.closeBusyDialogLoadingView();
					} catch (err) {
						SessionExpiredManager.showRefreshNotification();
					}
				}.bind(this))
				.catch(function () {
					this.closeBusyDialogLoadingView();
				}.bind(this));
		},

		onPressConfirmSendEmail: async function () {
			var bCheckStep = this.checkStep("SendEmailConfig", "SendEmail");
			if (bCheckStep) {
				this.openBusyDialogLoadingView();
				var oView = this.getView();
				var oViewModel = oView.getModel("view");
				var aSelectedReceivers = oViewModel.getProperty("/selectedReceivers");
				var aAttachments = oViewModel.getProperty("/attachments");
				var sBody = oViewModel.getProperty("/body");
				var sObject = oViewModel.getProperty("/object");
				var oComponent = this.getOwnerComponent();
				var sender;
				await this._loadSender().then(
					function(){
						sender = oComponent.getModel("ConfigurationParametersMasterData").getData()[0].defaultValue[0];					
					}
				)

				var oEmail = {
					"mail": {
						"sender":sender,
						"receiver": [],
						"bccReceiver": aSelectedReceivers.filter((sMail) => {
                            return !!sMail
                        }),
						"subject": sObject,
						"body": sBody
					},
					isHTML: true
				};

				if (Array.isArray(aAttachments) && aAttachments.length > 0) {
					oEmail.mail.attachments = [];
					aAttachments.map(function (oFile) {
						oEmail.mail.attachments.push({
							"filename": oFile.nameFile,
							"content": oFile.content,
							"encoding": 'base64'
						});
					});
				}

				MailManager._sendMail(oEmail)
					.then(function () {
						this._closeDialogSendEmail();
					}.bind(this))
					.catch(function () {
						this.closeBusyDialogLoadingView();
					}.bind(this));
			}
		},

		_loadSender: async function () {
			return new Promise(function (resolve, reject) {
				var aModelRequests = [{
					modelName: "ConfigurationParametersMasterData",
					parameters: {
						filters: [new Filter("ID", FilterOperator.EQ,"suppliers.management.sender")]
					}					
				}];
				Promise.all(ConfigurationManagerSendRequest.fetchConfigurations(aModelRequests))
					.then(function () {
						resolve();
					})
					.catch(function () {
						reject();
					});
			});
		},

		onDownloadTemplate: function () {
			var oResourceBundle = this.getResourceBundle();
			var sHeader = oResourceBundle.getText("SendEmail.dialog.emailList");
			var sTemplate = sHeader + "\r\n";
			var sBase64 = btoa(sTemplate);

			var oAnchor = document.createElement("a");
			oAnchor.href = "data:text/csv;base64," + sBase64;
			oAnchor.download = "Template.csv";
			oAnchor.click();
		},

		onPressCancelSendEmail: function () {
			this._closeDialogSendEmail();
		},

		onUploadCompleteSuppliers: function (oEvent) {
			this.openBusyDialogLoadingView();
			var oSource = oEvent.getSource();
			var oDomRef = oSource.getFocusDomRef();
			var oFile = oDomRef.files[0];
			var oReader = new FileReader();
			oReader.readAsDataURL(oFile);
			oReader.onload = function () {
				var oResult = oReader.result;
				var sBase64 = oResult.split(",")[1];
				var sStringEmailList = atob(sBase64);
				var aEmailList = sStringEmailList.split("\r\n");
				aEmailList.splice(0, 1);
				var oView = this.getView();
				var oViewModel = oView.getModel("view");
				oViewModel.setProperty("/selectedReceivers", aEmailList);
				oViewModel.setProperty("/showMultiComboBox", false);

				this.closeBusyDialogLoadingView();
			}.bind(this);
		},

		onUploadCompleteAttachments: async function (oEvent) {
			this.openBusyDialogLoadingView();
			var oSource = oEvent.getSource();
			var oDomRef = oSource.getFocusDomRef();
			var aFiles = oDomRef.files;
			try {
				var aFilesMapped = await this._mapFiles(aFiles);
				var oView = this.getView();
				var oViewModel = oView.getModel("view");
				oViewModel.setProperty("/attachments", aFilesMapped);
			} catch (oError) {
				var oResourceBundle = this.getResourceBundle();
				MessageBox.show(oResourceBundle.getText("SendEmail.dialog.attachmentFailedBody"), {
					title: oResourceBundle.getText("SendEmail.dialog.attachmentFailed"),
					icon: MessageBox.Icon.ERROR,
					actions: ["Ok"],
					onClose: function (oAction) {}
				});
				oSource.clear();
			}
			this.closeBusyDialogLoadingView();
		},

		onUploadStartAttachments: function (oEvent) {
			this.openBusyDialogLoadingView();
		},

		_loadSuppliers: function () {
			return AribaRestManager._prepareModelSuppliersCheck();
		},

		_closeDialogSendEmail: function () {
			this.closeBusyDialogLoadingView();
			var oView = this.getView();
			var oAttachmentsUploader = oView.byId("idAttachmentsUploader");
			var oSupplierUploader = oView.byId("idSupplierUploader");
			oAttachmentsUploader.clear();
			oSupplierUploader.clear();
			this._oDialogSendEmail.close();
		},

		_mapFiles: async function (aFiles) {
			var aFilesMapped = [];
			for (var i = 0; i < [...aFiles].length; i++) {
				var sBase64 = await this._fileToBase64(aFiles[i]);
				aFilesMapped.push({
					nameFile: aFiles[i].name,
					content: sBase64.search(",") !== -1 ? sBase64.split(",")[1] : ""
				});
			}
			return aFilesMapped;
		},

		_createViewModel: function () {
			var oView = this.getView();
			var oViewModel = new JSONModel({
				selectedReceivers: [],
				attachments: [],
				body: "",
				object: "",
				showMultiComboBox: true
			});
			oView.setModel(oViewModel, "view");
		},

		_fileToBase64: function (oFile) {
			return new Promise(function (resolve, reject) {
				var oReader = new FileReader();
				oReader.readAsDataURL(oFile);
				oReader.onload = () => resolve(oReader.result);
				oReader.onerror = error => reject(error);
			}.bind(this));
		}
	};

	AbstractInterface.extend(EmailInterface);

	return EmailInterface;
});