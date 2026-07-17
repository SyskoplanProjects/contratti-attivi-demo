(function() {
    if($ && $.ajax) {
        $.sequentialReadOData = function (oParams) {
            if (!oParams || oParams.type !== "GET") throw "Error: Invalid method for method sequentialRead,only GET allowed";
            let fnErrorGlobal = oParams.error, 
            fnSuccessGlobal = oParams.success,
            sUrl = oParams.url, 
            sUrlCount = oParams.urlCount,
            nTop = oParams.top || 100;

            if(!sUrlCount) {
                $.ajax({
                    type: "GET",
                    url: sUrl,
                    success: fnSuccessGlobal,
                    error: fnErrorGlobal
                });
                return
            }

            let fnError = function (oError) {
                fnErrorGlobal(oError);
            };

            let fnSuccess = function (oData, oHeader) {
                try {
                    const nCount = Number(oData);
                    let nSkip = 0;
                    if (nCount === 0) {
                        return fnSuccessGlobal({"value":[]}, oHeader);
                    }
    
                    let aPromisesRead = [];
    
                    while(nCount > nSkip) {
                        const oParams = {}
                        oParams.url = sUrl + `&$top=${nTop}&$skip=${nSkip}`;
                        oParams.type = "GET";
                        aPromisesRead.push(_returnPromiseSequentialRead(oParams));
    
                        nSkip += nTop;
                    }
    
                    Promise.all(aPromisesRead)
                    .then(function (aResponse) {
                        let oDataMapped = {value: []};
                        aResponse.map(function (oResponse) {
                            let oData = oResponse.value;
                            oDataMapped.value = oDataMapped.value.concat(oData);
                        });
                        return fnSuccessGlobal(oDataMapped, oHeader);
                    })
                    .catch(function (oError) {
                        fnErrorGlobal(oError);
                    });
                } catch(oError) {
                    fnErrorGlobal(oError);
                }
            };

            sUrlCount = sUrlCount.search(/\/\$count\?/) !== -1 ? sUrlCount : _mapUrlWithoutCount(sUrlCount);

            $.ajax({
                type: "GET",
                url: sUrlCount,
                success: fnSuccess,
                error: fnError
            });
        };

        const _returnPromiseSequentialRead = function (oParams) {
            return new Promise(function (resolve, reject) {
                oParams.success = resolve;
                oParams.error = reject
                $.ajax(oParams);
            }.bind(this));
        };

        const _mapUrlWithoutCount = function (sUrl) {
            let aSplittedUrl = sUrl.split("?$")

            let sBasePath = aSplittedUrl.shift();
            sBasePath += "/$count?$" + aSplittedUrl.join("?$");
            
            return sBasePath;
        };
    }
})();