sap.ui.define([
	"sap/m/semantic/DetailPage",
	"sap/m/semantic/SemanticPageRenderer",
	'sap/m/semantic/SegmentedContainer',
	'sap/base/Log'
], function (DetailPage, SemanticPageRenderer, SegmentedContainer, Log) {
	var CustomDetailPage = DetailPage.extend("com.buyerui.gesub_cockpit.buyer_gesub_cockpit.controls.DetailPage", {
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

	CustomDetailPage.prototype.getCustomHeaderContentLeft = function () {
		return this._getSegmentedHeaderLeft().getSection("customLeft").getContent();
	};

	CustomDetailPage.prototype.addCustomHeaderContentLeft = function (oControl, bSuppressInvalidate) {
		this._getSegmentedHeaderLeft().getSection("customLeft").addContent(oControl, bSuppressInvalidate);
		return this;
	};

	CustomDetailPage.prototype.indexOfCustomHeaderContentLeft = function (oControl) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").indexOfContent(oControl);
	};

	CustomDetailPage.prototype.insertCustomHeaderContentLeft = function (oControl, iIndex, bSuppressInvalidate) {
		this._getSegmentedHeaderLeft().getSection("customLeft").insertContent(oControl, iIndex, bSuppressInvalidate);
		return this;
	};

	CustomDetailPage.prototype.removeCustomHeaderContentLeft = function (oControl, bSuppressInvalidate) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").removeContent(oControl, bSuppressInvalidate);
	};

	CustomDetailPage.prototype.removeAllCustomHeaderContentLeft = function (bSuppressInvalidate) {
		return this._getSegmentedHeaderLeft().getSection("customLeft").removeAllContent(bSuppressInvalidate);
	};

	CustomDetailPage.prototype.destroyCustomHeaderContentLeft = function (bSuppressInvalidate) {

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
	CustomDetailPage.prototype._getSegmentedHeaderLeft = function () {

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

	return CustomDetailPage;
});