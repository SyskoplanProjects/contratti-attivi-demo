sap.ui.define(["sap/ui/core/Control"], function (Control) {
  "use strict";

  var _pdfJsPromise = null;

  // Carica lo script pdf.min.js (build browser di pdfjs-dist) una sola volta,
  // condiviso da tutte le istanze di PdfPreview nella pagina.
  function _loadPdfJs() {
    if (_pdfJsPromise) return _pdfJsPromise;
    var sBase = sap.ui.require.toUrl("com/reply/contrattiattivi/comparator/lib/pdfjs");
    _pdfJsPromise = new Promise(function (resolve, reject) {
      if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
      var oScript = document.createElement("script");
      oScript.src = sBase + "/pdf.min.js";
      oScript.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = sBase + "/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      oScript.onerror = function () { reject(new Error("Impossibile caricare pdf.min.js")); };
      document.head.appendChild(oScript);
    });
    return _pdfJsPromise;
  }

  return Control.extend("com.reply.contrattiattivi.comparator.control.PdfPreview", {
    metadata: {
      properties: {
        pdfBase64: { type: "string", defaultValue: null },
        highlightPosizione: { type: "object", defaultValue: null }
      }
    },

    init: function () {
      this._aCanvases = [];
      this._aPages = [];
      this._oOverlay = null;
      this._oObserver = null;
    },

    exit: function () {
      if (this._oObserver) { this._oObserver.disconnect(); this._oObserver = null; }
    },

    onAfterRendering: function () {
      this._renderPdf();
    },

    // Aggiorna solo l'overlay di evidenziazione, senza re-invalidare/ridisegnare tutto il PDF
    // (altrimenti ogni click su un campo del pannello metadati ricaricherebbe l'intero documento).
    setHighlightPosizione: function (oPosizione) {
      this.setProperty("highlightPosizione", oPosizione, true);
      this._updateHighlight();
      return this;
    },

    _renderPdf: async function () {
      // onAfterRendering può scattare più volte (es. wizard che passa da invisible a
      // visible e re-render di step in renderMode="Page"): senza guardia, due chiamate
      // concorrenti si intrecciano sugli await e corrompono _aPages (es. due entry per la
      // stessa pagina) lasciando l'anteprima vuota. Ogni chiamata incrementa il token;
      // quella piu' recente vince, le piu' vecchie si fermano ai checkpoint dopo ogni await.
      this._iRenderToken = (this._iRenderToken || 0) + 1;
      var iRenderToken = this._iRenderToken;
      var oContainer = this.getDomRef("content");
      if (!oContainer) return;
      oContainer.innerHTML = "";
      this._aCanvases = [];
      this._aPages = [];
      this._oOverlay = null;
      if (this._oObserver) { this._oObserver.disconnect(); this._oObserver = null; }

      var sBase64 = this.getPdfBase64();
      if (!sBase64) {
        oContainer.textContent = "Nessuna anteprima disponibile per questo documento.";
        return;
      }

      var pdfjsLib;
      try {
        pdfjsLib = await _loadPdfJs();
      } catch (e) {
        if (iRenderToken !== this._iRenderToken) return;
        oContainer.textContent = "Anteprima PDF non disponibile: " + e.message;
        return;
      }
      if (iRenderToken !== this._iRenderToken) return;

      var sPure = sBase64.indexOf(",") >= 0 ? sBase64.split(",")[1] : sBase64;
      var aBytes;
      try {
        aBytes = Uint8Array.from(atob(sPure), function (c) { return c.charCodeAt(0); });
      } catch (e) {
        oContainer.textContent = "PDF non valido.";
        return;
      }

      try {
        var oDoc = await pdfjsLib.getDocument({ data: aBytes }).promise;
        if (iRenderToken !== this._iRenderToken) return;
        // Un canvas per pagina a piena scala pesa parecchio (un contratto di 60 pagine
        // sarebbero centinaia di MB di backing store); si crea un placeholder dimensionato
        // per ogni pagina e si rende il canvas vero solo quando entra in viewport.
        this._oObserver = new IntersectionObserver(this._onPageIntersect.bind(this), {
          root: oContainer, rootMargin: "200px 0px"
        });
        for (var i = 1; i <= oDoc.numPages; i++) {
          var oPage = await oDoc.getPage(i);
          if (iRenderToken !== this._iRenderToken) return;
          var oViewport = oPage.getViewport({ scale: 1.3 });
          var oPlaceholder = document.createElement("div");
          oPlaceholder.style.width = oViewport.width + "px";
          oPlaceholder.style.height = oViewport.height + "px";
          oPlaceholder.style.marginBottom = "0.5rem";
          oPlaceholder.dataset.pageIndex = String(i - 1);
          oContainer.appendChild(oPlaceholder);
          this._aPages.push({ oPage: oPage, oViewport: oViewport, oPlaceholder: oPlaceholder, bRendered: false });
          this._oObserver.observe(oPlaceholder);
        }
        if (this._aPages.length) await this._renderPage(0);
        if (iRenderToken !== this._iRenderToken) return;
        this._updateHighlight();
      } catch (e) {
        if (iRenderToken !== this._iRenderToken) return;
        oContainer.textContent = "Impossibile renderizzare l'anteprima PDF: " + e.message;
      }
    },

    _onPageIntersect: function (aEntries) {
      aEntries.forEach(function (oEntry) {
        if (!oEntry.isIntersecting) return;
        this._renderPage(Number(oEntry.target.dataset.pageIndex));
      }.bind(this));
    },

    // Sostituisce il placeholder della pagina iIndex con un canvas renderizzato.
    // Idempotente: chiamabile sia dall'IntersectionObserver sia forzatamente da
    // _updateHighlight quando serve una pagina non ancora entrata in viewport.
    _renderPage: async function (iIndex) {
      var oPageInfo = this._aPages && this._aPages[iIndex];
      if (!oPageInfo || oPageInfo.bRendered) return;
      oPageInfo.bRendered = true;
      if (this._oObserver) this._oObserver.unobserve(oPageInfo.oPlaceholder);

      var oCanvas = document.createElement("canvas");
      oCanvas.width = oPageInfo.oViewport.width;
      oCanvas.height = oPageInfo.oViewport.height;
      oCanvas.dataset.scale = oPageInfo.oViewport.scale;
      oCanvas.style.display = "block";
      oCanvas.style.marginBottom = "0.5rem";
      oPageInfo.oPlaceholder.replaceWith(oCanvas);
      this._aCanvases[iIndex] = oCanvas;

      try {
        await oPageInfo.oPage.render({ canvasContext: oCanvas.getContext("2d"), viewport: oPageInfo.oViewport }).promise;
      } catch (e) {
        oPageInfo.bRendered = false;
      }
    },

    _updateHighlight: async function () {
      if (this._oOverlay) {
        this._oOverlay.remove();
        this._oOverlay = null;
      }
      var oPos = this.getHighlightPosizione();
      if (!oPos || !oPos.pagina) return;
      var iIndex = oPos.pagina - 1;
      if (this._aPages && this._aPages[iIndex] && !this._aPages[iIndex].bRendered) {
        await this._renderPage(iIndex);
      }
      var oCanvas = this._aCanvases[iIndex];
      if (!oCanvas) return;

      var fScale = Number(oCanvas.dataset.scale) || 1;
      var oDiv = document.createElement("div");
      oDiv.className = "app-pdf-highlight";
      oDiv.style.position = "absolute";
      oDiv.style.left = (oCanvas.offsetLeft + oPos.x * fScale) + "px";
      oDiv.style.top = (oCanvas.offsetTop + oPos.y * fScale) + "px";
      oDiv.style.width = Math.max(oPos.width * fScale, 4) + "px";
      oDiv.style.height = Math.max(oPos.height * fScale, 4) + "px";
      oDiv.style.border = "2px solid #e9730c";
      oDiv.style.background = "rgba(233, 115, 12, 0.15)";
      oDiv.style.pointerEvents = "none";

      var oContainer = this.getDomRef("content");
      oContainer.style.position = "relative";
      oContainer.appendChild(oDiv);
      this._oOverlay = oDiv;
      oCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
    },

    renderer: function (oRm, oControl) {
      oRm.openStart("div", oControl);
      oRm.class("app-pdf-preview");
      oRm.style("overflow", "auto");
      oRm.style("height", "55vh");
      oRm.style("width", "100%");
      oRm.style("border", "1px solid var(--sapList_BorderColor, #ccc)");
      oRm.openEnd();
      oRm.openStart("div");
      oRm.attr("id", oControl.getId() + "-content");
      oRm.openEnd();
      oRm.close("div");
      oRm.close("div");
    }
  });
});