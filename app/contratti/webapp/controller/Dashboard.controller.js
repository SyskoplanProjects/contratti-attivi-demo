sap.ui.define([
  "./BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../model/dashboardUtils",
  "../model/aggregateCockpit",
  "../formatter"
], function (BaseController, JSONModel, Filter, FilterOperator, dashboardUtils, aggregateCockpit, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({ fornitoreAttivo: null }), "filtro");
      this.getView().setModel(new JSONModel({ righe: [], vuoto: false }), "vendor");
      this.getView().setModel(new JSONModel({ righe: [], vuoto: false }), "vendorMain");
      this.getView().setModel(new JSONModel({ righe: [] }), "reportMain");
      this.getView().setModel(new JSONModel({ righe: [], nome: "" }), "contrattiFornitoreReport");
      this._caricaDati();
      this.getOwnerComponent().getRouter().getRoute("dashboard").attachPatternMatched(this._onRouteMatched, this);
    },

    _caricaDati: function () {
      var that = this;
      var oModel = this.getOwnerComponent().getModel();
      if (!oModel) {
        this.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
        return;
      }
      var oContrattiBinding = oModel.bindList("/Contratto", { $filter: "stato ne 'ARCHIVIATO'" }).requestContexts(0, 2000);
      var oFornitoriBinding = oModel.bindList("/Fornitore", {}).requestContexts(0, 2000);
      Promise.all([
        oContrattiBinding,
        oFornitoriBinding
      ]).then(function (results) {
        var contratti = (results[0] || []).map(function (c) { return c.getObject(); });
        var fornitori = (results[1] || []).map(function (f) { return f.getObject(); });
        if (!contratti.length && fornitori.length) {
          contratti = that._sintetizzaContratti(fornitori);
        }
        contratti = contratti.map(function (c) {
          return {
            ID: c.ID,
            codice: c.codice,
            fornitore_ID: c.fornitore_ID,
            stato: c.stato,
            importo: c.importo,
            categoria: c.categoria || "altro",
            esitoVerifica: c.esitoVerifica || "in_corso",
            dataStipula: c.dataStipula,
            dataScadenza: c.dataScadenza,
            intestatario: c.intestatario,
            responsabile: c.responsabile,
            oggetto: c.oggetto
          };
        });
        that._aContrattiTutti = contratti;
        that._aFornitoriTutti = fornitori;
        that._aggiornaVendor();

        var categorieUniche = Array.from(new Set(contratti.map(function (c) { return c.categoria; }))).sort();
        var responsabiliUnici = Array.from(new Set(contratti.map(function (c) { return c.responsabile; }).filter(Boolean))).sort();
        that.getView().setModel(new JSONModel({
          categorie: [{ key: "", text: "Tutte" }].concat(categorieUniche.map(function (k) {
            return { key: k, text: formatter.categoriaText(k) };
          })),
          responsabili: [{ key: "", text: "Tutti" }].concat(responsabiliUnici.map(function (r) {
            return { key: r, text: r };
          }))
        }), "filtriOpzioni");

        that.onEseguiFiltri();
      }, function (err) {
        console.error("Dashboard load error", err);
        that.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
      });
    },

    // Se il DB non ha contratti, li sintetizza dai fornitori reali così KPI/trend/top
    // mostrano comunque dati utili. Idempotente per costruzione (non tocca il DB).
    _sintetizzaContratti: function (aFornitori) {
      var CATEGORIE = ["fornitura", "servizio", "consulenza", "NDA", "altro"];
      var ESITI = ["ok", "non_conforme", "in_corso"];
      var STATI = ["BOZZA", "IN_REVISIONE", "APPROVATO", "FIRMATO"];
      var MESI = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
      return aFornitori.filter(function (f) { return f.fatturatoTot != null; }).map(function (f, i) {
        var m = MESI[i % MESI.length];
        var anno = i % 2 === 0 ? 2025 : 2026;
        var giorno = (i % 27) + 1;
        var dataStipula = anno + "-" + ("0" + (m + 1)).slice(-2) + "-" + ("0" + giorno).slice(-2);
        return {
          stato: STATI[i % STATI.length],
          importo: f.fatturatoTot,
          categoria: CATEGORIE[i % CATEGORIE.length],
          esitoVerifica: ESITI[i % ESITI.length],
          dataStipula: dataStipula,
          dataScadenza: (anno + 1) + "-" + ("0" + ((m + 9) % 12 + 1)).slice(-2) + "-" + ("0" + giorno).slice(-2)
        };
      });
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      var sFornitore = oArgs.fornitore ? decodeURIComponent(oArgs.fornitore) : null;
      this.getView().getModel("filtro").setProperty("/fornitoreAttivo", sFornitore);
      this.byId("dashboardTabBar").setSelectedKey("contratti");
      var oFornitoreCtrl = this.byId("filtroFornitore");
      if (oFornitoreCtrl) oFornitoreCtrl.setValue(sFornitore || "");
      this.onEseguiFiltri();
    },

    onEseguiFiltri: function () {
      if (!this._aContrattiTutti) return;

      var oDataDaCtrl = this.byId("filtroDataDa");
      var oDataACtrl = this.byId("filtroDataA");
      var oDataDa = oDataDaCtrl ? oDataDaCtrl.getDateValue() : null;
      var oDataA = oDataACtrl ? oDataACtrl.getDateValue() : null;
      var oFiltriNonPeriodo = this._estraiFiltriNonPeriodo();

      var aContrattiCorrente = this._filtraContratti(this._aContrattiTutti, oFiltriNonPeriodo, oDataDa, oDataA);
      var oPeriodoPrecedente = this._calcolaPeriodoPrecedente(oDataDa, oDataA);
      var aContrattiPrecedente = this._filtraContratti(
        this._aContrattiTutti, oFiltriNonPeriodo, oPeriodoPrecedente.inizio, oPeriodoPrecedente.fine
      );

      this._aggiornaCockpit(aContrattiCorrente, aContrattiPrecedente);
      this._aggiornaTabella(oFiltriNonPeriodo, oDataDa, oDataA);
    },

    _estraiFiltriNonPeriodo: function () {
      var oCategoria = this.byId("filtroCategoria");
      var oResponsabile = this.byId("filtroResponsabile");
      var oFornitore = this.byId("filtroFornitore");
      return {
        categoria: (oCategoria && oCategoria.getSelectedKey()) || null,
        responsabile: (oResponsabile && oResponsabile.getSelectedKey()) || null,
        fornitore: (oFornitore && (oFornitore.getValue() || "").trim()) || null
      };
    },

    _filtraContratti: function (aContratti, oFiltri, oDataDa, oDataA) {
      var sFornitoreLower = oFiltri.fornitore ? oFiltri.fornitore.toLowerCase() : null;
      return aContratti.filter(function (c) {
        if (oFiltri.categoria && c.categoria !== oFiltri.categoria) return false;
        if (oFiltri.responsabile && c.responsabile !== oFiltri.responsabile) return false;
        if (sFornitoreLower && (c.intestatario || "").toLowerCase().indexOf(sFornitoreLower) === -1) return false;
        if (oDataDa || oDataA) {
          if (!c.dataStipula) return false;
          var dData = new Date(c.dataStipula + "T00:00:00");
          if (oDataDa && dData < oDataDa) return false;
          if (oDataA && dData > oDataA) return false;
        }
        return true;
      });
    },

    // Nessun filtro periodo impostato -> confronta anno corrente vs anno precedente.
    // Filtro periodo impostato -> confronta con il periodo immediatamente precedente
    // (stessa durata in giorni, che finisce il giorno prima dell'inizio del periodo corrente).
    _calcolaPeriodoPrecedente: function (oDataDa, oDataA) {
      var oOggi = new Date();
      var dInizioCorrente = oDataDa || new Date(oOggi.getFullYear(), 0, 1);
      var dFineCorrente = oDataA || new Date(oOggi.getFullYear(), 11, 31);
      var nDurataGiorni = Math.round((dFineCorrente.getTime() - dInizioCorrente.getTime()) / 86400000);
      var dFinePrecedente = new Date(dInizioCorrente);
      dFinePrecedente.setDate(dFinePrecedente.getDate() - 1);
      var dInizioPrecedente = new Date(dInizioCorrente);
      dInizioPrecedente.setDate(dInizioPrecedente.getDate() - nDurataGiorni - 1);
      return { inizio: dInizioPrecedente, fine: dFinePrecedente };
    },

    _formatDateISO: function (oDate) {
      return oDate.getFullYear() + "-" + ("0" + (oDate.getMonth() + 1)).slice(-2) + "-" + ("0" + oDate.getDate()).slice(-2);
    },

    _aggiornaTabella: function (oFiltriNonPeriodo, oDataDa, oDataA) {
      var aFiltrati = this._filtraContratti(this._aContrattiTutti, oFiltriNonPeriodo, oDataDa, oDataA)
        .filter(function (c) { return c.stato !== 'ARCHIVIATO'; });
      var aVendorMain = aggregateCockpit.buildVendorRating(aFiltrati, this._aFornitoriTutti);
      this._decorateVendor(aVendorMain);
      var oModel = this.getView().getModel("vendorMain");
      oModel.setProperty("/righe", aVendorMain);
      oModel.setProperty("/vuoto", aVendorMain.length === 0);
      var mCounts = {};
      aFiltrati.forEach(function (c) {
        if (c.fornitore_ID) mCounts[c.fornitore_ID] = (mCounts[c.fornitore_ID] || 0) + 1;
      });
      var oReportModel = this.getView().getModel("reportMain");
      if (oReportModel) {
        oReportModel.setProperty("/righe", this._aFornitoriTutti.map(function (f) {
          var oR = Object.assign({}, f);
          oR.numeroContratti = mCounts[f.ID] || 0;
          return oR;
        }));
      }
    },

    _costruisciRighe: function (aContratti) {
      var mF = {};
      (this._aFornitoriTutti || []).forEach(function (f) { mF[f.ID] = f; });
      return (aContratti || []).map(function (c) {
        var oFornitore = mF[c.fornitore_ID] || {};
        var oRischio = dashboardUtils.buildRischioFornitore(oFornitore);
        return {
          ID: c.ID, codice: c.codice, intestatario: c.intestatario, responsabile: c.responsabile,
          oggetto: c.oggetto, categoria: c.categoria, stato: c.stato, importo: c.importo,
          dataStipula: c.dataStipula, dataScadenza: c.dataScadenza,
          rischioLabel: oRischio.label, rischioState: this._statoRischio(oRischio.livello)
        };
      }, this);
    },

    _statoRischio: function (sLivello) {
      return sLivello === 'alto' ? 'Error' : sLivello === 'medio' ? 'Warning' : sLivello === 'basso' ? 'Success' : 'None';
    },

    _aggiornaVendor: function () {
      var aRighe = aggregateCockpit.buildVendorRating(this._aContrattiTutti, this._aFornitoriTutti);
      this._decorateVendor(aRighe);
      var oModel = this.getView().getModel("vendor");
      oModel.setProperty("/righe", aRighe);
      oModel.setProperty("/vuoto", aRighe.length === 0);
    },

    _decorateVendor: function (aRighe) {
      (aRighe || []).forEach(function (r) {
        r.indiceHtml = dashboardUtils.buildIndiceBarraHtml(r.indiceDipendenza);
        r.rischioLabel = r.rischio.label;
        r.rischioState = this._statoRischio(r.rischio.livello);
      }, this);
    },

    onEseguiFiltriVendor: function () {
      var oCtrl = this.byId("vendorRicerca");
      var sQ = (oCtrl && oCtrl.getValue() || "").trim().toLowerCase();
      var aRighe = aggregateCockpit.buildVendorRating(this._aContrattiTutti, this._aFornitoriTutti)
        .filter(function (r) { return !sQ || r.nome.toLowerCase().indexOf(sQ) !== -1; });
      this._decorateVendor(aRighe);
      var oModel = this.getView().getModel("vendor");
      oModel.setProperty("/righe", aRighe);
      oModel.setProperty("/vuoto", aRighe.length === 0);
    },





    onApriReportFornitoreMain: function (oEvent) {
      this._apriReportTab(oEvent, "vendorMain", "nome");
    },

    onApriReportFornitore: function (oEvent) {
      this._apriReportTab(oEvent, "vendor", "nome");
    },

    _apriReportTab: function (oEvent, sModelVendor, sPropNome) {
      var oCtx = oEvent.getSource().getBindingContext(sModelVendor);
      var sNome = oCtx && oCtx.getProperty(sPropNome);
      if (!sNome) return;
      this.byId("dashboardTabBar").setSelectedKey("report");
      var oT = this.byId("rfReportSearch");
      if (oT) {
        oT.setValue(sNome);
        oT.fireSearch({ query: sNome });
      }
    },

    _aggiornaCockpit: function (aContrattiCorrente, aContrattiPrecedente) {
      var ui = aggregateCockpit({ contratti: aContrattiCorrente, fornitori: this._aFornitoriTutti });
      var oTrendContratti = aggregateCockpit.buildTrendPeriodo(aContrattiCorrente, aContrattiPrecedente);
      var oTrendImporto = aggregateCockpit.buildTrendPeriodoImporto(aContrattiCorrente, aContrattiPrecedente);
      var sTopFornitoriHtml = dashboardUtils.buildTopFornitoriHtml(ui.topFornitori, "importi");
      this.getView().setModel(new JSONModel({
        totaleContrattiAnno: ui.totaleContratti,
        importoTotaleAnno: ui.importoTotaleAnno,
        donutTipologiaHtml: dashboardUtils.buildDonutHtml(ui.donutTipologia),
        donutSurveyHtml: dashboardUtils.buildDonutHtml(ui.donutSurvey),
        trendHtml: dashboardUtils.buildTrendHtml(ui.trend),
        trendContratti: oTrendContratti,
        trendImporto: oTrendImporto
      }), "cockpit");
      this.getView().setModel(new JSONModel({
        listaImporti: ui.topFornitori,
        listaNumero: ui.topFornitoriNumero,
        vista: "importi",
        topFornitoriHtml: sTopFornitoriHtml
      }), "fornitori");
    },

    onResetFiltroFornitore: function () {
      this.getOwnerComponent().getRouter().navTo("dashboard");
    },

    onCambiaVistaFornitori: function (oEvent) {
      var sVista = oEvent.getParameter("key");
      var oModel = this.getView().getModel("fornitori");
      if (!oModel) return;
      var aLista = oModel.getProperty(sVista === "numero" ? "/listaNumero" : "/listaImporti");
      oModel.setProperty("/vista", sVista);
      oModel.setProperty("/topFornitoriHtml", dashboardUtils.buildTopFornitoriHtml(aLista, sVista));
    },


    onReportSearch: function (oEvent) {
      this._applyReportFilter(oEvent.getParameter("query") || "");
    },

    onReportChange: function (oEvent) {
      this._applyReportFilter(oEvent.getSource().getValue());
    },

    onReportReset: function () {
      var oT = this.byId("rfReportSearch");
      if (oT) oT.setValue("");
      this._applyReportFilter("");
    },

    _applyReportFilter: function (sValue) {
      var sTrim = (sValue || "").trim();
      var aFilters = [];
      if (sTrim) {
        aFilters.push(new Filter({
          filters: [
            new Filter({ path: "nomeFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false }),
            new Filter({ path: "idSapFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false })
          ],
          and: false
        }));
      }
      var oTable = this.byId("reportFornitoriTable");
      if (oTable) {
        var oBinding = oTable.getBinding("items");
        if (oBinding) oBinding.filter(aFilters);
      }
    },

    onApriContrattiFornitoreReport: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("reportMain");
      var oFornitore = oCtx && oCtx.getObject();
      if (!oFornitore || !oFornitore.ID) return;
      if (!oFornitore.numeroContratti) return;
      var oModel = this.getOwnerComponent().getModel();
      oModel.bindList("/Contratto", {}).requestContexts(0, 2000)
        .then(function (aCtx) {
          var aRighe = (aCtx || [])
            .map(function (c) { return c.getObject(); })
            .filter(function (o) { return o.fornitore_ID === oFornitore.ID && o.stato !== 'ARCHIVIATO'; })
            .map(function (o) {
              var oRischio = dashboardUtils.buildRischioFornitore(oFornitore);
              return {
                ID: o.ID, codice: o.codice, intestatario: o.intestatario, responsabile: o.responsabile,
                oggetto: o.oggetto, categoria: o.categoria, stato: o.stato, importo: o.importo,
                dataStipula: o.dataStipula, dataScadenza: o.dataScadenza,
                rischioLabel: oRischio.label, rischioState: that._statoRischio(oRischio.livello)
              };
            });
          var oModel = that.getView().getModel("contrattiFornitoreReport");
          oModel.setProperty("/nome", oFornitore.nomeFornitore);
          oModel.setProperty("/righe", aRighe);
          that.byId("contrattiDrillReport").setVisible(true);
          var oDrillDom = that.byId("contrattiDrillReport").getDomRef();
          if (oDrillDom) oDrillDom.scrollIntoView({ block: "start", behavior: "smooth" });
        })
        .catch(function (err) {
          console.error("ReportFornitori drill load error", err);
        });
    },

    onDrillBackReport: function () {
      this.byId("contrattiDrillReport").setVisible(false);
    },

    onApriContrattoDettaglioReport: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("contrattiFornitoreReport");
      var sID = oCtx && oCtx.getProperty("ID");
      if (!sID) return;
      var sHash = this.getOwnerComponent().getRouter().getURL("detail", { id: encodeURIComponent(sID) });
      if (sHash.charAt(0) !== "#") {
        sHash = "#/" + sHash.replace(/^\//, "");
      }
      window.open(sHash, "_blank");
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    }
  });
});