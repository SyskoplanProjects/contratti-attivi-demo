sap.ui.define([
  "./BaseController",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/ui/layout/VerticalLayout",
  "../formatter",
  "./MetadataWizardHelper"
], function (BaseController, MessageBox, MessageToast, JSONModel, VerticalLayout, formatter, metadataWizardHelper) {
  "use strict";

  return BaseController.extend("com.reply.contrattiattivi.app.controller.Detail", {
    formatter: formatter,
    metadataWizardHelper: metadataWizardHelper,

    onInit: function () {
      this._initChatState();
      this.getView().setModel(new JSONModel({}), "contesto");
      this._caricaCategorie();
      this.getOwnerComponent().getRouter()
        .getRoute("detail")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    _caricaCategorie: async function () {
      const oOwnerModel = this.getOwnerComponent().getModel();
      const oResp = await fetch(oOwnerModel.getServiceUrl() + "getCategorieContratto()");
      const oJson = await oResp.json();
      this.getView().setModel(new JSONModel(oJson.value || []), "categorie");
    },

    _onRouteMatched: function (oEvent) {
      const sId = decodeURIComponent(oEvent.getParameter("arguments").id);
      this._contrattoID = sId;
      this._caricaContesto();
    },

    _caricaContesto: async function () {
      try {
        const oOwnerModel = this.getOwnerComponent().getModel();
        const sUrl = oOwnerModel.getServiceUrl()
          + `Contratto?$filter=ID eq ${this._contrattoID}&$expand=clausole($expand=clausolaVersione,clausola)&$top=1`;
        const oResp = await fetch(sUrl);
        if (!oResp.ok) { MessageBox.error("HTTP " + oResp.status); return; }
        const oJson = await oResp.json();
        if (!oJson.value || !oJson.value.length) { MessageBox.error("Nessun contratto trovato"); return; }
        const oContratto = oJson.value[0];
        this.getView().getModel("contesto").setData(oContratto);
        await this._segnalaClausoleVecchie(oContratto);
      } catch (e) {
        MessageBox.error("Errore caricamento: " + (e.message || String(e)));
      }
    },

    // Segnala se il template ha una versione più recente di quella usata dal contratto.
    _segnalaClausoleVecchie: async function (oContratto) {
      const oModel = this.getOwnerComponent().getModel();
      const oContestoModel = this.getView().getModel("contesto");

      try {
        const oResp = await fetch(oModel.getServiceUrl() + `Template(${oContratto.template_ID})?$expand=versioni`);
        if (oResp.ok) {
          const oTemplate = await oResp.json();
          const iMax = (oTemplate.versioni || []).reduce((m, v) => Math.max(m, v.numero), 0);
          const oVersioneUsata = (oTemplate.versioni || []).find(v => v.ID === oContratto.templateVersion_ID);
          oContestoModel.setProperty("/templateVersioneCorrente", iMax);
          oContestoModel.setProperty("/templateVersioneUsata", oVersioneUsata ? oVersioneUsata.numero : null);
        }
      } catch (e) { /* non bloccante */ }
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("main");
    },

    onRimuoviClausola: async function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext("contesto");
      const contrattoClausolaID = oContext.getProperty("ID");
      try {
        await this.getOwnerComponent().getModel()
          .bindContext(`/Contratto(${this._contrattoID})/ContrattiService.rimuoviClausola(...)`)
          .setParameter("contrattoClausolaID", contrattoClausolaID)
          .execute();
        MessageToast.show("Clausola rimossa.");
        this._caricaContesto();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onStoricoClausolaDetail: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext("contesto");
      this._apriDialogStorico(oContext.getProperty("clausola/ID"));
    },

    onModificaClausola: function (oEvent) {
      const oContext = oEvent.getSource().getBindingContext("contesto");
      const sTestoAttuale = oContext.getProperty("clausolaVersione/testo");
      const oDialog = new sap.m.Dialog({
        title: "Modifica testo clausola",
        content: new sap.m.TextArea({ id: "taNuovoTesto", value: sTestoAttuale, width: "100%", rows: 8 }),
        beginButton: new sap.m.Button({
          text: "Salva",
          press: async () => {
            const sNuovoTesto = sap.ui.getCore().byId("taNuovoTesto").getValue();
            try {
              await this.getOwnerComponent().getModel()
                .bindContext(`/Contratto(${this._contrattoID})/ContrattiService.modificaClausolaTesto(...)`)
                .setParameter("contrattoClausolaID", oContext.getProperty("ID"))
                .setParameter("nuovoTesto", sNuovoTesto)
                .execute();
              MessageToast.show("Clausola aggiornata (nuova versione creata).");
              this._caricaContesto();
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

    onAggiungiClausola: async function () {
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
      let sVersioneSelezionataID = "";
      let sVersioneSelezionataTesto = "";

      const oSelVersione = new sap.m.Select({ forceSelection: false, width: "100%", enabled: false });
      oSelVersione.attachChange((oEvent) => {
        const sKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
        sVersioneSelezionataID = sKey;
        const oItem = oEvent.getParameter("selectedItem");
        sVersioneSelezionataTesto = oItem ? oItem.data("testo") : "";
        oTaTesto.setValue(sVersioneSelezionataTesto);
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
          oSelVersione.destroyItems();
          oSelVersione.setEnabled(false);
          sVersioneSelezionataID = "";
          sVersioneSelezionataTesto = "";
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
            const aVersioni = oJson.value || [];
            aVersioni.forEach(v => {
              const oItem = new sap.ui.core.Item({ key: v.ID, text: `Versione ${v.numero}` });
              oItem.data("testo", v.testo);
              oSelVersione.addItem(oItem);
            });
            oSelVersione.setEnabled(aVersioni.length > 0);
            if (aVersioni.length) {
              oSelVersione.setSelectedKey(aVersioni[0].ID);
              sVersioneSelezionataID = aVersioni[0].ID;
              sVersioneSelezionataTesto = aVersioni[0].testo;
              oTaTesto.setValue(aVersioni[0].testo);
            }
          } catch (e) {
            MessageBox.error("Errore caricamento versioni: " + (e.message || String(e)));
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
            try {
              // Versione esistente scelta e non modificata: aggancia direttamente al contratto,
              // nessuna nuova versione della clausola viene creata.
              if (sBaseID && sVersioneSelezionataID && sTesto === sVersioneSelezionataTesto) {
                await oModel.bindContext(`/Contratto(${this._contrattoID})/ContrattiService.aggiungiClausola(...)`)
                  .setParameter("clausolaVersioneID", sVersioneSelezionataID)
                  .execute();
                MessageToast.show("Clausola aggiunta al contratto.");
                this._caricaContesto();
                oDialog.close();
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
              const oBinding = oModel.bindContext("/creaClausola(...)");
              Object.keys(oParams).forEach(k => oBinding.setParameter(k, oParams[k]));
              await oBinding.execute();
              const sClausolaID = oBinding.getBoundContext().getProperty("ID");

              const oRespVersione = await fetch(oModel.getServiceUrl()
                + `ClausolaVersione?$filter=clausola_ID eq ${sClausolaID}&$orderby=numero desc&$top=1`);
              const oJsonVersione = await oRespVersione.json();
              const oUltimaVersione = (oJsonVersione.value || [])[0];
              if (!oUltimaVersione) throw new Error("Versione clausola non trovata dopo la creazione.");

              await oModel.bindContext(`/Contratto(${this._contrattoID})/ContrattiService.aggiungiClausola(...)`)
                .setParameter("clausolaVersioneID", oUltimaVersione.ID)
                .execute();

              MessageToast.show(sBaseID ? "Nuova versione creata e aggiunta al contratto." : "Clausola creata e aggiunta al contratto.");
              this._caricaContesto();
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

    onConfronta: async function () {
      const oModel = this.getOwnerComponent().getModel();
      let aClausole = [];
      try {
        const oResp = await fetch(oModel.getServiceUrl() + "Clausola?$select=ID,codice,titolo&$orderby=codice");
        const oJson = await oResp.json();
        aClausole = oJson.value || [];
      } catch (e) {
        MessageBox.error("Errore caricamento clausole: " + (e.message || String(e)));
        return;
      }

      const fnCreaColonna = () => {
        let sVersioneID = "";
        const oSelVersione = new sap.m.Select({ forceSelection: false, width: "100%", enabled: false });
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
                items: [oSelClausola, oSelVersione]
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

    onEsportaContratto: function () {
      window.open('/contratti/esportaContratto/' + this._contrattoID, '_blank');
    },

    onMostraAllegati: async function () {
      try {
        if (!this._pAllegatiContratto) {
          this._pAllegatiContratto = this.loadFragment({ name: 'com.reply.contrattiattivi.app.fragment.AllegatiContratto' });
        }
        const oDialog = await this._pAllegatiContratto;

        if (!oDialog.getModel('tipologie')) {
          fetch('/comparator/getTipologieAllegato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(oResp => oResp.json())
            .then(oData => oDialog.setModel(new JSONModel({ value: oData.value || [] }), 'tipologie'))
            .catch(() => console.warn('Impossibile caricare le tipologie allegato'));
        }

        await this._ricaricaAllegatiContratto(oDialog);
        oDialog.open();
      } catch (e) {
        MessageBox.error('Errore caricamento allegati: ' + (e.message || String(e)));
      }
    },

    _ricaricaAllegatiContratto: async function (oDialog) {
      const oModel = this.getOwnerComponent().getModel();
      const oResp = await fetch(oModel.getServiceUrl() + `ContrattoAllegato?$filter=contratto_ID eq ${this._contrattoID}`);
      const oData = await oResp.json();
      oDialog.setModel(new JSONModel({ allegati: oData.value || [], nuovoAllegato: null }), 'allegatiContratto');
    },

    onNuovoAllegatoChange: async function (oEvent) {
      const oFile = (oEvent.getParameter('files') || [])[0];
      if (!oFile) return;
      const oDialog = await this._pAllegatiContratto;
      const oModel = oDialog.getModel('allegatiContratto');

      const oBusy = new sap.m.BusyDialog({ text: 'Riconoscimento tipo documento in corso...' });
      oBusy.open();
      try {
        const sBase64 = await this._fileToBase64(oFile);
        const oOwnerModel = this.getOwnerComponent().getModel();
        const oBinding = oOwnerModel.bindContext('/classificaAllegatoContratto(...)')
          .setParameter('filename', oFile.name)
          .setParameter('file', sBase64);
        await oBinding.execute();
        const oResult = oBinding.getBoundContext().getObject();
        oModel.setProperty('/nuovoAllegato', {
          filename: oFile.name, file: sBase64,
          tipo: oResult.tipo, confidenza: oResult.confidenza,
          metodoRiconoscimento: oResult.metodoRiconoscimento, testo: oResult.testo
        });

        const aMetadati = (oResult.metadati || []).map(function (m) {
          return Object.assign({}, m, { modificatoManualmente: false });
        });
        oDialog.setModel(new JSONModel(metadataWizardHelper.raggruppaPerSezione(aMetadati)), 'wizardSezioni');
        oDialog.setModel(new JSONModel({ testo: oResult.testo || '' }), 'wizardDocumento');
      } catch (e) {
        MessageBox.error('Errore riconoscimento allegato: ' + (e.message || String(e)));
      } finally {
        oBusy.close();
      }
    },

    onCampoMetadatoModificato: function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext('wizardSezioni');
      if (!oCtx) return;
      oCtx.getModel().setProperty(oCtx.getPath() + '/modificatoManualmente', true);
    },

    onSalvaNuovoAllegato: async function () {
      const oDialog = await this._pAllegatiContratto;
      const oModel = oDialog.getModel('allegatiContratto');
      const oNuovo = oModel.getProperty('/nuovoAllegato');
      if (!oNuovo) return;

      const oWizardModel = oDialog.getModel('wizardSezioni');
      const aMetadati = oWizardModel ? oWizardModel.getData().reduce(function (acc, s) { return acc.concat(s.campi); }, []) : [];

      try {
        const oOwnerModel = this.getOwnerComponent().getModel();
        await oOwnerModel.bindContext('/aggiungiAllegatoContratto(...)')
          .setParameter('contrattoID', this._contrattoID)
          .setParameter('filename', oNuovo.filename)
          .setParameter('file', oNuovo.file)
          .setParameter('tipo', oNuovo.tipo)
          .setParameter('confidenza', oNuovo.confidenza)
          .setParameter('metodoRiconoscimento', oNuovo.metodoRiconoscimento)
          .setParameter('testo', oNuovo.testo)
          .setParameter('metadati', aMetadati)
          .execute();

        MessageToast.show('Allegato salvato.');
        const oUploader = this.byId('nuovoAllegatoUploader');
        if (oUploader) oUploader.clear();
        oDialog.setModel(null, 'wizardSezioni');
        oDialog.setModel(null, 'wizardDocumento');
        await this._ricaricaAllegatiContratto(oDialog);
      } catch (e) {
        MessageBox.error('Errore salvataggio allegato: ' + (e.message || String(e)));
      }
    },

    onScaricaAllegato: function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext('allegatiContratto');
      if (!oCtx) return;
      window.open('/contratti/scaricaAllegato/' + oCtx.getObject().ID, '_blank');
    },

    onEliminaAllegatoContratto: function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext('allegatiContratto');
      if (!oCtx) return;
      const oData = oCtx.getObject();
      MessageBox.confirm('Eliminare l\'allegato "' + oData.filename + '"?', {
        title: 'Elimina allegato',
        actions: ['Elimina', 'Annulla'],
        onClose: async (sAction) => {
          if (sAction !== 'Elimina') return;
          try {
            const oOwnerModel = this.getOwnerComponent().getModel();
            await oOwnerModel.bindContext('/eliminaAllegatoContratto(...)')
              .setParameter('allegatoID', oData.ID)
              .execute();
            MessageToast.show('Allegato eliminato.');
            const oDialog = await this._pAllegatiContratto;
            await this._ricaricaAllegatiContratto(oDialog);
          } catch (e) {
            MessageBox.error('Errore eliminazione allegato: ' + (e.message || String(e)));
          }
        }
      });
    },

    onAnteprimaAllegatoContratto: async function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext('allegatiContratto');
      if (!oCtx) return;
      const oData = oCtx.getObject();

      if (!this._oAnteprimaAllegatoDialog) {
        this._oAnteprimaAllegatoDialog = new sap.m.Dialog({
          title: 'Anteprima allegato',
          contentWidth: '90%',
          contentHeight: '85%',
          resizable: true,
          draggable: true,
          content: new VerticalLayout({ id: 'anteprimaAllegatoContent', width: '100%' }),
          beginButton: new sap.m.Button({ text: 'Chiudi', press: function () { this._oAnteprimaAllegatoDialog.close(); }.bind(this) })
        }).addStyleClass('sapUiContentPadding');
      }
      const oLayout = this._oAnteprimaAllegatoDialog.getContent()[0];
      oLayout.removeAllContent();

      let aFields;
      try {
        const oModel2 = this.getOwnerComponent().getModel();
        const oResp = await fetch(oModel2.getServiceUrl() + `MetadatoDocumento?$filter=allegato_ID eq ${oData.ID}`);
        const oMetadatiData = await oResp.json();
        aFields = [
          { label: 'Nome file', value: oData.filename },
          { label: 'Tipo documento', value: formatter.tipoAllegatoText(oData.tipo) },
          { label: 'Confidenza', value: formatter.confidenzaText(oData.confidenza) }
        ].concat((oMetadatiData.value || []).map(function (m) { return { label: m.etichetta, value: m.valore }; }));
      } catch (e) {
        MessageBox.error('Errore caricamento metadati allegato: ' + (e.message || String(e)));
        return;
      }
      aFields.forEach(function (f) {
        if (!f.value) return;
        oLayout.addContent(new sap.m.Label({ text: f.label, design: 'Bold' }));
        oLayout.addContent(new sap.m.Text({ text: String(f.value), wrapping: true }));
      });
      if (oData.testo) {
        oLayout.addContent(new sap.m.Label({ text: 'Testo completo estratto', design: 'Bold' }).addStyleClass('sapUiTinyMarginTop'));
        oLayout.addContent(new sap.m.TextArea({
          value: formatter.testoLeggibile(oData.testo),
          editable: false, width: '100%', height: '55vh'
        }));
      }
      this._oAnteprimaAllegatoDialog.open();
    },

    onChiudiAllegatiContratto: function () {
      this._pAllegatiContratto.then(oDialog => oDialog.close());
    },

    onArchiviaContratto: async function () {
      try {
        await this.getOwnerComponent().getModel()
          .bindContext('/archiviaContratto(...)')
          .setParameter('contrattoID', this._contrattoID)
          .execute();
        MessageToast.show('Contratto archiviato');
        this.getOwnerComponent().getRouter().navTo('main');
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onVerificaContratto: function () {
      var oContesto = this.getView().getModel("contesto");
      var sTemplateID = oContesto.getProperty("/template_ID");
      var sContractID = oContesto.getProperty("/ID");
      var sContractName = oContesto.getProperty("/intestatario");

      if (!sTemplateID) { MessageBox.error("Contratto senza template associato."); return; }

      // set in_corso immediately
      var sNow = new Date().toISOString();
      oContesto.setProperty("/esitoVerifica", "in_corso");
      oContesto.setProperty("/dataUltimaVerifica", sNow);

      // save to DB
      fetch("/contratti/", {
        method: "GET",
        headers: { "x-csrf-token": "fetch" }
      }).then(function (oResp) {
        var sToken = oResp.headers.get("x-csrf-token");
        return fetch("/contratti/Contratto(" + sContractID + ")", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": sToken || "fetch"
          },
          body: JSON.stringify({
            esitoVerifica: "in_corso",
            dataUltimaVerifica: sNow
          })
        });
      }).catch(function (oErr) {
        console.error("Errore salvataggio stato verifica:", oErr);
      });

      window.open(
        "/comparator/webapp/index.html?templateID=" + sTemplateID
        + "&contractID=" + sContractID
        + "&contractName=" + encodeURIComponent(sContractName),
        "_blank"
      );
    },

    onInviaRevisione: async function () {
      try {
        await this.getOwnerComponent().getModel()
          .bindContext("/inviaARevisione(...)")
          .setParameter("contrattoID", this._contrattoID)
          .execute();
        MessageToast.show("Contratto inviato a revisione.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onRiapriBozza: async function () {
      try {
        await this.getOwnerComponent().getModel()
          .bindContext("/riaprireBozza(...)")
          .setParameter("contrattoID", this._contrattoID)
          .execute();
        MessageToast.show("Contratto riaperto in bozza.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onApprovaRevisione: async function () {
      const oModel = this.getOwnerComponent().getModel();
      const revisioni = await oModel.bindList("/Revisione", null, null, null, null, { $filter: `contratto_ID eq ${this._contrattoID} and stato ne 'APPROVATA' and stato ne 'RIFIUTATA'` }).requestContexts(0, 1);
      if (!revisioni.length) { MessageBox.error("Nessuna revisione attiva."); return; }
      const revisioneID = revisioni[0].getProperty("ID");
      try {
        await oModel.bindContext("/approvaRevisione(...)")
          .setParameter("revisioneID", revisioneID)
          .execute();
        MessageToast.show("Revisione approvata.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onRifiutaRevisione: async function () {
      const oModel = this.getOwnerComponent().getModel();
      const revisioni = await oModel.bindList("/Revisione", null, null, null, null, { $filter: `contratto_ID eq ${this._contrattoID} and stato ne 'APPROVATA' and stato ne 'RIFIUTATA'` }).requestContexts(0, 1);
      if (!revisioni.length) { MessageBox.error("Nessuna revisione attiva."); return; }
      const revisioneID = revisioni[0].getProperty("ID");
      try {
        await oModel.bindContext("/rifiutaRevisione(...)")
          .setParameter("revisioneID", revisioneID)
          .execute();
        MessageToast.show("Revisione rifiutata. Contratto torna in bozza.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onSalvaTestata: async function () {
      const oContesto = this.getView().getModel("contesto");
      const testata = {
        intestatario: oContesto.getProperty("/intestatario"),
        responsabile: oContesto.getProperty("/responsabile"),
        codiceFiscale: oContesto.getProperty("/codiceFiscale"),
        dataStipula: _fmtDateStr(oContesto.getProperty("/dataStipula")),
        societaContraente: oContesto.getProperty("/societaContraente"),
        responsabileControparte: oContesto.getProperty("/responsabileControparte"),
        emailControparte: oContesto.getProperty("/emailControparte"),
        oggetto: oContesto.getProperty("/oggetto"),
        dataDecorrenza: _fmtDateStr(oContesto.getProperty("/dataDecorrenza")),
        dataScadenza: _fmtDateStr(oContesto.getProperty("/dataScadenza")),
        categoria: oContesto.getProperty("/categoria"),
        importo: oContesto.getProperty("/importo")
      };
      try {
        await this.getOwnerComponent().getModel()
          .bindContext("/aggiornaTestata(...)")
          .setParameter("contrattoID", this._contrattoID)
          .setParameter("testata", testata)
          .execute();
        MessageToast.show("Testata salvata.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onSalvaBozza: async function () {
      try {
        await this.getOwnerComponent().getModel()
          .bindContext("/salvaBozza(...)")
          .setParameter("contrattoID", this._contrattoID)
          .execute();
        MessageBox.success("Bozza salvata. Clausole bloccate.");
        this._caricaContesto();
      } catch (e) { MessageBox.error(e.message); }
    },

    onMostraVersioni: async function () {
      const oModel = this.getOwnerComponent().getModel();
      try {
        if (!this._pStoricoVersioni) {
          this._pStoricoVersioni = this.loadFragment({ name: 'com.reply.contrattiattivi.app.fragment.StoricoVersioni' });
        }
        const oDialog = await this._pStoricoVersioni;

        const oBinding = oModel.bindContext('/getVersioniContratto(...)')
          .setParameter('contrattoID', this._contrattoID);
        await oBinding.execute();
        const oData = oBinding.getBoundContext().getObject();
        const aRaw = oData.value || oData || [];
        const aVersioni = aRaw.map((v, i) => ({ ...v, sel: false, corrente: i === 0, ultima: i === aRaw.length - 1, dataVersione: new Date(v.dataVersione) }));
        const oVersioniModel = new JSONModel({ versioni: aVersioni });
        oVersioniModel.attachPropertyChange(() => {
          const aItems = oVersioniModel.getProperty('/versioni') || [];
          const selected = aItems.filter(v => v.sel);
          const oBtn = this.byId('btnConfrontaVersioni');
          if (oBtn) oBtn.setEnabled(selected.length === 2);
        });
        oDialog.setModel(oVersioniModel, 'versioni');
        oDialog.open();
      } catch (e) {
        MessageBox.error('Errore caricamento versioni: ' + (e.message || String(e)));
      }
    },

    onConfrontaVersioniContratto: async function () {
      const oDialog = await this._pStoricoVersioni;
      const oModel = oDialog.getModel('versioni');
      const aItems = oModel.getProperty('/versioni') || [];
      const selected = aItems.filter(v => v.sel);
      if (selected.length !== 2) return;
      const [v1, v2] = selected;
      try {
        const oOwnerModel = this.getOwnerComponent().getModel();
        const oBinding = oOwnerModel.bindContext('/confrontaVersioniContratto(...)')
          .setParameter('versioneID1', v1.versioneID)
          .setParameter('versioneID2', v2.versioneID);
        await oBinding.execute();
        const oRaw = oBinding.getBoundContext().getObject();
        const oData = {
          ...oRaw,
          differenzeTestata: JSON.parse(oRaw.differenzeTestata || '[]'),
          clausoleDettaglio: JSON.parse(oRaw.clausoleDettaglio || '[]')
        };
        if (!this._pConfrontoVersioni) {
          this._pConfrontoVersioni = this.loadFragment({ name: 'com.reply.contrattiattivi.app.fragment.ConfrontoVersioniContratto' });
        }
        const oConfrontoDialog = await this._pConfrontoVersioni;
        oConfrontoDialog.setModel(new JSONModel(oData), 'confrontoVersioni');
        oConfrontoDialog.open();
        oDialog.close();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onChiudiStoricoVersioni: function (oEvent) {
      oEvent.getSource().getParent().close();
    },

    onInviaCommento: async function () {
      const oInput = this.byId("nuovoCommento");
      const sTesto = oInput.getValue();
      if (!sTesto) return;
      try {
        await this.getOwnerComponent().getModel()
          .bindContext("/aggiungiCommento(...)")
          .setParameter("contrattoID", this._contrattoID)
          .setParameter("contrattoClausolaID", null)
          .setParameter("testo", sTesto)
          .execute();
        oInput.setValue("");
        MessageToast.show("Commento aggiunto.");
      } catch (e) { MessageBox.error(e.message || String(e)); }
    },

    onChiudiConfrontoVersioni: function (oEvent) {
      oEvent.getSource().getParent().close();
    },

    _fileToBase64: function (oFile) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result.split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(oFile);
      });
    }
  });

  function _fmtDateStr(sDate) {
    if (!sDate) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) return sDate;
    var m = sDate.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      return y + "-" + m[2] + "-" + m[1];
    }
    var oDate = new Date(sDate);
    if (isNaN(oDate.getTime())) return null;
    var y = oDate.getFullYear();
    var month = ("0" + (oDate.getMonth() + 1)).slice(-2);
    var day = ("0" + oDate.getDate()).slice(-2);
    return y + "-" + month + "-" + day;
  }
});
