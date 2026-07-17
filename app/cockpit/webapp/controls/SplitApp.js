sap.ui.define([
	"sap/m/SplitApp",
	"sap/m/SplitAppRenderer"
], function (SplitApp, SplitAppRenderer) {

	var CustomSplitApp = SplitApp.extend("com.buyerui.gesub_cockpit.buyer_gesub_cockpit.controls.SplitApp", {
		renderer: SplitAppRenderer
	});

	CustomSplitApp.prototype.init = function () {
		SplitApp.prototype.init.apply(this, arguments);
		this.firstTime = true;
	};

	CustomSplitApp.prototype.hideMaster = function () {
		var _this$ = this._oMasterNav.$(),
			fnAnimationEnd = jQuery.proxy(this._afterHideMasterAnimation, this);
		if (this._portraitPopover()) {
			if (this._oPopOver.isOpen()) {
				this._oPopOver.close();
				this._bMasterClosing = true;
			}
		} else {
			if ((this._portraitHide() || this._hideMode()) &&
				(this._bMasterisOpen || this._oMasterNav.$().hasClass("sapMSplitContainerMasterVisible"))) {
				_this$.bind("webkitTransitionEnd transitionend", fnAnimationEnd);

				this.fireBeforeMasterClose();
				this._oMasterNav.toggleStyleClass("sapMSplitContainerMasterVisible", false);
				this._oMasterNav.toggleStyleClass("sapMSplitContainerMasterHidden", true);
				this._bMasterClosing = true;
				if (this.firstTime) {
					fnAnimationEnd();
					this.firstTime = false;
				}
			}
		}
		return this;
	};

	return CustomSplitApp;
});