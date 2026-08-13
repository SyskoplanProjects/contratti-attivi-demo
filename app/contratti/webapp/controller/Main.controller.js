sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../formatter"
], function (BaseController, MessageBox, MessageToast, JSONModel, Filter, FilterOperator, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Main", {
    formatter: formatter,

    onInit: function () {
      this._initChatState();
      this._loadStat();
      var oRadioModel = new JSONModel({ selectedID: null });
      this.getView().setModel(oRadioModel, "radioSelect");
      this.getOwnerComponent().getRouter()
        .getRoute("main")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function () {
      var oTable = this.byId("contrattiTable");
      if (oTable) {
        var oBinding = oTable.getBinding("items");
        // isInitial(): true finché il primo caricamento non è completato. Tornando da
        // altre pagine (router interno) i dati sono già validi: il refresh forzato ad
        // ogni pattern match era un ri-fetch inutile verso il server.
        if (oBinding && oBinding.isInitial()) oBinding.refresh();
      }
      // Statistiche caricate una sola volta (e ritentate solo in caso di errore): gli
      // aggiornamenti dopo create/delete avvengono già in onCopiaContratto/onEliminaContratto.
      if (!this._bStatLoaded) {
        this._loadStat();
      }
    },

    onNavBack: function () {
      window.location.href = "/cockpit/webapp/index.html";
    },

    // Una sola richiesta con $select=stato (payload minimo, nessun blob) e conteggio
    // client-side: le 4 query $count separate erano 4 round trip verso HANA ad ogni
    // ritorno su Main, dove la latenza di rete domina il tempo di query.
    _loadStat: async function () {
      this._bStatLoaded = true;
      try {
        const oModel = this.getOwnerComponent().getModel();
        const oBinding = oModel.bindList("/Contratto", null, null, null, {
          $filter: "stato ne 'ARCHIVIATO'",
          $select: "stato"
        });
        const aCtx = await oBinding.requestContexts(0, 999);
        let bozza = 0, inRev = 0, approvato = 0;
        aCtx.forEach(function (c) {
          const s = c.getProperty("stato");
          if (s === "BOZZA") bozza++;
          else if (s === "IN_REVISIONE") inRev++;
          else if (s === "APPROVATO") approvato++;
        });
        this.getView().setModel(new sap.ui.model.json.JSONModel({
          totale: aCtx.length, bozza, inRevisione: inRev, approvato
        }), "stat");
        this._bStatLoaded = true;
      } catch (e) {
        this._bStatLoaded = false;
      }
    },


    onVediArchiviati: function () {
      this.getOwnerComponent().getRouter().navTo('archiviati');
    },

    onApriDashboard: function () {
      this.getOwnerComponent().getRouter().navTo('dashboard');
    },

    onTemplate: function () {
      this.getOwnerComponent().getRouter().navTo("template");
    },

    onClausole: function () {
      this.getOwnerComponent().getRouter().navTo("clausole");
    },

    onCreaManualmente: function () {
      window.location.href = "/inserimento/webapp/index.html#/manuale";
    },
    onCreaDaTemplate: function () {
      window.location.href = "/inserimento/webapp/index.html#/nuovoContratto";
    },
    onImportaAI: function () {
      window.location.href = "/inserimento/webapp/index.html#/import";
    },

    onSelectContratto: function (oEvent) {
      var oParams = oEvent.getParameters();
      var oBrowserEvent = oParams && (oParams.event$ || oParams.$event);
      if (oBrowserEvent) {
        var oTarget = oBrowserEvent.target || oBrowserEvent.srcElement;
        if (oTarget && (oTarget.classList.contains('sapMRb') || oTarget.closest('.sapMRb'))) {
          return;
        }
      }
      var sId = oEvent.getSource().getBindingContext().getProperty("ID");
      this._clearRadioSelection();
      window.open(window.location.pathname + "#/detail/" + encodeURIComponent(sId), "_blank");
    },

    onRadioSelect: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext();
      if (!oCtx) return;
      var sId = oCtx.getProperty("ID");
      this.getView().getModel("radioSelect").setProperty("/selectedID", sId);
    },

    _clearRadioSelection: function () {
      this.getView().getModel("radioSelect").setProperty("/selectedID", null);
    },

    onCopiaContratto: async function () {
      var sSelectedID = this.getView().getModel("radioSelect").getProperty("/selectedID");
      if (!sSelectedID) return;

      try {
        var oResp = await fetch("/contratti/duplicaContratto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contrattoID: sSelectedID })
        });
        if (!oResp.ok) {
          var oErr = await oResp.text();
          MessageBox.error("Errore copia contratto: " + oErr);
          return;
        }
        var oNew = await oResp.json();
        MessageToast.show("Contratto duplicato.");
        this._clearRadioSelection();
        this.byId("contrattiTable").getBinding("items").refresh();
        this._loadStat();
        var sNewID = oNew.ID || (oNew.value && oNew.value.ID);
        if (sNewID) {
          var sHash = this.getOwnerComponent().getRouter().getURL("detail", { id: encodeURIComponent(sNewID) });
          if (sHash.charAt(0) !== "#") {
            sHash = "#/" + sHash.replace(/^\//, "");
          }
          window.open(sHash, "_blank");
        }
      } catch (e) {
        MessageBox.error("Errore rete: " + e.message);
      }
    },

    onEliminaContratto: async function (oEvent) {
      oEvent.cancelBubble();
      const oContext = oEvent.getSource().getBindingContext();
      const sIntestatario = oContext.getProperty("intestatario");
      const sContrattoID = oContext.getProperty("ID");
      MessageBox.confirm(`Eliminare il contratto "${sIntestatario}"?`, {
        title: "Conferma eliminazione",
        actions: ["Elimina", "Annulla"],
        emphasizedAction: "Annulla",
        onClose: async (sAction) => {
          if (sAction !== "Elimina") return;
          try {
            const oModel = this.getOwnerComponent().getModel();
            const sUrl = oModel.getServiceUrl() + `Contratto(${sContrattoID})`;
            const oResp = await fetch(sUrl, { method: "DELETE" });
            if (!oResp.ok) {
              const e = await oResp.text();
              throw new Error(e || `HTTP ${oResp.status}`);
            }
            MessageToast.show("Contratto eliminato.");
            this.byId("contrattiTable").getBinding("items").refresh();
            this._loadStat();
          } catch (e) {
            MessageBox.error("Errore eliminazione: " + (e.message || String(e)));
          }
        }
      });
    },

    onFilter: function () {
      var aFilters = [];

      var sIntestatario = this.byId("filterIntestatario").getValue().trim();
      if (sIntestatario) {
        aFilters.push(new Filter({ path: "intestatario", operator: FilterOperator.Contains, value1: sIntestatario, caseSensitive: false }));
      }

      var sStato = this.byId("filterStato").getSelectedKey();
      if (sStato) {
        aFilters.push(new Filter("stato", FilterOperator.EQ, sStato));
      }

      var sResponsabile = this.byId("filterResponsabile").getValue().trim();
      if (sResponsabile) {
        aFilters.push(new Filter({ path: "responsabile", operator: FilterOperator.Contains, value1: sResponsabile, caseSensitive: false }));
      }

      var oDataDa = this.byId("filterDataDa").getDateValue();
      if (oDataDa) {
        aFilters.push(new Filter("dataStipula", FilterOperator.GE, _fmtDate(oDataDa)));
      }

      var oDataA = this.byId("filterDataA").getDateValue();
      if (oDataA) {
        aFilters.push(new Filter("dataStipula", FilterOperator.LE, _fmtDate(oDataA)));
      }

      var oBinding = this.byId("contrattiTable").getBinding("items");
      if (oBinding) {
        oBinding.filter(aFilters.length ? aFilters : null);
      }
    },

    onResetFiltri: function () {
      this.byId("filterIntestatario").setValue("");
      this.byId("filterStato").setSelectedKey("");
      this.byId("filterResponsabile").setValue("");
      this.byId("filterDataDa").setValue("");
      this.byId("filterDataA").setValue("");
      this.onFilter();
    }
  });

  function _fmtDate(oDate) {
    if (!oDate) return "";
    var y = oDate.getFullYear();
    var m = ("0" + (oDate.getMonth() + 1)).slice(-2);
    var d = ("0" + oDate.getDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }
});
