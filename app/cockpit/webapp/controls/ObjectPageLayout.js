sap.ui.define([
	"sap/ui/thirdparty/jquery",
	"sap/ui/base/ManagedObjectObserver",
	"sap/ui/core/ResizeHandler",
	"sap/ui/core/Configuration",
	"sap/ui/core/Control",
	"sap/ui/Device",
	"sap/ui/core/delegate/ScrollEnablement",
	"sap/uxap/ObjectPageLayout",
	"sap/uxap/ObjectPageSectionBase",
	"sap/uxap/ObjectPageSection",
	"sap/uxap/ObjectPageSubSection",
	"sap/uxap/ObjectPageHeaderContent",
	"sap/uxap/LazyLoading",
	"./ObjectPageLayoutABHelper",
	"sap/uxap/ThrottledTaskHelper",
	"sap/m/ScrollBar",
	"sap/ui/core/library",
	"sap/uxap/library",
	"sap/uxap/ObjectPageLayoutRenderer",
	"sap/base/Log",
	"sap/ui/dom/getScrollbarSize",
	"sap/base/assert",
	"sap/ui/events/KeyCodes",
	"sap/ui/dom/getFirstEditableInput"
], function (
	jQuery,
	ManagedObjectObserver,
	ResizeHandler,
	Configuration,
	Control,
	Device,
	ScrollEnablement,
	ObjectPageLayout,
	ObjectPageSectionBase,
	ObjectPageSection,
	ObjectPageSubSection,
	ObjectPageHeaderContent,
	LazyLoading,
	ABHelper,
	ThrottledTask,
	ScrollBar,
	coreLibrary,
	library,
	ObjectPageLayoutRenderer,
	Log,
	getScrollbarSize,
	assert,
	KeyCodes,
	getFirstEditableInput
) {
	"use strict";

	var oCustomObjectPageLayout = ObjectPageLayout.extend("com.buyerui.buyerui.controls.ObjectPageLayout");

	oCustomObjectPageLayout.prototype.init = function () {

		this.oCore = sap.ui.getCore();
		// lazy loading
		this._bFirstRendering = true;
		this._bDomReady = false; //dom is fully ready to be inspected
		this._bPinned = false;
		this._bStickyAnchorBar = false; //status of the header
		this._bHeaderInTitleArea = false;
		this._bHeaderExpanded = true;
		this._bHeaderBiggerThanAllowedHeight = false;
		this._oVisibleSubSections = 0;
		this._bDelayDOMBasedCalculations = true; //delay before obtaining DOM metrics to ensure that the final metrics are obtained
		this._iStoredScrollTop = 0; // used by RTA to restore state upon drag'n'drop operation
		this._oStoredScrolledSubSectionInfo = {}; // used to (re)store the position within the currently scrolled section upon rerender
		this._bAllContentFitsContainer = false; // indicates if the page has only one visible subSection in total (and it is marked to fit its container)
		this._bIsFooterAanimationGoing = false; // Indicates if the animation of the floating footer is still going.
		// anchorbar management
		this._bInternalAnchorBarVisible = true;

		this._$footerWrapper = []; //dom reference to the floating footer wrapper
		this._$opWrapper = []; //dom reference to the header for Dark mode background image scrolling scenario
		this._$anchorBar = []; //dom reference to the anchorBar
		this._$titleArea = []; //dom reference to the header title
		this._$stickyAnchorBar = []; //dom reference to the sticky anchorBar
		this._$headerContent = []; //dom reference to the headerContent
		this._$stickyHeaderContent = []; //dom reference to the stickyHeaderContent

		// header animation && anchor bar management
		this._bMobileScenario = false; //are we in a mobile scenario or the desktop one?
		this._oSectionInfo = {}; //register some of the section info sSectionId:{offset,buttonClone} for updating the anchorbar accordingly
		this._aSectionBases = []; //hold reference to all sections and subsections alike (for perf reasons)
		this._sScrolledSectionId = ""; //section id that is currently scrolled
		this._iScrollToSectionDuration = 600; //ms
		this._$spacer = []; //dom reference to the bottom padding spacing
		this.iHeaderContentHeight = 0; // original height of the header content
		this.iStickyHeaderContentHeight = 0; // original height of the sticky header content
		this.iHeaderTitleHeight = 0; // original height of the header title
		this.iHeaderTitleHeightStickied = 0; // height of the header title when stickied (can be different from the collapsed height because of isXXXAlwaysVisible options or text wrapping)
		this.iAnchorBarHeight = 0; // original height of the anchorBar
		this.iFooterHeight = 0; // original height of the anchorBar
		this.iTotalHeaderSize = 0; // total size of headerTitle + headerContent

		this._iREMSize = parseInt(jQuery("body").css("font-size"));
		this._iOffset = parseInt(0.25 * this._iREMSize);

		this._iResizeId = null;
		this._iAfterRenderingDomReadyTimeout = null;

		this._oABHelper = new ABHelper(this);

		this._initializeScroller();
	};

	return oCustomObjectPageLayout;
});