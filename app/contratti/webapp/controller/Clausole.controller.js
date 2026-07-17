sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "../formatter"
], function (BaseController, MessageBox, MessageToast, Filter, FilterOperator, formatter) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Clausole", {
    formatter: formatter,

    onInit: function () {
      this._initChatState();
    },

    onNavBack: function () {
      window.location.href = "/cockpit/webapp/index.html";
    },

    onStoricoClausola: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext();
      this._apriDialogStorico(oContext.getProperty("ID"));
    },

    onContrattiClausola: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext();
      this._apriDialogContrattiClausola(oContext.getProperty("ID"));
    },

    onNuovaClausola: async function () {
      const oModel = this.getOwnerComponent().getModel();
      let aClausole = [];
      try {
        const oResp = await fetch(oModel.getServiceUrl() + "Clausola?$select=ID,codice,titolo,origineDettaglio&$orderby=codice");
        const oJson = await oResp.json();
        aClausole = oJson.value || [];
      } catch (e) { /* la picklist "basa su esistente" resta vuota, la creazione da zero funziona comunque */ }

      const oInpCodice = new sap.m.Input({ placeholder: "es. C15" });
      const oInpTitolo = new sap.m.Input({ placeholder: "Titolo clausola" });
      const oTaTesto = new sap.m.TextArea({ width: "100%", rows: 6, placeholder: "Testo della clausola" });
      const oTxtOrigine = new sap.m.Text({ text: "" }).addStyleClass("sapUiTinyMarginBottom");
      let sBaseID = "";
      let aVersioniBase = [];

      const oSelVersione = new sap.m.Select({
        forceSelection: false,
        width: "100%",
        enabled: false,
        change: (oEvent) => {
          const sVersioneID = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
          const oVersione = aVersioniBase.find(v => v.ID === sVersioneID);
          oTaTesto.setValue(oVersione ? oVersione.testo : "");
        }
      });

      const oSelBase = new sap.m.Select({
        forceSelection: false,
        width: "100%",
        items: [new sap.ui.core.Item({ key: "", text: "-- scrivi da zero --" })]
          .concat(aClausole.map(c => new sap.ui.core.Item({ key: c.ID, text: `${c.codice} — ${c.titolo}` }))),
        change: async (oEvent) => {
          const sKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
          sBaseID = sKey;
          const bBaseSelezionata = !!sKey;
          oInpCodice.setEnabled(!bBaseSelezionata);
          oInpTitolo.setEnabled(!bBaseSelezionata);
          aVersioniBase = [];
          oSelVersione.destroyItems();
          oSelVersione.setEnabled(false);
          if (!bBaseSelezionata) {
            oInpCodice.setValue("");
            oInpTitolo.setValue("");
            oTaTesto.setValue("");
            oTxtOrigine.setText("");
            return;
          }
          const oClausolaSel = aClausole.find(c => c.ID === sKey);
          oTxtOrigine.setText(oClausolaSel ? ("Oggetto: " + (oClausolaSel.origineDettaglio || "Manuale")) : "");
          try {
            const oResp = await fetch(oModel.getServiceUrl() + `ClausolaVersione?$filter=clausola_ID eq ${sKey}&$orderby=numero desc`);
            const oJson = await oResp.json();
            aVersioniBase = oJson.value || [];
            aVersioniBase.forEach(v => oSelVersione.addItem(new sap.ui.core.Item({ key: v.ID, text: `Versione ${v.numero}` })));
            oSelVersione.setEnabled(aVersioniBase.length > 0);
            const oUltima = aVersioniBase[0];
            if (oUltima) oSelVersione.setSelectedKey(oUltima.ID);
            oTaTesto.setValue(oUltima ? oUltima.testo : "");
          } catch (e) {
            MessageBox.error("Errore caricamento versioni base: " + (e.message || String(e)));
          }
        }
      });

      var fnCentered = function (oControl, sLabel) {
        return new sap.m.VBox({ items: [
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.Label({ text: sLabel, labelFor: oControl.getId() }).addStyleClass("sapUiTinyMarginTop")] }),
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.VBox({ width: "95%", items: [oControl] })] })
        ]});
      };

      var oFormFields = new sap.m.VBox({ items: [
        fnCentered(oSelBase, "Basa su clausola esistente (opzionale)"),
        new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.VBox({ width: "95%", items: [oTxtOrigine] })] }),
        fnCentered(oSelVersione, "Versione di partenza"),
        fnCentered(oInpCodice, "Codice"),
        fnCentered(oInpTitolo, "Titolo"),
        fnCentered(oTaTesto, "Testo")
      ]});

      const oDialog = new sap.m.Dialog({
        title: "Nuova clausola",
        contentWidth: "40rem",
        content: [oFormFields],
        beginButton: new sap.m.Button({
          text: "Crea",
          press: async () => {
            const sTesto = oTaTesto.getValue();
            if (!sTesto) {
              MessageBox.error("Il testo è obbligatorio.");
              return;
            }
            const oParams = { testo: sTesto };
            if (sBaseID) {
              oParams.clausolaBaseID = sBaseID;
            } else {
              const sCodice = oInpCodice.getValue();
              const sTitolo = oInpTitolo.getValue();
              if (!sCodice || !sTitolo) {
                MessageBox.error("Codice e titolo sono obbligatori quando si scrive da zero.");
                return;
              }
              oParams.codice = sCodice;
              oParams.titolo = sTitolo;
            }
            try {
              const oBinding = oModel.bindContext("/creaClausola(...)");
              Object.keys(oParams).forEach(k => oBinding.setParameter(k, oParams[k]));
              await oBinding.execute();
              MessageToast.show(sBaseID ? "Nuova versione creata." : "Clausola creata.");
              this.byId("tabellaAnagraficaClausole").getBinding("items").refresh();
              oDialog.close();
            } catch (e) {
              MessageBox.error(e.message || String(e));
            }
          }
        }),
        endButton: new sap.m.Button({ text: "Annulla", press: () => oDialog.close() }),
        afterClose: () => oDialog.destroy()
      });
      oDialog.open();
    },

    onEliminaClausola: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext();
      const sID = oContext.getProperty("ID");
      const sCodice = oContext.getProperty("codice");
      const sTitolo = oContext.getProperty("titolo");
      sap.m.MessageBox.confirm("Eliminare clausola " + sCodice + " - " + sTitolo + "?", {
        title: "Elimina clausola",
        actions: ["Elimina", "Annulla"],
        onClose: async function (sAction) {
          if (sAction !== "Elimina") return;
          try {
            const oResp = await fetch("/contratti/cancellaClausola", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clausolaID: sID })
            });
            if (!oResp.ok) {
              const oErr = await oResp.json();
              throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
            }
            MessageToast.show("Clausola eliminata.");
            this.byId("tabellaAnagraficaClausole").getBinding("items").refresh();
          } catch (e) {
            MessageBox.error("Errore: " + (e.message || String(e)));
          }
        }.bind(this)
      });
    },

    onEliminaTemplate: async function () {
      const oModel = this.getOwnerComponent().getModel();
      let aTemplate = [];
      try {
        const oResp = await fetch(oModel.getServiceUrl() + "Template?$select=ID,nome&$orderby=nome");
        const oJson = await oResp.json();
        aTemplate = oJson.value || [];
      } catch (e) {
        MessageBox.error("Errore caricamento template: " + (e.message || String(e)));
        return;
      }
      if (!aTemplate.length) {
        MessageBox.information("Nessun template presente.");
        return;
      }

      const oSelTemplate = new sap.m.Select({
        forceSelection: false,
        width: "100%",
        items: [new sap.ui.core.Item({ key: "", text: "-- scegli template --" })]
          .concat(aTemplate.map(t => new sap.ui.core.Item({ key: t.ID, text: t.nome })))
      });

      const oDialog = new sap.m.Dialog({
        title: "Elimina template",
        contentWidth: "30rem",
        content: [new sap.m.VBox({ items: [
          new sap.m.Label({ text: "Template", labelFor: oSelTemplate.getId() }).addStyleClass("sapUiTinyMarginBottom"),
          oSelTemplate
        ]}).addStyleClass("sapUiSmallMargin")],
        beginButton: new sap.m.Button({
          text: "Elimina",
          type: "Reject",
          press: () => {
            const sTemplateID = oSelTemplate.getSelectedKey();
            const sTemplateNome = oSelTemplate.getSelectedItem() ? oSelTemplate.getSelectedItem().getText() : "";
            if (!sTemplateID) {
              MessageBox.error("Seleziona un template.");
              return;
            }
            oDialog.close();
            sap.m.MessageBox.confirm("Eliminare template \"" + sTemplateNome + "\" e tutte le clausole associate?", {
              title: "Elimina template",
              actions: ["Elimina", "Annulla"],
              onClose: async function (sAction) {
                if (sAction !== "Elimina") return;
                try {
                  const oResp = await fetch("/contratti/cancellaTemplate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ templateID: sTemplateID })
                  });
                  if (!oResp.ok) {
                    const oErr = await oResp.json();
                    throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
                  }
                  MessageToast.show("Template eliminato.");
                  this.byId("tabellaAnagraficaClausole").getBinding("items").refresh();
                } catch (e) {
                  MessageBox.error("Errore: " + (e.message || String(e)));
                }
              }.bind(this)
            });
          }
        }),
        endButton: new sap.m.Button({ text: "Annulla", press: () => oDialog.close() }),
        afterClose: () => oDialog.destroy()
      });
      oDialog.open();
    },

    onCaricaDaTemplate: async function () {
      var oFile = null;

      const oFileUploader = new sap.ui.unified.FileUploader({
        buttonText: "Scegli file",
        placeholder: "Nessun file selezionato",
        width: "100%",
        change: function (oEvent) {
          var aFiles = oEvent.getParameter("files");
          oFile = aFiles && aFiles[0];
        }
      });

      var fnCentered = function (oControl, sLabel) {
        return new sap.m.VBox({ items: [
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.Label({ text: sLabel, labelFor: oControl.getId() }).addStyleClass("sapUiTinyMarginTop")] }),
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.VBox({ width: "95%", items: [oControl] })] })
        ]});
      };

      const oDialog = new sap.m.Dialog({
        title: "Carica da template",
        contentWidth: "35rem",
        content: [fnCentered(oFileUploader, "File Word (.docx)")],
        beginButton: new sap.m.Button({
          text: "Crea template",
          type: "Emphasized",
          press: async function () {
            if (!oFile) {
              MessageBox.error("Seleziona un file Word.");
              return;
            }
            if (!oFile.name.toLowerCase().endsWith('.docx')) {
              MessageBox.error("Formato non supportato. Carica un file .docx.");
              return;
            }
            try {
              const oFormData = new FormData();
              oFormData.append("file", oFile, oFile.name);
              const oResp = await fetch("/contratti/importTemplate", {
                method: "POST",
                body: oFormData
              });
              if (!oResp.ok) {
                const oErr = await oResp.json();
                throw new Error((oErr.error && oErr.error.message) || oErr.message || ("HTTP " + oResp.status));
              }
              const oResult = await oResp.json();
              MessageToast.show("Template creato con " + oResult.clausoleCreate + " clausole.");
              oDialog.close();
              this.byId("tabellaAnagraficaClausole").getBinding("items").refresh();
            } catch (e) {
              MessageBox.error("Import fallito: " + (e.message || String(e)));
            }
          }.bind(this)
        }),
        endButton: new sap.m.Button({ text: "Annulla", press: () => oDialog.close() }),
        afterClose: () => oDialog.destroy()
      });
      oDialog.open();
    },

    onComparaClausole: async function () {
      const oModel = this.getOwnerComponent().getModel();
      let aClausole = [];
      try {
        const oResp = await fetch(oModel.getServiceUrl() + "Clausola?$select=ID,codice,titolo,origineDettaglio&$orderby=codice");
        const oJson = await oResp.json();
        aClausole = oJson.value || [];
      } catch (e) {
        MessageBox.error("Errore caricamento clausole: " + (e.message || String(e)));
        return;
      }

      const fnCreaColonna = () => {
        let sVersioneID = "";
        const oSelVersione = new sap.m.Select({ forceSelection: false, width: "100%", enabled: false });
        const oTxtOrigine = new sap.m.Text({ text: "" }).addStyleClass("sapUiTinyMarginBottom");
        const oSelClausola = new sap.m.Select({
          forceSelection: false,
          width: "100%",
          items: [new sap.ui.core.Item({ key: "", text: "-- scegli clausola --" })]
            .concat(aClausole.map(c => new sap.ui.core.Item({ key: c.ID, text: `${c.codice} — ${c.titolo}` }))),
          change: async (oEvent) => {
            const sClausolaID = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
            sVersioneID = "";
            oSelVersione.destroyItems();
            oSelVersione.setEnabled(false);
            const oClausolaSel = aClausole.find(c => c.ID === sClausolaID);
            oTxtOrigine.setText(oClausolaSel ? ("Oggetto: " + (oClausolaSel.origineDettaglio || "Manuale")) : "");
            fnAggiornaStatoConferma();
            if (!sClausolaID) return;
            try {
              const oResp = await fetch(oModel.getServiceUrl() + `ClausolaVersione?$filter=clausola_ID eq ${sClausolaID}&$orderby=numero desc`);
              const oJson = await oResp.json();
              const aVersioni = oJson.value || [];
              aVersioni.forEach((v, i) => oSelVersione.addItem(new sap.ui.core.Item({ key: v.ID, text: `Versione ${v.numero}` })));
              oSelVersione.setEnabled(aVersioni.length > 0);
              if (aVersioni.length) {
                oSelVersione.setSelectedKey(aVersioni[0].ID);
                sVersioneID = aVersioni[0].ID;
              }
              fnAggiornaStatoConferma();
            } catch (e) {
              MessageBox.error("Errore caricamento versioni: " + (e.message || String(e)));
            }
          }
        });
        oSelVersione.attachChange((oEvent) => {
          sVersioneID = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
          fnAggiornaStatoConferma();
        });
        return {
          box: new sap.m.HBox({
            justifyContent: "Center",
            items: [
              new sap.m.VBox({
                width: "95%",
                items: [oSelClausola, oTxtOrigine, oSelVersione]
              })
            ]
          }).addStyleClass("sapUiSmallMarginBottom"),
          getVersioneID: () => sVersioneID
        };
      };

      const oColA = fnCreaColonna();
      const oColB = fnCreaColonna();
      const oBtnConfronta = new sap.m.Button({ text: "Confronta", enabled: false, type: "Emphasized" });
      const fnAggiornaStatoConferma = () => {
        oBtnConfronta.setEnabled(!!oColA.getVersioneID() && !!oColB.getVersioneID());
      };

      const oDialog = new sap.m.Dialog({
        title: "Compara clausole",
        contentWidth: "50rem",
        content: [
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.Label({ text: "Clausola A" })] }),
          oColA.box,
          new sap.m.HBox({ justifyContent: "Center", items: [new sap.m.Label({ text: "Clausola B" }).addStyleClass("sapUiTinyMarginTop")] }),
          oColB.box
        ],
        beginButton: oBtnConfronta,
        endButton: new sap.m.Button({ text: "Annulla", press: () => oDialog.close() }),
        afterClose: () => oDialog.destroy()
      });
      oBtnConfronta.attachPress(async () => {
        try {
          const oBinding = oModel.bindContext("/confrontaVersioni(...)")
            .setParameter("versioneID1", oColA.getVersioneID())
            .setParameter("versioneID2", oColB.getVersioneID());
          await oBinding.execute();
          const oData = oBinding.getBoundContext().getObject();
          if (!this._pConfronto) {
            this._pConfronto = this.loadFragment({ name: "com.reply.contrattiattivi.app.fragment.ConfrontoVersioni" });
          }
          this._pConfronto.then(oConfrontoDialog => {
            oConfrontoDialog.setModel(new sap.ui.model.json.JSONModel(oData), "confronto");
            oConfrontoDialog.open();
          });
          oDialog.close();
        } catch (e) {
          MessageBox.error(e.message || String(e));
        }
      });
      oDialog.open();
    },

    onFilter: function () {
      var aFilters = [];

      var sCodice = this.byId("filterCodice").getValue().trim();
      if (sCodice) {
        aFilters.push(new Filter({ path: "codice", operator: FilterOperator.Contains, value1: sCodice, caseSensitive: false }));
      }

      var sTitolo = this.byId("filterTitolo").getValue().trim();
      if (sTitolo) {
        aFilters.push(new Filter({ path: "titolo", operator: FilterOperator.Contains, value1: sTitolo, caseSensitive: false }));
      }

      var sOrigine = this.byId("filterOrigine").getValue().trim().toLowerCase();
      var sIDClausola = this.byId("filterIDClausola").getValue().trim().toLowerCase();
      var oBinding = this.byId("tabellaAnagraficaClausole").getBinding("items");
      if (oBinding) {
        // Codice e Titolo filtrabili via OData; Origine e ID Clausola sono client-side (campi virtual/calcolati, non filtrabili lato server)
        oBinding.filter(aFilters.length ? aFilters : null);
      }

      // Filtri Origine e ID Clausola applicati lato client dopo il refresh OData
      var oTable = this.byId("tabellaAnagraficaClausole");
      oTable.getItems().forEach(function (oItem) {
        var oCtx = oItem.getBindingContext();
        if (!oCtx) return;
        var bVisible = true;
        if (sOrigine) {
          var sOrigineRiga = (oCtx.getProperty("origineDettaglio") || "").toLowerCase();
          bVisible = bVisible && sOrigineRiga.indexOf(sOrigine) >= 0;
        }
        if (sIDClausola) {
          var sIDRiga = formatter.ultimaVersioneID(oCtx.getObject().versioni).toLowerCase();
          bVisible = bVisible && sIDRiga.indexOf(sIDClausola) >= 0;
        }
        oItem.setVisible(bVisible);
      });
    },

    onResetFiltri: function () {
      this.byId("filterIDClausola").setValue("");
      this.byId("filterCodice").setValue("");
      this.byId("filterTitolo").setValue("");
      this.byId("filterOrigine").setValue("");
      this.onFilter();
    }
  });
});
