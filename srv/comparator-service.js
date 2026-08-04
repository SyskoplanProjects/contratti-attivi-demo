const cds = require('@sap/cds');
const { calcolaCoverage, buildTemplateClausoleMap, cercaUtilizzoClausola, confrontaClausoleConTemplate, estraiClausole } = require('./lib/comparator-engine');
const { trovaRiferimento } = require('./lib/riferimento-matcher');
const previewStore = require('./lib/preview-store');
const { computeDocumentoEmbedding } = require('./lib/template-embedding');
const { normalizeText } = require('./lib/diff-utils');
const { extractTextMultiFormato } = require('./lib/ai-import');
const { classificaAllegato } = require('./lib/allegato-classifier');
const { estraiCampiAllegato } = require('./lib/allegato-extractor');
const { salvaMetadati } = require('./lib/metadati-writer');
const { salvaEsempio } = require('./lib/classificazione-esempi');
const { TIPOLOGIE_ALLEGATO, categoriaMacro } = require('./lib/tipologie-allegato');
const { buildSnapshotData } = require('./lib/snapshot-utils');
const { generaAnomalie } = require('./lib/anomalie-utils');

// La confidenza LLM non passa dall'arrotondamento del path embedding: coerziona a 0 i
// valori non numerici e arrotonda a 4 decimali (campo Decimal(5,4) su DB).
function _normalizzaConfidenza(confidenza) {
  const n = Number(confidenza);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
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

      // Estrai metadati del contratto (tipo CONTRATTO, con confidenza per campo) dal testo del documento
      let metadati = [];
      let testo = '';
      try {
        testo = await extractTextMultiFormato(buffer, mimeType, filename);
        ({ metadati } = await estraiCampiAllegato('CONTRATTO', testo));
      } catch (e) {
        console.warn('[comparator] estrazione metadati fallita, uso fallback:', e.message);
      }

      const templateIDFinale = templateID || (result.riferimentoTrovato && result.riferimentoTrovato.templateID) || null;
      const previewID = previewStore.put({
        templateID: templateIDFinale, filename, clausole: result.clausole,
        coveragePercent: result.coveragePercent, metadati, testo, riferimentoTrovato: result.riferimentoTrovato
      });
      return {
        previewID, coveragePercent: result.coveragePercent, clausole: result.clausole,
        metadati, testo, riferimentoTrovato: result.riferimentoTrovato
      };
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
          confidenza: _normalizzaConfidenza(confidenza)
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
          tipo, confidenza: _normalizzaConfidenza(confidenza), metodoRiconoscimento, testo, metadati, dataScadenza
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
      const { previewID, allegati } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaCompletezza } = require('./lib/allegati-attesi');
      // Gli allegati corretti arrivano dal wizard (parametro): la preview può contenere
      // tipi stale se l'utente ha corretto la classificazione a mano.
      const allegatiEffettivi = (allegati && allegati.length) ? allegati : (preview.allegati || []);
      return verificaCompletezza(allegatiEffettivi);
    });

    this.on('verificaDeroghe', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');
      const { verificaDeroghe } = require('./lib/deroghe-engine');
      return verificaDeroghe(preview.testo || '');
    });

    this.on('calcolaCoverageDaContratto', async (req) => {
      let { contractID, templateID } = req.data;
      if (!contractID) return req.reject(400, 'contractID obbligatorio');

      const result = await cds.tx(req).run(async (tx) => {
        const { Contratto } = cds.entities('com.reply.contrattiattivi');
        if (!templateID) {
          const contratto = await tx.run(SELECT.one.from(Contratto, contractID));
          templateID = contratto && contratto.template_ID;
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

      const previewID = previewStore.put({ templateID, contractID, clausole: result.clausole, coveragePercent: result.coveragePercent, testo: result.clausole.map(c => c.testo).join('\n') });
      return { previewID, coveragePercent: result.coveragePercent, clausole: result.clausole };
    });

    this.on('confirmCoverage', async (req) => {
      const { previewID, clausole, allegati, tipoDocumento } = req.data;
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

        const { EsitoVerificaContratto, Anomalia, ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');

        const allegatiSalvati = await tx.run(SELECT.from(ContrattoAllegato).where({ contratto_ID: contrattoID }));
        const snapshot = await buildSnapshotData(allegatiSalvati, preview.testo || '');

        const esitoID = cds.utils.uuid();
        await tx.run(INSERT.into(EsitoVerificaContratto).entries({
          ID: esitoID, contratto_ID: contrattoID, dataVerifica: new Date().toISOString(),
          completezzaPercent: snapshot.percentuale,
          allegatiAttesi: snapshot.attesi.map(a => ({ codice: a.allegatoAtteso, presente: a.presente, filename: a.filename })),
          deroghe: snapshot.deroghe.map(d => ({ articolo: d.articolo, esito: d.esito, dettaglio: d.dettaglio, riferimentoComma: d.riferimentoComma })),
          totaleAllegati: snapshot.totaleAllegati,
          allegatiPresenti: snapshot.allegatiPresenti,
          confidenzaMedia: snapshot.confidenzaMedia,
          fonte: preview.contractID ? 'CONTRATTO' : 'AVVIO_VERIFICA'
        }));

        const anomalie = generaAnomalie({
          attesi: snapshot.attesi,
          percentuale: snapshot.percentuale,
          deroghe: snapshot.deroghe,
          allegati: allegatiSalvati
        });
        if (anomalie.length) {
          await tx.run(INSERT.into(Anomalia).entries(anomalie.map(a => ({
            ID: cds.utils.uuid(), esitoVerifica_ID: esitoID,
            tipo: a.tipo, riferimento: a.riferimento, dettaglio: a.dettaglio
          }))));
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
      const { stato, tipo } = req.data;
      const where = {};
      if (stato) where.stato = stato;
      if (tipo) where.tipo = tipo;
      return SELECT.from(Anomalia)
        .columns(
          'ID as anomaliaID', 'tipo', 'riferimento', 'stato', 'assegnatario', 'createdAt as dataApertura',
          'esitoVerifica.contratto.ID as contrattoID',
          'esitoVerifica.contratto.intestatario as intestatario'
        )
        .where(where);
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
