sap.ui.define([
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/odata/ODataUtils",
	"sap/ui/model/FilterProcessor",
], function (ODataModel, ODataUtils, FilterProcessor) {
    
    "use strict";

    /**
	 * Trigger a <code>GET</code> request to the OData service that was specified in the model constructor.
	 *
	 * The data will be stored in the model. The requested data is returned with the response.
	 *
	 * @param {string} sPath
	 *   An absolute path or a path relative to the context given in
	 *   <code>mParameters.context</code>; if the path contains a query string, the query string is
	 *   ignored, use <code>mParameters.urlParameters</code> instead
	 * @param {object} [mParameters] Optional parameter map containing any of the following properties:
	 * @param {object} [mParameters.context] If specified, <code>sPath</code> has to be relative to the path
	 * 		given with the context.
	 * @param {Object<string,string>} [mParameters.urlParameters] A map containing the parameters that will be passed as query strings
	 * @param {sap.ui.model.Filter[]} [mParameters.filters] An array of filters to be included in the request URL
	 * @param {sap.ui.model.Sorter[]} [mParameters.sorters] An array of sorters to be included in the request URL
     * @param {function} [nSkip] Number to skip each time on sequential read
	 * @param {function} [fnSuccessGlobal] A callback function which is called when the data has
	 *		been successfully retrieved. The handler can have the
	 *		following parameters: <code>oData</code> and <code>response</code>. The <code>oData</code> parameter contains the data of the retrieved data.
	 *		The <code>response</code> parameter contains further information about the response of the request.
	 * @param {function} [mParameters.error] A callback function which is called when the request
	 * 		failed. The handler can have the parameter: <code>oError</code> which contains additional error information.
	 * @param {string} [mParameters.batchGroupId] Deprecated - use <code>groupId</code> instead
	 * @param {string} [mParameters.groupId] ID of a request group; requests belonging to the same group will be bundled in one batch request
	 * @param {boolean} [mParameters.updateAggregatedMessages]
	 *   Whether messages for child entities belonging to the same business object as the requested
	 *   or changed resources are updated. It is considered only if
	 *   {@link sap.ui.model.odata.MessageScope.BusinessObject} is set using
	 *   {@link #setMessageScope} and if the OData service supports message scope.
	 * @return {object} An object which has an <code>abort</code> function to abort the current request.
	 *
	 * @public
	 */
    ODataModel.prototype.sequentialRead = function(sPath, mParameters) {
        var bCanonical, oContext, fnError, sETag, aFilters, sGroupId, mHeaders, sMethod, oRequest,
            bUpdateAggregatedMessages, aUrlParams, mUrlParams = {}, nTop, fnSuccessGlobal, fnErrorGlobal,
			that = this;

		if (mParameters) {
			aFilters = mParameters.filters;
			mParameters.urlParameters && Object.keys(mParameters.urlParameters).map(function (sKey) {
                if(sKey === "$expand") return
                mUrlParams[sKey] = mParameters.urlParameters[sKey];
            });
            nTop = mParameters.top || 100;
            fnSuccessGlobal = mParameters.success;
            fnErrorGlobal = mParameters.error;
		}

        var fnError = function (oError) {
            fnErrorGlobal(oError);
        };

        var fnSuccess = function (oData, oHeader) {
            try {
                const nCount = Number(oData);
                let nSkip = 0;
                if (nCount === 0) {
                    return fnSuccessGlobal({"results":[]}, oHeader);
                }

                let aPromisesRead = [];

                while(nCount > nSkip) {
                    if(!mParameters.urlParameters) mParameters.urlParameters = {};
                    mParameters.urlParameters.$top = nTop;
                    mParameters.urlParameters.$skip = nSkip;
                    aPromisesRead.push(that._returnPromiseSequentialRead(sPath, mParameters));

                    nSkip += nTop;
                }

                Promise.all(aPromisesRead)
                .then(function (aResponse) {
                    let oDataMapped = {results: []};
                    aResponse.map(function (oResponse) {
                        let oData = oResponse.results;
                        oDataMapped.results = oDataMapped.results.concat(oData);
                    });
                    return fnSuccessGlobal(oDataMapped, oHeader);
                })
                .catch(function (oError) {
                    fnErrorGlobal(oError);
                });
            } catch(oError) {
                fnErrorGlobal(oError);
            }
        }

		bCanonical = this._isCanonicalRequestNeeded(bCanonical);

		if (sPath && sPath.indexOf('?') !== -1) {
			sPath = sPath.slice(0, sPath.indexOf('?'));
		}

        let sPathCount = sPath + "/$count";

		aUrlParams = ODataUtils._createUrlParamsArray(mUrlParams);

		mHeaders = this._getHeaders(mHeaders, true);

		sMethod = "GET";
		sETag = this._getETag(sPathCount, oContext);

		var oRequestHandle = {
			abort: function() {
				if (oRequest) {
					oRequest._aborted = true;
				}
			}
		};

		function createReadRequest(requestHandle) {
			var oEntityType, oFilter, sFilterParams, mRequests, sUrl,
				sDeepPath = that.resolveDeep(sPathCount, oContext),
				sResourcePath = that._getResourcePath(bCanonical, sDeepPath, sPathCount, oContext);

			oEntityType = that.oMetadata._getEntityTypeByPath(sResourcePath);

			oFilter = FilterProcessor.groupFilters(aFilters);
			sFilterParams = ODataUtils.createFilterParams(oFilter, that.oMetadata, oEntityType);
			if (sFilterParams) {
				aUrlParams.push(sFilterParams);
			}

			sUrl = that._createRequestUrlWithNormalizedPath(sResourcePath, aUrlParams,
				that.bUseBatch);
			oRequest = that._createRequest(sUrl, sDeepPath, sMethod, mHeaders, null, sETag,
				undefined, bUpdateAggregatedMessages);

			mRequests = that.mRequests;
			if (sGroupId in that.mDeferredGroups) {
				mRequests = that.mDeferredRequests;
			}
			that._pushToRequestQueue(mRequests, sGroupId, null, oRequest, fnSuccess, fnError, requestHandle, false);

			return oRequest;
		}

		return this._processRequest(createReadRequest, fnError);

    };


    ODataModel.prototype._returnPromiseSequentialRead = function (sPath, mParameters) {
        return new Promise(function (resolve, reject) {
            mParameters.success = resolve;
            mParameters.error = reject;
            
            this.read(sPath, mParameters)
        }.bind(this));
    }

});