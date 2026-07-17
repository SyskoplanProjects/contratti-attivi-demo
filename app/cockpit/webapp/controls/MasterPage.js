sap.ui.define([
	"sap/m/semantic/MasterPage",
	"sap/m/semantic/SemanticPageRenderer",
	'sap/m/semantic/SegmentedContainer',
	"sap/base/Log"
], function (MasterPage, SemanticPageRenderer, SegmentedContainer, Log) {
	var CustomMasterPage = MasterPage.extend("com.buyerui.gesub_cockpit.buyer_gesub_cockpit.controls.MasterPage", {
		metadata: {
			aggregations: {
				/**
				 * Custom header left buttons
				 */
				customHeaderContentLeft: {
					type: "sap.m.Button",
					multiple: true,
					singularName: "customHeaderContentLeft"
				}
			}
		},
		renderer: SemanticPageRenderer
	});

	/*

	 HEADER LEFT (CUSTOM CONTENT)
	 */

	CustomMasterPage.prototype.getCustomHeaderContentLeft = function () {
		return this._getSegmentedHeaderLeft().getSection("customLeft").getContent();
	};

	CustomMasterPage.prototype.addCustomHeaderContentLeft = function (oControl, bSuppressInvalidate) {
		this._getSegmentedHeaderLeft().getSection("customLeft").addContent(oControl, bSuppressInvalidate);
		return this;
	};

	CustomMasterPage.prototype.indexOfCustomHeaderContentLeft = function (oControl) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").indexOfContent(oControl);
	};

	CustomMasterPage.prototype.insertCustomHeaderContentLeft = function (oControl, iIndex, bSuppressInvalidate) {
		this._getSegmentedHeaderLeft().getSection("customLeft").insertContent(oControl, iIndex, bSuppressInvalidate);
		return this;
	};

	CustomMasterPage.prototype.removeCustomHeaderContentLeft = function (oControl, bSuppressInvalidate) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").removeContent(oControl, bSuppressInvalidate);
	};

	CustomMasterPage.prototype.removeAllCustomHeaderContentLeft = function (bSuppressInvalidate) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").removeAllContent(bSuppressInvalidate);
	};

	CustomMasterPage.prototype.destroyCustomHeaderContentLeft = function (bSuppressInvalidate) {

		var aChildren = this.getCustomHeaderContentLeft();

		if (!aChildren) {
			return this;
		}

		// set suppress invalidate flag
		if (bSuppressInvalidate) {
			this.iSuppressInvalidate++;
		}

		this._getSegmentedHeaderLeft().getSection("customLeft").destroy(bSuppressInvalidate);

		if (!this.isInvalidateSuppressed()) {
			this.invalidate();
		}

		// reset suppress invalidate flag
		if (bSuppressInvalidate) {
			this.iSuppressInvalidate--;
		}

		return this;
	};

	/**
	 * Returns the internal header left
	 * @private
	 * @returns {sap.m.semantic.SegmentedContainer}
	 */
	CustomMasterPage.prototype._getSegmentedHeaderLeft = function () {

		if (!this._oWrappedHeaderLeft) {

			var oHeader = this._getInternalHeader();
			if (!oHeader) {
				Log.error("missing page header", this);
				return null;
			}

			this._oWrappedHeaderLeft = new SegmentedContainer(oHeader, "contentLeft");

			this._oWrappedHeaderLeft.addSection({
				sTag: "customLeft"
			});

		}

		return this._oWrappedHeaderLeft;

	};

	return CustomMasterPage;
});