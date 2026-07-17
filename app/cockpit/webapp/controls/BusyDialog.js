sap.ui.define([
	"sap/m/BusyDialog"
], function (BusyDialog) {
	var CustomBusyDialog = BusyDialog.extend("com.buyerui.buyerui.controls.BusyDialog", {
		metadata: {
			events: {
				afterOpen: {}
			}
		}
	});

	CustomBusyDialog.prototype.init = function () {
		BusyDialog.prototype.init.apply(this, arguments);
		this._oDialog.attachAfterOpen({}, function () {
			this.fireAfterOpen();
		}, this);
	};

	return CustomBusyDialog;
});