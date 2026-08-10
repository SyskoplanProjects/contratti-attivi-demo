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
            stato: c.stato,
            importo: c.importo,
            categoria: c.categoria || "altro",
            esitoVerifica: c.esitoVerifica || "in_corso",
            dataStipula: c.dataStipula,
            dataScadenza: c.dataScadenza,
            intestatario: c.intestatario,
            responsabile: c.responsabile
          };
        });
        that._aContrattiTutti = contratti;
        that._aFornitoriTutti = fornitori;

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
      this.byId("dashboardTabBar").setSelectedKey("cockpit");
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
          var dData = new Date(c.dataStipula);
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
      var nDurataMs = dFineCorrente.getTime() - dInizioCorrente.getTime();
      var dFinePrecedente = new Date(dInizioCorrente.getTime() - 24 * 60 * 60 * 1000);
      var dInizioPrecedente = new Date(dFinePrecedente.getTime() - nDurataMs);
      return { inizio: dInizioPrecedente, fine: dFinePrecedente };
    },

    _formatDateISO: function (oDate) {
      return oDate.getFullYear() + "-" + ("0" + (oDate.getMonth() + 1)).slice(-2) + "-" + ("0" + oDate.getDate()).slice(-2);
    },

    _aggiornaTabella: function (oFiltriNonPeriodo, oDataDa, oDataA) {
      var oTable = this.byId("dettaglioContrattiTable");
      var oBinding = oTable && oTable.getBinding("items");
      if (!oBinding) return;
      var aFiltri = [new Filter({ path: "stato", operator: FilterOperator.NE, value1: "ARCHIVIATO" })];
      if (oFiltriNonPeriodo.categoria) {
        // "altro" sul client è un default (c.categoria || "altro") applicato anche alle righe
        // con categoria NULL nel DB: qui la query deve accettare entrambe, altrimenti la
        // tabella (server-side) e il cockpit (client-side) mostrano conteggi diversi.
        if (oFiltriNonPeriodo.categoria === "altro") {
          aFiltri.push(new Filter({
            filters: [
              new Filter({ path: "categoria", operator: FilterOperator.EQ, value1: "altro" }),
              new Filter({ path: "categoria", operator: FilterOperator.EQ, value1: null })
            ],
            and: false
          }));
        } else {
          aFiltri.push(new Filter({ path: "categoria", operator: FilterOperator.EQ, value1: oFiltriNonPeriodo.categoria }));
        }
      }
      if (oFiltriNonPeriodo.responsabile) {
        aFiltri.push(new Filter({ path: "responsabile", operator: FilterOperator.EQ, value1: oFiltriNonPeriodo.responsabile }));
      }
      if (oFiltriNonPeriodo.fornitore) {
        aFiltri.push(new Filter({ path: "intestatario", operator: FilterOperator.Contains, value1: oFiltriNonPeriodo.fornitore, caseSensitive: false }));
      }
      if (oDataDa) aFiltri.push(new Filter({ path: "dataStipula", operator: FilterOperator.GE, value1: this._formatDateISO(oDataDa) }));
      if (oDataA) aFiltri.push(new Filter({ path: "dataStipula", operator: FilterOperator.LE, value1: this._formatDateISO(oDataA) }));
      oBinding.filter(new Filter({ filters: aFiltri, and: true }));
    },

    _aggiornaCockpit: function (aContrattiCorrente, aContrattiPrecedente) {
      var ui = aggregateCockpit({ contratti: aContrattiCorrente, fornitori: this._aFornitoriTutti });
      var sTopFornitoriHtml = dashboardUtils.buildTopFornitoriHtml(ui.topFornitori, "importi");
      this.getView().setModel(new JSONModel({
        totaleContrattiAnno: ui.totaleContratti,
        importoTotaleAnno: ui.importoTotaleAnno,
        donutTipologiaHtml: dashboardUtils.buildDonutHtml(ui.donutTipologia),
        donutSurveyHtml: dashboardUtils.buildDonutHtml(ui.donutSurvey),
        trendHtml: dashboardUtils.buildTrendHtml(ui.trend)
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

    onApriContrattoDettaglio: function (oEvent) {
      var sID = oEvent.getSource().getBindingContext().getProperty("ID");
      if (!sID) return;
      var sHash = this.getOwnerComponent().getRouter().getURL("detail", { id: encodeURIComponent(sID) });
      window.open(sHash, "_blank");
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    }
  });
});