sap.ui.define([
	"sap/uxap/ObjectPageLayoutABHelper",
	"sap/ui/thirdparty/jquery",
	"sap/ui/base/Metadata",
	"sap/ui/core/CustomData",
	"sap/ui/base/ManagedObjectObserver",
	"./AnchorBar",
	"sap/m/Button",
	"sap/m/MenuButton",
	"sap/m/Menu",
	"sap/m/MenuItem",
	"sap/ui/core/IconPool"
], function (ObjectPageLayoutABHelper, jQuery, Metadata, CustomData, ManagedObjectObserver, AnchorBar, Button, MenuButton, Menu, MenuItem, IconPool) {
	"use strict";
	
	var oCustomObjectPageLayoutABHelper = ObjectPageLayoutABHelper.extend("com.buyerui.buyerui.controls.ObjectPageLayoutABHelper");

	oCustomObjectPageLayoutABHelper.prototype._getAnchorBar = function () {
		var oObjectPageLayout = this.getObjectPageLayout(),
			oAnchorBar = oObjectPageLayout.getAggregation("_anchorBar");

		if (!oAnchorBar) {

			oAnchorBar = new AnchorBar({
				id: oObjectPageLayout.getId() + "-anchBar",
				showPopover: oObjectPageLayout.getShowAnchorBarPopover(),
				backgroundDesign: oObjectPageLayout.getBackgroundDesignAnchorBar()
			});

			this.getObjectPageLayout().setAggregation("_anchorBar", oAnchorBar, true);
		}

		return oAnchorBar;
	};

	return oCustomObjectPageLayoutABHelper;

});