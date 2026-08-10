const cds = require('@sap/cds');
const { calcolaCoverage, buildTemplateClausoleMap, cercaUtilizzoClausola, confrontaClausoleConTemplate, estraiClausole } = require('./lib/comparator-engine');
const { trovaRiferimento } = require('./lib/riferimento-matcher');
const previewStore = require('./lib/preview-store');
const { computeDocumentoEmbedding } = require('./lib/template-embedding');
const { normalizeText } = require('./lib/diff-utils');
const { extractTextMultiFormato } = require('./lib/ai-import');
const { classificaAllegato, rilevaTipiPresenti } = require('./lib/allegato-classifier');
const { estraiCampiAllegato, trovaPosizione } = require('./lib/allegato-extractor');
const { salvaMetadati } = require('./lib/metadati-writer');
const { salvaEsempio } = require('./lib/classificazione-esempi');
const { TIPOLOGIE_ALLEGATO, categoriaMacro } = require('./lib/tipologie-allegato');
const { buildSnapshotData } = require('./lib/snapshot-utils');
const { generaAnomalie } = require('./lib/anomalie-utils');
const { ottieniPdfEPosizioni } = require('./lib/documento-pdf');

// La confidenza LLM non passa dall'arrotondamento del path embedding: coerziona a 0 i
// valori non numerici e arrotonda a 4 decimali (campo Decimal(5,4) su DB).
function _normalizzaConfidenza(confidenza) {
  const n = Number(confidenza);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

// Il documento principale caricato può essere esso stesso un CGC/CPC/Allegato, o persino un
// fascicolo che li contiene tutti concatenati in un unico file (es. OdA+CGC+CPC+Allegati A-G in
// un solo PDF, caso reale NOMIOS 71 pagine): senza questo, verificaCompletezza verifica solo gli
// allegati caricati a parte e ignora completamente cosa c'è nel documento principale, segnalando
// "CPC assente" anche quando il documento caricato È la CPC (bug reale osservato in sessione).
// tipiRilevati (da rilevaTipiPresenti, multi-tipo) ha priorità; documentoPrincipale.sottoTipo
// (singolo tipo dominante) resta come fallback se la rilevazione multi-tipo non ha trovato nulla.
// Voci sintetiche SENZA campo confidenza: chi le consuma per anomalie di CONFIDENZA deve usare
// la lista originale non arricchita, non questa.
function _conTipiDocumentoPrincipale(allegati, tipiRilevati, documentoPrincipale, filenamePrincipale) {
  const lista = allegati || [];
  const tipiPresenti = new Set(lista.map(a => a.tipo));
  const tipi = (tipiRilevati && tipiRilevati.length) ? tipiRilevati
    : (documentoPrincipale && documentoPrincipale.sottoTipo) ? [documentoPrincipale.sottoTipo] : [];
  const nuovi = tipi.filter(t => t && !tipiPresenti.has(t));
  if (!nuovi.length) return lista;
  return [...lista, ...nuovi.map(tipo => ({ tipo, filename: filenamePrincipale || null }))];
}

module.exports = class ComparatorService extends cds.ApplicationService {
  async init() {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');

    this.on('calcolaCoverage', async (req) => {
      const { templateID, file, filename } = req.data;
      if (!file || !filename) return req.reject(400, 'File e filename obbligatori');
      const buffer = Buffer.from(file, 'base64');
      const mimeType = filename.endsWith('.pdf') ? 'application/pdf'
        : filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : filename.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/octet-stream';

      const result = await cds.tx(req).run(async (tx) => {
        // templateID fornito esplicitamente: comportamento identico a oggi (retrocompatibilità/debug).
        if (templateID) {
          const r = await calcolaCoverage(buffer, filename, mimeType, templateID, tx);
          return { clausole: r.clausole, coveragePercent: r.coveragePercent, riferimentoTrovato: null };
        }

        // Nessun templateID: pipeline automatica (Stadio 1 già completato sopra via extractTextMultiFormato
        // più sotto per i metadati; qui Stadio 1 per le clausole + Stadio 2/3 per il riferimento).
        const clausoleEstratte = await estraiClausole(buffer, filename, mimeType);
        if (!clausoleEstratte.length) return req.reject(400, 'Documento non analizzabile');

        const { Template } = cds.entities('com.reply.contrattiattivi');
        const tuttiTemplate = await tx.run(SELECT.from(Template));
        if (!tuttiTemplate.length) return req.reject(400, 'Nessun template di riferimento disponibile in archivio');

        const matched = await trovaRiferimento(clausoleEstratte, tx);
        if (!matched) return req.reject(400, 'Nessun template di riferimento disponibile in archivio');

        return {
          clausole: matched.clausole,
          coveragePercent: matched.coveragePercent,
          riferimentoTrovato: {
            templateID: matched.templateID, nome: matched.nome, tipo: matched.tipo,
            similarity: matched.similarity, coveragePercent: matched.coveragePercent
          }
        };
      });

      // Estrai metadati del contratto (tipo CONTRATTO, con confidenza per campo) dal testo del documento,
      // con bbox per campo quando è disponibile un PDF nativo o convertito da docx.
      let metadati = [];
      let testo = '';
      let pdfBase64 = null;
      let testoPosizionato = null;
      try {
        testo = await extractTextMultiFormato(buffer, mimeType, filename);
        const oPosizioni = await ottieniPdfEPosizioni(buffer, mimeType);
        pdfBase64 = oPosizioni.pdfBase64;
        testoPosizionato = oPosizioni.testoPosizionato;
        ({ metadati } = await estraiCampiAllegato('CONTRATTO', testo, testoPosizionato));
      } catch (e) {
        console.warn('[comparator] estrazione metadati fallita, uso fallback:', e.message);
      }

      // Le clausole vengono estratte dal testo semplice (estraiClausole), senza bbox: si
      // localizzano qui sull'anteprima PDF cercando il testo della clausola nel testo posizionato
      // già calcolato sopra per i metadati, stesso meccanismo di _trovaPosizione.
      result.clausole.forEach(function (c) { c.posizione = trovaPosizione(c.testo, testoPosizionato); });

      const templateIDFinale = templateID || (result.riferimentoTrovato && result.riferimentoTrovato.templateID) || null;
      const previewID = previewStore.put({
        templateID: templateIDFinale, filename, clausole: result.clausole,
        coveragePercent: result.coveragePercent, metadati, testo, riferimentoTrovato: result.riferimentoTrovato, pdfBase64
      });
      return {
        previewID, coveragePercent: result.coveragePercent, clausole: result.clausole,
        metadati, testo, riferimentoTrovato: result.riferimentoTrovato, pdfBase64
      };
    });

    this.on('classificaAllegati', async (req) => {
      const { previewID, allegati } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente, ripetere l\'analisi');

      let documentoPrincipale = { categoria: null, sottoTipo: null, confidenza: null };
      let tipiRilevati = [];
      if (preview.testo && preview.testo.trim()) {
        const { tipo, confidenza } = await classificaAllegato(preview.testo);
        const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
        documentoPrincipale = {
          categoria: categoriaMacro(tipo),
          sottoTipo: (tipologia && tipologia.sottoTipologia) ? tipo : null,
          confidenza: _normalizzaConfidenza(confidenza)
        };
        // Il documento può essere un fascicolo con più sezioni (CGC+CPC+Allegati concatenati
        // in un unico file, vedi _conTipiDocumentoPrincipale): rileva tutte le tipologie
        // riconoscibili, non solo quella dominante restituita da classificaAllegato sopra.
        tipiRilevati = await rilevaTipiPresenti(preview.testo);
      }

      if (!allegati || !allegati.length) {
        previewStore.update(previewID, { documentoPrincipale, tipiRilevati, allegati: [] });
        return { documentoPrincipale, allegati: [] };
      }

      const allegatiClassificati = [];
      for (const a of allegati) {
        const buffer = Buffer.from(a.file, 'base64');
        const mimeType = a.filename.endsWith('.pdf') ? 'application/pdf'
          : a.filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';

        let testo = '';
        let pdfBase64 = null;
        let testoPosizionato = null;
        try {
          testo = await extractTextMultiFormato(buffer, mimeType, a.filename);
          ({ pdfBase64, testoPosizionato } = await ottieniPdfEPosizioni(buffer, mimeType));
        } catch (e) {
          console.warn('[classificaAllegati] estrazione testo fallita per', a.filename, ':', e.message);
        }

        const { tipo, confidenza, metodoRiconoscimento } = await classificaAllegato(testo);
        const { metadati, dataScadenza } = await estraiCampiAllegato(tipo, testo, testoPosizionato);
        allegatiClassificati.push({
          filename: a.filename, mimeType, contenuto: a.file,
          tipo, confidenza: _normalizzaConfidenza(confidenza), metodoRiconoscimento, testo, metadati, dataScadenza, pdfBase64
        });
      }

      previewStore.update(previewID, { allegati: allegatiClassificati, documentoPrincipale, tipiRilevati });

      return {
        documentoPrincipale,
        allegati: allegatiClassificati.map(({ filename, tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza, pdfBase64 }) =>
          ({ filename, tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza, pdfBase64 }))
      };
    });

    // Punto 3 spec: classificazione del documento principale indipendente dalla presenza
    // di allegati. Chiamata dal frontend upload quando classificaAllegati non ha prodotto
    // sottoTipo (es. embedding ALTRO): fallback gpt-4o-mini già dentro classificaAllegato.
    this.on('classificaDocumentoPrincipale', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');

      let documentoPrincipale = { categoria: null, sottoTipo: null, confidenza: null };
      try {
        if (preview.testo && preview.testo.trim()) {
          const { tipo, confidenza } = await classificaAllegato(preview.testo);
          const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
          documentoPrincipale = {
            categoria: categoriaMacro(tipo),
            sottoTipo: (tipologia && tipologia.sottoTipologia) ? tipo : null,
            confidenza: _normalizzaConfidenza(confidenza)
          };
        }
      } catch (e) {
        console.warn('[classificaDocumentoPrincipale] classificazione fallita:', e.message);
      }
      previewStore.update(previewID, { documentoPrincipale });
      return documentoPrincipale;
    });

    // Punto 2 spec: salvataggio parziale del wizard. Persiste (o aggiorna) un Contratto con
    // stato='BOZZA' e previewID = preview corrente, idempotente. Snapshot clausole salvato in
    // JSON su Contratto.snapshotBozza (preserva stato VARIANTE/NUOVA/NON_PRESENTE per il
    // ripopolamento del wizard); metadati in MetadatoDocumento, allegati in ContrattoAllegato.
    this.on('salvaBozza', async (req) => {
      const { previewID, step, filename, tipo, intestatario, clausole, metadati, allegatoID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);

      const result = await cds.tx(req).run(async (tx) => {
        const { Contratto, Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
        let contratto = await tx.run(SELECT.one.from(Contratto).where({ previewID, stato: 'BOZZA' }));

        if (!contratto) {
          const templateID = cds.utils.uuid();
          const versionID = cds.utils.uuid();
          const nome = (filename || 'Bozza contratto').replace(/\.[^.]+$/, '');
          await tx.run(INSERT.into(Template).entries({ ID: templateID, nome }));
          await tx.run(INSERT.into(TemplateVersion).entries({
            ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
          }));
          const contrattoID = cds.utils.uuid();
          await tx.run(INSERT.into(Contratto).entries({
            ID: contrattoID, stato: 'BOZZA', intestatario: intestatario || nome,
            responsabile: req.user.id, previewID, template_ID: templateID, templateVersion_ID: versionID
          }));
          contratto = { ID: contrattoID };
        }

        if (step === 'CONTRATTO' || step === 'FINE') {
          if (intestatario) await tx.run(UPDATE(Contratto, contratto.ID).with({ intestatario }));
          if (metadati && metadati.length) {
            await salvaMetadati({ tx, parentType: 'Contratto', parentID: contratto.ID, metadati });
          }
          if (clausole && clausole.length) {
            await tx.run(UPDATE(Contratto, contratto.ID).with({ snapshotBozza: JSON.stringify({ clausole }) }));
          }
        }

        if (step === 'ALLEGATO' && allegatoID) {
          const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
          let allegato = await tx.run(SELECT.one.from(ContrattoAllegato).where({ contratto_ID: contratto.ID, filename: allegatoID }));
          if (!allegato && preview) {
            const src = (preview.allegati || []).find(a => a.filename === allegatoID);
            if (src) {
              const id = cds.utils.uuid();
              await tx.run(INSERT.into(ContrattoAllegato).entries({
                ID: id, contratto_ID: contratto.ID, filename: src.filename, mimeType: src.mimeType,
                contenuto: src.contenuto || '', tipo: tipo || src.tipo, confidenza: src.confidenza,
                metodoRiconoscimento: src.metodoRiconoscimento, testo: src.testo, dataScadenza: src.dataScadenza
              }));
              allegato = { ID: id };
            }
          }
          if (allegato && metadati && metadati.length) {
            await salvaMetadati({ tx, parentType: 'ContrattoAllegato', parentID: allegato.ID, metadati });
          }
        }

        return { contrattoID: contratto.ID, stato: 'BOZZA' };
      });

      return result;
    });

    // Riprende i dati della bozza salvata per lo stesso previewID (stesso documento riaperto
    // nel wizard): precompila metadati/clausole/allegati salvati in precedenza.
    this.on('recuperaBozza', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');

      return cds.tx(req).run(async (tx) => {
        const { Contratto, ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
        const contratto = await tx.run(SELECT.one.from(Contratto).where({ previewID, stato: 'BOZZA' }));
        if (!contratto) return null;

        let clausole = [];
        try { clausole = (JSON.parse(contratto.snapshotBozza || 'null') || {}).clausole || []; } catch (e) { clausole = []; }

        const metadati = await tx.run(SELECT.from(MetadatoDocumento).where({ contratto_ID: contratto.ID }));
        const allegatiRaw = await tx.run(SELECT.from(ContrattoAllegato).where({ contratto_ID: contratto.ID }));
        const allegati = [];
        for (const a of allegatiRaw) {
          const aMetadati = await tx.run(SELECT.from(MetadatoDocumento).where({ allegato_ID: a.ID }));
          allegati.push({ filename: a.filename, tipo: a.tipo, metadati: aMetadati });
        }

        return { contrattoID: contratto.ID, intestatario: contratto.intestatario, clausole, allegati, metadati };
      });
    });

    this.on('getTipologieAllegato', () => {
      return [
        ...TIPOLOGIE_ALLEGATO.filter(t => t.key !== 'ALTRO').map(t => ({ codice: t.key, label: t.label })),
        { codice: 'ALTRO', label: 'Altro / non riconosciuto' }
      ];
    });

    this.on('getTemplates', () =>
      SELECT.from(Template).columns('ID', 'nome', 'tipoRiferimento')
        .where({ generatoDaDigitalizzazione: false }).orderBy('nome')
    );

    this.on('verificaCompletezza', async (req) => {
      const { previewID, allegati } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaCompletezza } = require('./lib/allegati-attesi');
      // Gli allegati corretti arrivano dal wizard (parametro): la preview può contenere
      // tipi stale se l'utente ha corretto la classificazione a mano. Per il flusso "verifica
      // contratto esistente" (calcolaCoverageDaContratto) la preview non ha allegati propri:
      // si recuperano quelli già salvati su ContrattoAllegato tramite preview.contractID.
      let allegatiEffettivi = (allegati && allegati.length) ? allegati : (preview.allegati || []);
      let metadatiContratto = preview.metadati || [];
      if (!allegatiEffettivi.length && preview.contractID) {
        const { ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
        allegatiEffettivi = await cds.tx(req).run(SELECT.from(ContrattoAllegato).where({ contratto_ID: preview.contractID }));
        metadatiContratto = await cds.tx(req).run(SELECT.from(MetadatoDocumento).where({ contratto_ID: preview.contractID }));
      }
      const metaAccordo = metadatiContratto.find(m => m.campo === 'accordoQuadroOAutonomo');
      const contestoContratto = { accordoQuadroOAutonomo: metaAccordo && metaAccordo.valore };
      const allegatiConPrincipale = _conTipiDocumentoPrincipale(
        allegatiEffettivi, preview.tipiRilevati, preview.documentoPrincipale, preview.filename);
      return verificaCompletezza(allegatiConPrincipale, contestoContratto);
    });

    this.on('verificaDeroghe', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaDeroghe, esitoComplessivoDeroghe } = require('./lib/deroghe-engine');
      const deroghe = await verificaDeroghe(preview.testo || '');
      return { deroghe, esitoComplessivo: esitoComplessivoDeroghe(deroghe) };
    });

    // Step 1-2 del flusso (gate a monte): se il documento non è riconosciuto come contratto,
    // il flusso NON deve proseguire alla verifica di completezza — si registra invece
    // un'anomalia bloccante nel repository documenti classificati (DocumentoClassificato,
    // vedi db/schema.cds). Richiede che classificaAllegati sia già stato invocato sulla preview.
    this.on('verificaDocumento', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');

      const dp = preview.documentoPrincipale || {};
      const categoria = dp.categoria || null;
      const esitoGate = (!categoria || categoria === 'CONTRATTO') ? 'CONTRATTO' : 'ANOMALIA';
      const gravita = esitoGate === 'ANOMALIA' ? 'BLOCCANTE' : null;
      const dettaglio = esitoGate === 'ANOMALIA'
        ? `Documento classificato come ${categoria} (non un contratto): impossibile procedere alla verifica di completezza allegati.`
        : null;

      const { DocumentoClassificato } = cds.entities('com.reply.contrattiattivi');
      const documentoID = cds.utils.uuid();
      await cds.tx(req).run(INSERT.into(DocumentoClassificato).entries({
        ID: documentoID, filename: preview.filename || null, categoria: categoria || 'ALTRO',
        sottoTipo: dp.sottoTipo || null, confidenza: dp.confidenza != null ? dp.confidenza : null,
        esitoGate, gravita, dettaglioAnomalia: dettaglio
      }));
      previewStore.update(previewID, { documentoClassificatoID: documentoID });

      return { documentoID, esitoGate, categoria, sottoTipo: dp.sottoTipo || null, gravita, dettaglio };
    });

    this.on('verificaAllineamentoSAP', async (req) => {
      const { previewID, dataDecorrenzaSAP, dataScadenzaSAP, importoSAP } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaAllineamentoSAP } = require('./lib/sap-reconcile');
      return verificaAllineamentoSAP(preview.metadati || [], {
        dataDecorrenza: dataDecorrenzaSAP, dataScadenza: dataScadenzaSAP, importoContrattuale: importoSAP
      });
    });

    this.on('calcolaCoverageDaContratto', async (req) => {
      let { contractID, templateID } = req.data;
      if (!contractID) return req.reject(400, 'contractID obbligatorio');

      let contrattoRow = null;
      const result = await cds.tx(req).run(async (tx) => {
        const { Contratto } = cds.entities('com.reply.contrattiattivi');
        contrattoRow = await tx.run(SELECT.one.from(Contratto, contractID));
        if (!templateID) {
          templateID = contrattoRow && contrattoRow.template_ID;
        }
        if (!templateID) return req.reject(400, 'Template di riferimento non determinabile per questo contratto');

        const righe = await tx.run(SELECT.from(ContrattoClausola)
          .where({ contratto_ID: contractID, rimossa: false })
          .orderBy('ordine'));

        const clausole = [];
        for (const riga of righe) {
          const cv = await tx.run(SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID));
          if (cv) {
            const c = await tx.run(SELECT.one.from(Clausola, riga.clausola_ID));
            clausole.push({ titolo: c ? c.titolo : '', testo: cv.testo });
          }
        }

        if (!clausole.length) return req.reject(400, 'Contratto senza clausole');
        return confrontaClausoleConTemplate(clausole, templateID, tx);
      });

      // Qualifica DORA e altri metadati di compliance vanno ricalcolati anche qui: sul flusso
      // upload sono estratti da estraiCampiAllegato('CONTRATTO', ...) in calcolaCoverage, ma quel
      // passaggio non esisteva per "verifica contratto esistente" — il testo del documento non
      // era mai analizzato, quindi presenzaClausoleDORA restava sempre "non determinabile" anche
      // per contratti il cui testo cita DORA in ogni clausola.
      //
      // Preferisci il testo del documento originale (persistito su Contratto in confirmCoverage):
      // il solo corpo delle clausole non contiene mai intestazione/frontespizio (fornitore, date,
      // importo), quindi quei campi tornerebbero sempre null. Fallback sul join delle clausole
      // solo per i contratti creati prima di questa persistenza.
      const testoOriginale = contrattoRow && contrattoRow.testoOriginale;
      const testo = (testoOriginale && testoOriginale.trim())
        ? testoOriginale
        : result.clausole.map(c => c.testo).join('\n\n');
      const pdfBase64 = (contrattoRow && contrattoRow.contenutoOriginale) || null;
      let metadati = [];
      try {
        ({ metadati } = await estraiCampiAllegato('CONTRATTO', testo));
      } catch (e) {
        console.warn('[comparator] estrazione metadati da contratto fallita, uso fallback:', e.message);
      }

      const previewID = previewStore.put({ templateID, contractID, clausole: result.clausole, coveragePercent: result.coveragePercent, testo, metadati, pdfBase64 });
      return { previewID, coveragePercent: result.coveragePercent, clausole: result.clausole, metadati, pdfBase64 };
    });

    this.on('confirmCoverage', async (req) => {
      const { previewID, clausole, allegati, tipoDocumento, dataDecorrenzaSAP, dataScadenzaSAP, importoSAP } = req.data;
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');

      // Le clausole NON_PRESENTE sono clausole del template mancanti nel documento caricato,
      // mostrate in coverage solo come riferimento per l'utente (testo preso dal template,
      // non dal documento): non vanno mai salvate come clausole reali del contratto.
      const clausoleFinali = ((clausole && clausole.length) ? clausole : preview.clausole)
        .filter(c => c.stato !== 'NON_PRESENTE');
      if (!clausoleFinali || !clausoleFinali.length) {
        return req.reject(400, 'Almeno una clausola richiesta per creare il contratto');
      }

      const nome = (preview.filename || 'Contratto').replace(/\.[^.]+$/, '');
      const metadatiFinali = (req.data.metadati && req.data.metadati.length) ? req.data.metadati : (preview.metadati || []);

      const result = await cds.tx(req).run(async (tx) => {
        const { Contratto, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');

        const templateID = cds.utils.uuid();
        await tx.run(INSERT.into(Template).entries({ ID: templateID, nome, generatoDaDigitalizzazione: true }));

        const versionID = cds.utils.uuid();
        const embeddingDocumento = await computeDocumentoEmbedding(clausoleFinali);
        await tx.run(INSERT.into(TemplateVersion).entries({
          ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString(),
          embeddingDocumento
        }));

        const contrattoID = cds.utils.uuid();
        await tx.run(INSERT.into(Contratto).entries({
          ID: contrattoID,
          stato: 'BOZZA',
          intestatario: nome,
          template_ID: templateID, templateVersion_ID: versionID,
          responsabile: req.user.id,
          testoOriginale: preview.testo || null,
          contenutoOriginale: preview.pdfBase64 || null
        }));

        await salvaMetadati({ tx, parentType: 'Contratto', parentID: contrattoID, metadati: metadatiFinali });

        for (let i = 0; i < clausoleFinali.length; i++) {
          const { titolo, testo, templateTitolo } = clausoleFinali[i];

          const sTitoloDaParentesi = templateTitolo && templateTitolo.match(/\(([^)]+)\)/);
          const sTitolo = sTitoloDaParentesi ? sTitoloDaParentesi[1].trim() : titolo;

          const clausolaID = cds.utils.uuid();
          await tx.run(INSERT.into(Clausola).entries({
            ID: clausolaID, codice: `C${i + 1}`, titolo: sTitolo, template_ID: templateID
          }));
          const clausolaVersioneID = cds.utils.uuid();
          await tx.run(INSERT.into(ClausolaVersione).entries({
            ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo,
            dataCreazione: new Date().toISOString(), modificata: false,
            templateVersionOrigine_ID: versionID, contrattoOrigine_ID: contrattoID
          }));
          await tx.run(INSERT.into(TemplateVersionClausola).entries({
            ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID,
            clausolaVersione_ID: clausolaVersioneID, ordine: i + 1
          }));
          await tx.run(INSERT.into(ContrattoClausola).entries({
            ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID,
            clausolaVersione_ID: clausolaVersioneID, ordine: i + 1, rimossa: false
          }));
        }

        const allegatiPreview = preview.allegati || [];
        if (allegatiPreview.length) {
          const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
          const tipiCorretti = new Map((allegati || []).map(a => [a.filename, a.tipo]));

          for (const a of allegatiPreview) {
            const tipoFinale = tipiCorretti.get(a.filename) || a.tipo;
            const metadatiCorretti = (allegati || []).find(x => x.filename === a.filename);
            let metadatiAllegato = (metadatiCorretti && metadatiCorretti.metadati && metadatiCorretti.metadati.length)
              ? metadatiCorretti.metadati : a.metadati;
            let dataScadenza = a.dataScadenza;
            if (tipoFinale !== a.tipo) {
              // utente ha corretto il tipo prima di confermare: i campi estratti in preview
              // erano basati sul tipo originale, vanno rifatti sul tipo corretto
              ({ metadati: metadatiAllegato, dataScadenza } = await estraiCampiAllegato(tipoFinale, a.testo));
            }
            const allegatoID = cds.utils.uuid();
            await tx.run(INSERT.into(ContrattoAllegato).entries({
              ID: allegatoID, contratto_ID: contrattoID,
              filename: a.filename, mimeType: a.mimeType, contenuto: a.contenuto,
              tipo: tipoFinale,
              confidenza: a.confidenza, metodoRiconoscimento: a.metodoRiconoscimento,
              testo: a.testo, dataScadenza
            }));
            await salvaMetadati({ tx, parentType: 'ContrattoAllegato', parentID: allegatoID, metadati: metadatiAllegato });
          }
        }

        const { EsitoVerificaContratto, Anomalia, ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');

        const allegatiSalvati = await tx.run(SELECT.from(ContrattoAllegato).where({ contratto_ID: contrattoID }));
        const metaAccordo = metadatiFinali.find(m => m.campo === 'accordoQuadroOAutonomo');
        const contestoContratto = { accordoQuadroOAutonomo: metaAccordo && metaAccordo.valore };
        // Solo per il calcolo di completezza: le anomalie di CONFIDENZA più sotto devono restare
        // sulla lista grezza allegatiSalvati (le voci sintetiche non hanno confidenza propria).
        const allegatiConPrincipale = _conTipiDocumentoPrincipale(
          allegatiSalvati, preview.tipiRilevati, preview.documentoPrincipale, preview.filename);
        const snapshot = await buildSnapshotData(allegatiConPrincipale, preview.testo || '', contestoContratto);

        const { verificaAllineamentoSAP } = require('./lib/sap-reconcile');
        const allineamentoSAP = (dataDecorrenzaSAP || dataScadenzaSAP || importoSAP != null)
          ? verificaAllineamentoSAP(metadatiFinali, {
              dataDecorrenza: dataDecorrenzaSAP, dataScadenza: dataScadenzaSAP, importoContrattuale: importoSAP
            })
          : [];

        const esitoID = cds.utils.uuid();
        await tx.run(INSERT.into(EsitoVerificaContratto).entries({
          ID: esitoID, contratto_ID: contrattoID, dataVerifica: new Date().toISOString(),
          completezzaPercent: snapshot.percentuale,
          allegatiAttesi: snapshot.attesi.map(a => ({ codice: a.allegatoAtteso, presente: a.presente, filename: a.filename })),
          deroghe: snapshot.deroghe.map(d => ({ articolo: d.articolo, esito: d.esito, dettaglio: d.dettaglio, riferimentoComma: d.riferimentoComma })),
          esitoDeroghe: snapshot.esitoDeroghe,
          standardApplicato: snapshot.standardApplicato,
          allineamentoSAP,
          totaleAllegati: snapshot.totaleAllegati,
          allegatiPresenti: snapshot.allegatiPresenti,
          confidenzaMedia: snapshot.confidenzaMedia,
          fonte: preview.contractID ? 'CONTRATTO' : 'AVVIO_VERIFICA'
        }));

        const anomalie = generaAnomalie({
          attesi: snapshot.attesi,
          deroghe: snapshot.deroghe,
          allegati: allegatiSalvati,
          allineamentoSAP
        });
        if (anomalie.length) {
          await tx.run(INSERT.into(Anomalia).entries(anomalie.map(a => ({
            ID: cds.utils.uuid(), esitoVerifica_ID: esitoID,
            tipo: a.tipo, gravita: a.gravita, riferimento: a.riferimento, dettaglio: a.dettaglio
          }))));
        }

        if (preview.documentoClassificatoID) {
          const { DocumentoClassificato } = cds.entities('com.reply.contrattiattivi');
          await tx.run(UPDATE(DocumentoClassificato, preview.documentoClassificatoID).with({ contratto_ID: contrattoID }));
        }

        return tx.run(SELECT.one.from(Contratto, contrattoID));
      });

      if (tipoDocumento && preview.testo) {
        try {
          const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipoDocumento);
          const categoria = categoriaMacro(tipoDocumento);
          const sottoTipo = (tipologia && tipologia.sottoTipologia) ? tipoDocumento : null;
          const proposta = preview.documentoPrincipale || {};
          const codiceProposto = proposta.sottoTipo || proposta.categoria;
          await salvaEsempio({
            categoria, sottoTipo, testo: preview.testo,
            fonte: codiceProposto === tipoDocumento ? 'conferma' : 'correzione',
            categoriaProposta: proposta.categoria || null,
            confidenzaProposta: proposta.confidenza != null ? proposta.confidenza : null
          });
        } catch (e) {
          console.warn('[confirmCoverage] salvataggio esempio classificazione fallito:', e.message);
        }
      }

      previewStore.remove(previewID);
      return result;
    });

    this.on('cercaUtilizzoClausola', async (req) => {
      return cercaUtilizzoClausola(req.data.clausolaID, cds.tx(req));
    });

    this.on('verificaCompliance', async (req) => {
      const { file, filename, prompt, templateID } = req.data;
      if (!file || !filename || !prompt) return req.reject(400, 'File, filename e prompt obbligatori');
      const buffer = Buffer.from(file, 'base64');
      const mimeType = filename.endsWith('.pdf') ? 'application/pdf'
        : filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : filename.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/octet-stream';

      const { verificaCompliance: eseguiVerifica } = require('./lib/compliance-engine');
      const testo = await extractTextMultiFormato(buffer, mimeType, filename);
      const result = await eseguiVerifica(testo, prompt);
      return (result && result.risultati) || [];
    });

    this.on('verificaComplianceDaContratto', async (req) => {
      const { contractID, prompt } = req.data;
      if (!contractID) return req.reject(400, 'contractID obbligatorio');
      if (!prompt) return req.reject(400, 'Prompt obbligatorio');

      const { verificaCompliance: eseguiVerifica } = require('./lib/compliance-engine');
      const righe = await cds.tx(req).run(async (tx) => {
        return tx.run(SELECT.from(ContrattoClausola)
          .where({ contratto_ID: contractID, rimossa: false })
          .orderBy('ordine'));
      });

      let testo = '';
      for (const riga of righe) {
        const cv = await cds.tx(req).run(SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID));
        if (cv) testo += cv.testo + '\n\n';
      }

      if (!testo) return req.reject(400, 'Contratto senza clausole');
      const result = await eseguiVerifica(testo, prompt);
      return (result && result.risultati) || [];
    });

    this.on('generaTipsAI', async (req) => {
      const { templateID, contractID, clausole } = req.data;
      const { getTipsAI } = require('./lib/tips-ai');
      const result = await getTipsAI({ contrattoID: contractID, templateID, clausole });
      if (result && result.errore) return req.reject(404, result.errore);
      return result;
    });

    const { Anomalia } = cds.entities('com.reply.contrattiattivi');

    const getAnomalia = async (req, anomaliaID) => {
      const anomalia = await SELECT.one.from(Anomalia, anomaliaID);
      if (!anomalia) { req.reject(404, 'Anomalia non trovata'); return null; }
      return anomalia;
    };

    this.on('assegnaAnomalia', async (req) => {
      const { anomaliaID, assegnatario } = req.data;
      if (!assegnatario) return req.reject(400, 'assegnatario obbligatorio');
      const anomalia = await getAnomalia(req, anomaliaID);
      if (!anomalia) return;
      if (anomalia.stato !== 'APERTA') return req.reject(409, 'Solo anomalie APERTA possono essere assegnate');
      await UPDATE(Anomalia, anomaliaID).with({ stato: 'ASSEGNATA', assegnatario });
      return SELECT.one.from(Anomalia, anomaliaID);
    });

    this.on('avviaLavorazione', async (req) => {
      const { anomaliaID } = req.data;
      const anomalia = await getAnomalia(req, anomaliaID);
      if (!anomalia) return;
      if (anomalia.stato !== 'ASSEGNATA') return req.reject(409, 'Solo anomalie ASSEGNATE possono passare in lavorazione');
      await UPDATE(Anomalia, anomaliaID).with({ stato: 'IN_LAVORAZIONE' });
      return SELECT.one.from(Anomalia, anomaliaID);
    });

    this.on('risolviAnomalia', async (req) => {
      const { anomaliaID, nota, file, filename } = req.data;
      const anomalia = await getAnomalia(req, anomaliaID);
      if (!anomalia) return;
      if (anomalia.stato !== 'IN_LAVORAZIONE') return req.reject(409, 'Solo anomalie IN_LAVORAZIONE possono essere risolte');
      await UPDATE(Anomalia, anomaliaID).with({
        stato: 'RISOLTA',
        notaCorrettiva: nota || null,
        allegato: file || null,
        filenameAllegato: filename || null
      });
      return SELECT.one.from(Anomalia, anomaliaID);
    });

    this.on('chiudiAnomalia', async (req) => {
      const { anomaliaID, nota } = req.data;
      const anomalia = await getAnomalia(req, anomaliaID);
      if (!anomalia) return;
      if (anomalia.stato === 'RISOLTA' || anomalia.stato === 'CHIUSA_SENZA_AZIONE') {
        return req.reject(409, 'Anomalia già chiusa');
      }
      await UPDATE(Anomalia, anomaliaID).with({ stato: 'CHIUSA_SENZA_AZIONE', notaCorrettiva: nota || null });
      return SELECT.one.from(Anomalia, anomaliaID);
    });

    this.on('getAnomalie', async (req) => {
      const { stato, tipo, gravita } = req.data;
      const where = {};
      if (stato) where.stato = stato;
      if (tipo) where.tipo = tipo;
      if (gravita) where.gravita = gravita;
      return SELECT.from(Anomalia)
        .columns(
          'ID as anomaliaID', 'tipo', 'gravita', 'riferimento', 'stato', 'assegnatario', 'createdAt as dataApertura',
          'esitoVerifica.contratto.ID as contrattoID',
          'esitoVerifica.contratto.intestatario as intestatario'
        )
        .where(where);
    });

    // Report richiesti dal use case (Risultati Attesi): ciascuna riga riporta anche il referente
    // responsabile della remediation (assegnatario dell'anomalia collegata, se già assegnata).
    this.on('getOrdiniPriviDiContratto', async (req) => {
      const { DocumentoClassificato } = cds.entities('com.reply.contrattiattivi');
      const righe = await cds.tx(req).run(SELECT.from(DocumentoClassificato).where({ categoria: 'ODA', contratto_ID: null }));
      return righe.map(r => ({ documentoID: r.ID, filename: r.filename, dataRilievo: r.createdAt, referente: null }));
    });

    this.on('getContrattiIncompleti', async (req) => {
      const { EsitoVerificaContratto, Contratto } = cds.entities('com.reply.contrattiattivi');
      const snapshots = await cds.tx(req).run(SELECT.from(EsitoVerificaContratto).orderBy('dataVerifica desc'));
      const ultimoPerContratto = new Map();
      for (const s of snapshots) if (!ultimoPerContratto.has(s.contratto_ID)) ultimoPerContratto.set(s.contratto_ID, s);
      const incompleti = [...ultimoPerContratto.values()].filter(s => Number(s.completezzaPercent) < 100);
      if (!incompleti.length) return [];

      const contratti = await cds.tx(req).run(SELECT.from(Contratto).where({ ID: { in: incompleti.map(s => s.contratto_ID) } }));
      const nomeMap = new Map(contratti.map(c => [c.ID, c.intestatario]));
      const anomalie = await cds.tx(req).run(SELECT.from(Anomalia)
        .where({ esitoVerifica_ID: { in: incompleti.map(s => s.ID) }, tipo: 'COMPLETEZZA' }));
      const referentePerEsito = new Map();
      for (const a of anomalie) if (a.assegnatario && !referentePerEsito.has(a.esitoVerifica_ID)) referentePerEsito.set(a.esitoVerifica_ID, a.assegnatario);

      return incompleti.map(s => ({
        contrattoID: s.contratto_ID,
        intestatario: nomeMap.get(s.contratto_ID) || null,
        completezzaPercent: s.completezzaPercent,
        standardApplicato: s.standardApplicato || null,
        allegatiMancanti: (s.allegatiAttesi || []).filter(a => !a.presente).map(a => a.codice).join(', '),
        referente: referentePerEsito.get(s.ID) || null
      }));
    });

    this.on('getDerogheContrattuali', async (req) => {
      const { EsitoVerificaContratto, Contratto } = cds.entities('com.reply.contrattiattivi');
      const snapshots = await cds.tx(req).run(SELECT.from(EsitoVerificaContratto).orderBy('dataVerifica desc'));
      const ultimoPerContratto = new Map();
      for (const s of snapshots) if (!ultimoPerContratto.has(s.contratto_ID)) ultimoPerContratto.set(s.contratto_ID, s);
      const derogati = [...ultimoPerContratto.values()].filter(s => (s.deroghe || []).some(d => d.esito === 'derogato'));
      if (!derogati.length) return [];

      const contratti = await cds.tx(req).run(SELECT.from(Contratto).where({ ID: { in: derogati.map(s => s.contratto_ID) } }));
      const nomeMap = new Map(contratti.map(c => [c.ID, c.intestatario]));
      const anomalie = await cds.tx(req).run(SELECT.from(Anomalia)
        .where({ esitoVerifica_ID: { in: derogati.map(s => s.ID) }, tipo: 'DEROGHE' }));
      const referentePerRiferimento = new Map();
      for (const a of anomalie) if (a.assegnatario) referentePerRiferimento.set(a.esitoVerifica_ID + '|' + a.riferimento, a.assegnatario);

      const righe = [];
      for (const s of derogati) {
        for (const d of (s.deroghe || [])) {
          if (d.esito !== 'derogato') continue;
          const riferimento = 'Art. ' + d.articolo + (d.riferimentoComma ? ' comma ' + d.riferimentoComma : '');
          righe.push({
            contrattoID: s.contratto_ID, intestatario: nomeMap.get(s.contratto_ID) || null,
            articolo: d.articolo, dettaglio: d.dettaglio, riferimentoComma: d.riferimentoComma,
            referente: referentePerRiferimento.get(s.ID + '|' + riferimento) || null
          });
        }
      }
      return righe;
    });

    this.on('getDashboardKPIs', async () => {
      const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
      const snapshots = await SELECT.from(EsitoVerificaContratto).orderBy('dataVerifica desc');
      const anomalie = await SELECT.from(Anomalia);

      const ultimoPerContratto = new Map();
      for (const s of snapshots) {
        if (!ultimoPerContratto.has(s.contratto_ID)) ultimoPerContratto.set(s.contratto_ID, s);
      }
      const ultimi = [...ultimoPerContratto.values()];

      const contrattiCompleti = ultimi.filter(s => Number(s.completezzaPercent) === 100).length;
      const completezzaMedia = ultimi.length
        ? Math.round(ultimi.reduce((somma, s) => somma + Number(s.completezzaPercent), 0) / ultimi.length * 100) / 100
        : 0;
      const derogheTotali = ultimi.reduce((n, s) =>
        n + (s.deroghe || []).filter(d => d.esito === 'derogato').length, 0);
      const ultimiIDs = ultimi.map(s => s.ID);
      const anomalieAperte = anomalie.filter(a =>
        ultimiIDs.includes(a.esitoVerifica_ID) &&
        ['APERTA', 'ASSEGNATA', 'IN_LAVORAZIONE'].includes(a.stato)).length;

      const oggi = new Date();
      const inizio = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate() - 29));

      const perGiorno = new Map();
      for (const s of snapshots) {
        const giorno = new Date(s.dataVerifica);
        if (giorno < inizio) continue;
        const chiave = giorno.toISOString().slice(0, 10);
        if (!perGiorno.has(chiave)) perGiorno.set(chiave, { somma: 0, n: 0, contratti: new Set() });
        const g = perGiorno.get(chiave);
        g.somma += Number(s.completezzaPercent);
        g.n++;
        g.contratti.add(s.contratto_ID);
      }

      const andamento = [];
      for (let i = 0; i < 30; i++) {
        const chiave = new Date(inizio.getTime() + i * 86400000).toISOString().slice(0, 10);
        const g = perGiorno.get(chiave);
        andamento.push({
          data: chiave,
          completezzaMedia: g ? Math.round(g.somma / g.n * 100) / 100 : 0,
          totaleContratti: g ? g.contratti.size : 0
        });
      }

      return {
        totaleContratti: ultimi.length,
        completezzaMedia,
        contrattiCompleti,
        derogheTotali,
        anomalieAperte,
        andamento
      };
    });

    return super.init();
  }
};
