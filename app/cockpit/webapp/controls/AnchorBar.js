sap.ui.define([
	"sap/uxap/AnchorBar",
	"./Button"
], function(AnchorBar, Button) {
	"use strict";
	
	var oCustomAnchor = AnchorBar.extend("com.buyerui.buyerui.controls.AnchorBar", {});
	
	oCustomAnchor.prototype.addContent = function (oButton, bInvalidate) {
		var hoverableButton = new Button();
		oButton.onmouseover = hoverableButton.onmouseover;
		oButton.attachHover = hoverableButton.attachHover;
		oButton.fireHover = hoverableButton.fireHover;
		oButton.addStyleClass("sapUxAPAnchorBarButton");
		oButton.removeAllAriaDescribedBy();

		if (this._bHasButtonsBar && (oButton.data("secondLevel") === true || oButton.data("secondLevel") === "true")) {

			//attach handler on the scrolling mechanism
			oButton.attachHover(this._handleDirectScroll, this);
			oButton.attachPress(this._handleDirectScroll, this);
		}

		return this.addAggregation("content", oButton, bInvalidate);
	};
	
	return oCustomAnchor;
});