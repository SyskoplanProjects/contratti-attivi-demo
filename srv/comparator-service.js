const cds = require('@sap/cds');
const { calcolaCoverage, buildTemplateClausoleMap, cercaUtilizzoClausola } = require('./lib/comparator-engine');
const previewStore = require('./lib/preview-store');
const { normalizeText } = require('./lib/diff-utils');
const { extractTextMultiFormato } = require('./lib/ai-import');
const { classificaAllegato } = require('./lib/allegato-classifier');
const { estraiCampiAllegato } = require('./lib/allegato-extractor');
const { salvaMetadati } = require('./lib/metadati-writer');
const { TIPOLOGIE_ALLEGATO, categoriaMacro } = require('./lib/tipologie-allegato');

async function confrontaClausoleConTemplate(clausole, templateID, tx) {
  const { Template } = cds.entities('com.reply.contrattiattivi');
  const oTemplate = await tx.run(SELECT.one.from(Template, templateID));
  const sNomeTemplate = oTemplate ? oTemplate.nome : "Template";

  const templateMap = await buildTemplateClausoleMap(tx, templateID);
  const templateEntries = Object.entries(templateMap);
  if (!templateEntries.length) throw new Error('Template has no clauses');

  const testiDaEmbeddare = [
    ...clausole.map(c => c.testo),
    ...templateEntries.map(([, t]) => t.testo)
  ];

  const { cosineSimilarity } = require('./lib/ai-import');
  const openai = require('./modules/openai-module');
  let vettori;
  try {
    vettori = await openai.embeddings(testiDaEmbeddare);
  } catch (e) {
    console.warn('[comparator] embeddings failed:', e.message);
    throw e;
  }

  const SOGLIA_MATCH = 0.92;
  const SOGLIA_VARIANTE = 0.75;
  const embClausole = vettori.slice(0, clausole.length);
  const embTemplate = {};
  templateEntries.forEach(([codice], i) => {
    embTemplate[codice] = vettori[clausole.length + i];
  });

  const matchedTemplateCodici = new Set();
  const results = clausole.map((c, i) => {
    let bestSim = 0;
    let bestMatch = null;
    let bestCodice = null;
    templateEntries.forEach(([codice, t]) => {
      const sim = cosineSimilarity(embClausole[i], embTemplate[codice]);
      if (sim > bestSim) { bestSim = sim; bestMatch = t; bestCodice = codice; }
    });
    bestSim = Math.round(bestSim * 10000) / 10000;
    if (bestSim >= SOGLIA_MATCH) {
      matchedTemplateCodici.add(bestCodice);
      return { ...c, titolo: c.titolo, templateTitolo: bestCodice + " (" + (bestMatch.titolo || "") + ")", stato: 'MATCH_TEMPLATE', similarity: bestSim, matchClausolaID: bestMatch.clausolaID, versione: bestMatch.versione, testoTemplate: bestMatch.testo };
    }
    if (bestSim >= SOGLIA_VARIANTE) {
      matchedTemplateCodici.add(bestCodice);
      return { ...c, titolo: c.titolo, templateTitolo: bestCodice + " (" + (bestMatch.titolo || "") + ")", stato: 'VARIANTE', similarity: bestSim, matchClausolaID: bestMatch.clausolaID, versione: bestMatch.versione, testoTemplate: bestMatch.testo };
    }
    return { ...c, titolo: c.titolo, templateTitolo: "", stato: 'NUOVA', similarity: 0, matchClausolaID: null, versione: 0, testoTemplate: null };
  });

  const clausoleConStorico = await Promise.all(results.map(async (r) => ({
    ...r,
    riferimento: "",
    utilizzoStorico: r.matchClausolaID ? await cercaUtilizzoClausola(r.matchClausolaID, tx) : []
  })));

  templateEntries.forEach(([codice, t]) => {
    if (!matchedTemplateCodici.has(codice)) {
      clausoleConStorico.push({
        titolo: codice + " (" + (t.titolo || "") + ")",
        templateTitolo: codice + " (" + (t.titolo || "") + ")",
        testo: t.testo,
        stato: "NON_PRESENTE",
        similarity: 0,
        matchClausolaID: t.clausolaID,
        utilizzoStorico: [],
        riferimento: sNomeTemplate,
        versione: 0,
        testoTemplate: t.testo
      });
    }
  });

  return {
    clausole: clausoleConStorico,
    coveragePercent: Math.round((matchedTemplateCodici.size / templateEntries.length) * 10000) / 100
  };
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

      const result = await cds.tx(req).run(tx =>
        calcolaCoverage(buffer, filename, mimeType, templateID, tx));

      // Estrai metadati del contratto (tipo CONTRATTO, con confidenza per campo) dal testo del documento
      let metadati = [];
      let testo = '';
      try {
        testo = await extractTextMultiFormato(buffer, mimeType, filename);
        ({ metadati } = await estraiCampiAllegato('CONTRATTO', testo));
      } catch (e) {
        console.warn('[comparator] estrazione metadati fallita, uso fallback:', e.message);
      }

      const previewID = previewStore.put({
        templateID, filename, clausole: result.clausole,
        coveragePercent: result.coveragePercent, metadati, testo
      });
      return { previewID, coveragePercent: result.coveragePercent, clausole: result.clausole, metadati, testo };
    });

    this.on('classificaAllegati', async (req) => {
      const { previewID, allegati } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente, ripetere l\'analisi');

      let documentoPrincipale = { categoria: null, sottoTipo: null, confidenza: null };
      if (preview.testo && preview.testo.trim()) {
        const { tipo, confidenza } = await classificaAllegato(preview.testo);
        const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
        documentoPrincipale = {
          categoria: categoriaMacro(tipo),
          sottoTipo: (tipologia && tipologia.sottoTipologia) ? tipo : null,
          confidenza
        };
      }

      if (!allegati || !allegati.length) {
        previewStore.update(previewID, { documentoPrincipale, allegati: [] });
        return { documentoPrincipale, allegati: [] };
      }

      const allegatiClassificati = [];
      for (const a of allegati) {
        const buffer = Buffer.from(a.file, 'base64');
        const mimeType = a.filename.endsWith('.pdf') ? 'application/pdf'
          : a.filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';

        let testo = '';
        try {
          testo = await extractTextMultiFormato(buffer, mimeType, a.filename);
        } catch (e) {
          console.warn('[classificaAllegati] estrazione testo fallita per', a.filename, ':', e.message);
        }

        const { tipo, confidenza, metodoRiconoscimento } = await classificaAllegato(testo);
        const { metadati, dataScadenza } = await estraiCampiAllegato(tipo, testo);
        allegatiClassificati.push({
          filename: a.filename, mimeType, contenuto: a.file,
          tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza
        });
      }

      previewStore.update(previewID, { allegati: allegatiClassificati, documentoPrincipale });

      return {
        documentoPrincipale,
        allegati: allegatiClassificati.map(({ filename, tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza }) =>
          ({ filename, tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza }))
      };
    });

    this.on('getTipologieAllegato', () => {
      return [
        ...TIPOLOGIE_ALLEGATO.filter(t => t.key !== 'ALTRO').map(t => ({ codice: t.key, label: t.label })),
        { codice: 'ALTRO', label: 'Altro / non riconosciuto' }
      ];
    });

    this.on('verificaCompletezza', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaCompletezza } = require('./lib/allegati-attesi');
      return verificaCompletezza(preview.allegati || []);
    });

    this.on('calcolaCoverageDaContratto', async (req) => {
      const { contractID, templateID } = req.data;
      if (!contractID || !templateID) return req.reject(400, 'contractID e templateID obbligatori');

      const result = await cds.tx(req).run(async (tx) => {
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

      const previewID = previewStore.put({ templateID, contractID, clausole: result.clausole, coveragePercent: result.coveragePercent });
      return { previewID, coveragePercent: result.coveragePercent, clausole: result.clausole };
    });

    this.on('confirmCoverage', async (req) => {
      const { previewID, clausole, allegati } = req.data;
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
        await tx.run(INSERT.into(Template).entries({ ID: templateID, nome }));

        const versionID = cds.utils.uuid();
        await tx.run(INSERT.into(TemplateVersion).entries({
          ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
        }));

        const contrattoID = cds.utils.uuid();
        await tx.run(INSERT.into(Contratto).entries({
          ID: contrattoID,
          stato: 'BOZZA',
          intestatario: nome,
          template_ID: templateID, templateVersion_ID: versionID,
          responsabile: req.user.id
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

        return tx.run(SELECT.one.from(Contratto, contrattoID));
      });

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

    return super.init();
  }
};
