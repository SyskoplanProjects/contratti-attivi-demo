sap.ui.define([
	"sap/m/ObjectHeader",
	"sap/m/ObjectHeaderRenderer",
	"sap/ui/core/IconPool",
	"sap/m/library"
], function (ObjectHeader, ObjectHeaderRenderer, IconPool, library) {

	// shortcut for sap.m.ImageHelper
	var ImageHelper = library.ImageHelper;

	var CustomObjectHeader = ObjectHeader.extend("com.buyerui.gesub_cockpit.buyer_gesub_cockpit.controls.ObjectHeader", {
		metadata: {
			properties: {
				iconColor: {
					type: "sap.ui.core.CSSColor",
					defaultValue: "#000000"
				}
			}
		},
		renderer: ObjectHeaderRenderer
	});

	CustomObjectHeader.prototype._getImageControl = function () {

		var sImgId = this.getId() + "-img";
		var sSize = "2.5rem";

		var mProperties = jQuery.extend({
				src: this.getIcon(),
				tooltip: this.getIconTooltip(),
				alt: this.getIconAlt(),
				useIconTooltip: false,
				densityAware: this.getIconDensityAware()
			},
			IconPool.isIconURI(this.getIcon()) ? {
				size: sSize,
				color: this.getIconColor()
			} : {}
		);

		this._oImageControl = ImageHelper.getImageControl(sImgId, this._oImageControl, this, mProperties);

		return this._oImageControl;
	};

	return CustomObjectHeader;
});