sap.ui.define(["./BaseController", "sap/m/MessageBox"],
function (BaseController, MessageBox) {
  "use strict";
  return BaseController.extend("com.reply.contrattiattivi.comparator.controller.Dashboard", {
    onInit: function () {
      var oModel = new sap.ui.model.json.JSONModel({ kpi: {}, andamento: [], anomalie: [] });
      this.getView().setModel(oModel);
      this._oFile = null;
      this._loadDashboard();
    },

    onRefresh: function () { this._loadDashboard(); },

    _loadDashboard: async function () {
      var that = this;
      try {
        var oKpiResp = await fetch("/comparator/getDashboardKPIs", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        if (!oKpiResp.ok) { MessageBox.error("Errore KPI: " + await oKpiResp.text()); return; }
        var oKpi = await oKpiResp.json();

        var sStato = this.byId("filtroStato") ? this.byId("filtroStato").getSelectedKey() : "";
        var sTipo = this.byId("filtroTipo") ? this.byId("filtroTipo").getSelectedKey() : "";
        var oAnomResp = await fetch("/comparator/getAnomalie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato: sStato || null, tipo: sTipo || null })
        });
        if (!oAnomResp.ok) { MessageBox.error("Errore anomalie: " + await oAnomResp.text()); return; }
        var oAnom = await oAnomResp.json();
        var aAnomalie = (oAnom && oAnom.value) || [];

        this.getView().getModel().setData({ kpi: oKpi, andamento: oKpi.andamento || [], anomalie: aAnomalie });
      } catch (e) {
        MessageBox.error("Errore caricamento dashboard: " + e.message);
      }
    },

    onFiltroChange: function () { this._loadDashboard(); },

    _selectedRow: function (oEvent) {
      var oTable = this.byId("anomalieTable");
      var oCtx = oTable.getSelectedItem() && oTable.getSelectedItem().getBindingContext();
      return oCtx ? oCtx.getObject() : null;
    },

    onAssegna: function (oEvent) {
      var oRow = oEvent.getSource().getBindingContext().getObject();
      this._sCurrentAnomaliaID = oRow.anomaliaID;
      this.byId("assegnatarioInput").setValue("");
      this.byId("assegnaDialog").open();
    },

    onAssegnaConfirm: async function () {
      var sAssegnatario = this.byId("assegnatarioInput").getValue();
      if (!sAssegnatario) { MessageBox.error("Inserisci l'assegnatario."); return; }
      try {
        var oResp = await fetch("/comparator/assegnaAnomalia", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anomaliaID: this._sCurrentAnomaliaID, assegnatario: sAssegnatario })
        });
        if (!oResp.ok) { MessageBox.error("Errore: " + await oResp.text()); return; }
        this.byId("assegnaDialog").close();
        this._loadDashboard();
      } catch (e) { MessageBox.error("Errore: " + e.message); }
    },

    onAvviaLavorazione: async function (oEvent) {
      var sAnomaliaID = oEvent.getSource().getBindingContext().getObject().anomaliaID;
      try {
        var oResp = await fetch("/comparator/avviaLavorazione", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anomaliaID: sAnomaliaID })
        });
        if (!oResp.ok) { MessageBox.error("Errore: " + await oResp.text()); return; }
        this._loadDashboard();
      } catch (e) { MessageBox.error("Errore: " + e.message); }
    },

    onRisolvi: function (oEvent) {
      this._sCurrentAnomaliaID = oEvent.getSource().getBindingContext().getObject().anomaliaID;
      this.byId("notaTextArea").setValue("");
      this.byId("fileUploader").clear();
      this._oFile = null;
      this.byId("risolviDialog").open();
    },

    onFileChange: function (oEvent) {
      var aFiles = oEvent.getParameter("files");
      this._oFile = aFiles && aFiles[0];
    },

    onRisolviConfirm: async function () {
      var that = this;
      var sNota = this.byId("notaTextArea").getValue();
      var sFile = null, sFilename = null;
      try {
        if (this._oFile) {
          sFilename = this._oFile.name;
          sFile = await this._fileToBase64(this._oFile);
        }
        var oResp = await fetch("/comparator/risolviAnomalia", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anomaliaID: this._sCurrentAnomaliaID, nota: sNota, file: sFile, filename: sFilename })
        });
        if (!oResp.ok) { MessageBox.error("Errore: " + await oResp.text()); return; }
        this.byId("risolviDialog").close();
        this._loadDashboard();
      } catch (e) { MessageBox.error("Errore: " + e.message); }
    },

    onChiudi: function (oEvent) {
      this._sCurrentAnomaliaID = oEvent.getSource().getBindingContext().getObject().anomaliaID;
      this.byId("chiudiNotaTextArea").setValue("");
      this.byId("chiudiDialog").open();
    },

    onChiudiConfirm: async function () {
      var sNota = this.byId("chiudiNotaTextArea").getValue();
      try {
        var oResp = await fetch("/comparator/chiudiAnomalia", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anomaliaID: this._sCurrentAnomaliaID, nota: sNota })
        });
        if (!oResp.ok) { MessageBox.error("Errore: " + await oResp.text()); return; }
        this.byId("chiudiDialog").close();
        this._loadDashboard();
      } catch (e) { MessageBox.error("Errore: " + e.message); }
    },

    onDialogClose: function () {
      this.byId("assegnaDialog").close();
      this.byId("risolviDialog").close();
      this.byId("chiudiDialog").close();
    },

    onNavBack: function () {
      window.location.href = "/cockpit/webapp/index.html";
    },

    _fileToBase64: function (oFile) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result.split(",")[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(oFile);
      });
    }
  });
});
