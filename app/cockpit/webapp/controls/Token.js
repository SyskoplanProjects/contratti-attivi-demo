sap.ui.define([
	"sap/m/Token",
	'sap/m/library',
	'sap/ui/core/Control',
	'sap/m/Tokenizer',
	'sap/ui/core/library',
	'sap/ui/core/Icon',
	'sap/m/TokenRenderer',
	'sap/ui/core/InvisibleText',
	'sap/ui/events/KeyCodes',
	'sap/ui/core/theming/Parameters',
	'sap/ui/core/Core'
], function (
	Token,
	library,
	Control,
	Tokenizer,
	coreLibrary,
	Icon,
	TokenRenderer,
	InvisibleText,
	KeyCodes,
	Parameters,
	Core
) {
	"use strict";
	var CustomToken = Token.extend("com.buyerui.buyerui.controls.Token", {});
	
	CustomToken.prototype.init = function() {
		var that = this;
		this._deleteIcon = new Icon({
			id : that.getId() + "-icon",
			src : "sap-icon://sys-cancel",
			noTabStop: true,
			press : function(oEvent) {
				var oParent = that.getParent();

				// fire "delete" event before Tokenizer's _onTokenDelete because the Tokenizer will destroy the token
				// and the token's delete handler will not be executed
				that.fireDelete({
					token : that
				});

				if (oParent instanceof Tokenizer) {
					oParent._onTokenDelete(that);
				}

				oEvent.preventDefault();
			}
		});

		this._deleteIcon.addStyleClass("sapMTokenIcon");
		this.setAggregation("deleteIcon", this._deleteIcon);
		this._deleteIcon.setUseIconTooltip(false);
	};
	
	return CustomToken;
});