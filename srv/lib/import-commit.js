const cds = require('@sap/cds');
const { computeDelta, normalizeText } = require('./diff-utils');
const { computeDocumentoEmbedding } = require('./template-embedding');
const { parseFile } = require('../import-handler');

async function eseguiImport(tx, templateID, filename, clausoleEstratte) {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } =
    cds.entities('com.reply.contrattiattivi');

  let template = templateID ? await tx.run(SELECT.one.from(Template, templateID)) : null;
  if (!template) {
    const newID = cds.utils.uuid();
    await tx.run(INSERT.into(Template).entries({ ID: newID, nome: filename || 'Template importato', tipoServizio: 'N/D' }));
    template = { ID: newID };
  }

  const clausoleTemplate = await tx.run(SELECT.from(Clausola).columns('codice').where({ template_ID: template.ID }));
  const codiciEsistenti = new Set(clausoleTemplate.map(c => c.codice));
  let maxNum = 0;
  for (const c of clausoleTemplate) {
    const m = c.codice.match(/^C?(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  let prossimoNumero = maxNum + 1;

  const prevVersions = await tx.run(SELECT.from(TemplateVersion).where({ template_ID: template.ID }).orderBy('numero desc'));
  const numero = prevVersions.length ? prevVersions[0].numero + 1 : 0;
  const versionID = cds.utils.uuid();
  const embeddingDocumento = await computeDocumentoEmbedding(clausoleEstratte);
  await tx.run(INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: template.ID, numero, dataCreazione: new Date().toISOString(), embeddingDocumento
  }));

  let clausoleCreate = 0, clausoleRiutilizzate = 0, clausoleConDelta = 0;

  for (let i = 0; i < clausoleEstratte.length; i++) {
    const estratta = clausoleEstratte[i];
    const testoNorm = normalizeText(estratta.testo);

    let clausola = await tx.run(SELECT.one.from(Clausola).where({ template_ID: template.ID, codice: `C${estratta.numero}` }));
    if (!clausola) clausola = await tx.run(SELECT.one.from(Clausola).where({ template_ID: template.ID, codice: String(estratta.numero) }));

    let prevVersioneClausola = null;
    if (prevVersions.length && clausola) {
      const prevTVC = await tx.run(SELECT.one.from(TemplateVersionClausola)
        .where({ templateVersion_ID: prevVersions[0].ID, clausola_ID: clausola.ID }));
      if (prevTVC) prevVersioneClausola = await tx.run(SELECT.one.from(ClausolaVersione, prevTVC.clausolaVersione_ID));
    }

    let matchExisting = null;
    if (clausola) {
      const versioniEsistenti = await tx.run(SELECT.from(ClausolaVersione).where({ clausola_ID: clausola.ID }));
      matchExisting = versioniEsistenti.find(v => normalizeText(v.testo) === testoNorm);
    }

    let clausolaVersioneID;
    if (matchExisting) {
      clausolaVersioneID = matchExisting.ID;
      clausoleRiutilizzate++;
    } else {
      if (!clausola) {
        const clausolaID = cds.utils.uuid();
        let sCodice = `C${estratta.numero}`;
        if (codiciEsistenti.has(sCodice)) sCodice = 'C' + (prossimoNumero++);
        codiciEsistenti.add(sCodice);
        await tx.run(INSERT.into(Clausola).entries({
          ID: clausolaID, codice: sCodice, titolo: estratta.titolo, template_ID: template.ID
        }));
        clausola = { ID: clausolaID };
      }
      const { modificata, dettaglioDelta } = computeDelta(prevVersioneClausola?.testo, estratta.testo);
      const nuovaVersioneID = cds.utils.uuid();
      const versioniClausola = await tx.run(SELECT.from(ClausolaVersione).where({ clausola_ID: clausola.ID }).orderBy('numero desc'));
      const numeroVersione = versioniClausola.length ? versioniClausola[0].numero + 1 : 0;

      await tx.run(INSERT.into(ClausolaVersione).entries({
        ID: nuovaVersioneID, clausola_ID: clausola.ID, numero: numeroVersione,
        testo: estratta.testo, dataCreazione: new Date().toISOString(),
        modificata, dettaglioDelta, templateVersionOrigine_ID: versionID
      }));
      clausolaVersioneID = nuovaVersioneID;
      clausoleCreate++;
      if (modificata) clausoleConDelta++;
    }

    await tx.run(INSERT.into(TemplateVersionClausola).entries({
      ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausola.ID,
      clausolaVersione_ID: clausolaVersioneID, ordine: i + 1
    }));
  }

  return { clausoleCreate, clausoleRiutilizzate, clausoleConDelta, templateID: template.ID };
}

async function eseguiImportConfermato(tx, templateID, filename, clausoleConfermate) {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } =
    cds.entities('com.reply.contrattiattivi');

  let template = templateID ? await tx.run(SELECT.one.from(Template, templateID)) : null;
  if (!template) {
    const newID = cds.utils.uuid();
    await tx.run(INSERT.into(Template).entries({ ID: newID, nome: filename || 'Template importato', tipoServizio: 'N/D' }));
    template = { ID: newID };
  }

  const prevVersions = await tx.run(SELECT.from(TemplateVersion).where({ template_ID: template.ID }).orderBy('numero desc'));
  const numero = prevVersions.length ? prevVersions[0].numero + 1 : 0;
  const versionID = cds.utils.uuid();
  const embeddingDocumento = await computeDocumentoEmbedding(clausoleConfermate);
  await tx.run(INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: template.ID, numero, dataCreazione: new Date().toISOString(), embeddingDocumento
  }));

  let clausoleCreate = 0, clausoleRiutilizzate = 0, clausoleConDelta = 0;

  for (let i = 0; i < clausoleConfermate.length; i++) {
    const c = clausoleConfermate[i];
    let clausolaID, clausolaVersioneID;

    if (c.matchClausolaVersioneID) {
      const versioneMatch = await tx.run(SELECT.one.from(ClausolaVersione, c.matchClausolaVersioneID));
      if (!versioneMatch) throw new Error(`Versione clausola di match non trovata: ${c.matchClausolaVersioneID}`);
      clausolaID = versioneMatch.clausola_ID;

      if (normalizeText(versioneMatch.testo) === normalizeText(c.testo)) {
        clausolaVersioneID = versioneMatch.ID;
        clausoleRiutilizzate++;
      } else {
        const { modificata, dettaglioDelta } = computeDelta(versioneMatch.testo, c.testo);
        const versioniClausola = await tx.run(SELECT.from(ClausolaVersione).where({ clausola_ID: clausolaID }).orderBy('numero desc'));
        const numeroVersione = versioniClausola.length ? versioniClausola[0].numero + 1 : 0;
        const nuovaVersioneID = cds.utils.uuid();
        await tx.run(INSERT.into(ClausolaVersione).entries({
          ID: nuovaVersioneID, clausola_ID: clausolaID, numero: numeroVersione,
          testo: c.testo, dataCreazione: new Date().toISOString(),
          modificata, dettaglioDelta, templateVersionOrigine_ID: versionID
        }));
        clausolaVersioneID = nuovaVersioneID;
        clausoleCreate++;
        clausoleConDelta++;
      }
    } else {
      clausolaID = cds.utils.uuid();
      await tx.run(INSERT.into(Clausola).entries({
        ID: clausolaID, codice: `C${c.numero}`, titolo: c.titolo, template_ID: template.ID
      }));
      const nuovaVersioneID = cds.utils.uuid();
      await tx.run(INSERT.into(ClausolaVersione).entries({
        ID: nuovaVersioneID, clausola_ID: clausolaID, numero: 0,
        testo: c.testo, dataCreazione: new Date().toISOString(),
        modificata: false, dettaglioDelta: null, templateVersionOrigine_ID: versionID
      }));
      clausolaVersioneID = nuovaVersioneID;
      clausoleCreate++;
    }

    await tx.run(INSERT.into(TemplateVersionClausola).entries({
      ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID,
      clausolaVersione_ID: clausolaVersioneID, ordine: i + 1
    }));
  }

  return { clausoleCreate, clausoleRiutilizzate, clausoleConDelta, templateID: template.ID };
}

// Estrae TUTTI i file e unisce le clausole nell'ordine di caricamento. Nessun accesso al DB e
// nessuna chiamata AI: split locale via regex (stesso parser di importTemplate). L'estrazione
// AI (estraiClausoleConFallback) chiede al modello di ricopiare il testo di ogni clausola nella
// risposta, quindi genera output grande quanto il documento — su un file di poche pagine reali
// arriva a impiegare minuti. Qui creiamo un template nuovo da zero, senza alcun matching contro
// clausole esistenti, quindi non serve: la stessa segmentazione regex basta e resta istantanea.
// Il "numero" originale di ciascun file viene scartato (ripartirebbe da 1 per ogni documento):
// il codice viene riassegnato in sequenza sull'insieme unito, non sul singolo file.
async function estraiClausoleMultiFile(fileList) {
  const clausolePerFile = [];
  for (const f of fileList) {
    try {
      clausolePerFile.push(await parseFile(f.buffer, f.filename, f.mimeType));
    } catch (e) {
      const err = new Error(`Estrazione fallita su "${f.filename}": ${e.message}`);
      err.code = 'EXTRACTION_FAILED';
      throw err;
    }
  }
  return clausolePerFile.flat();
}

// Crea Template + TemplateVersion + una riga Clausola/ClausolaVersione/TemplateVersionClausola
// per ciascuna clausola già estratta e unita. Nessun matching/versioning: è un template
// completamente nuovo.
async function creaTemplateDaClausole(tx, nome, clausoleUnite, embeddingDocumento) {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } =
    cds.entities('com.reply.contrattiattivi');

  const templateID = cds.utils.uuid();
  await tx.run(INSERT.into(Template).entries({ ID: templateID, nome, tipoServizio: 'N/D' }));

  const versionID = cds.utils.uuid();
  await tx.run(INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString(), embeddingDocumento
  }));

  for (let i = 0; i < clausoleUnite.length; i++) {
    const c = clausoleUnite[i];
    const clausolaID = cds.utils.uuid();
    await tx.run(INSERT.into(Clausola).entries({
      ID: clausolaID, codice: `C${i + 1}`, titolo: c.titolo, template_ID: templateID
    }));

    const clausolaVersioneID = cds.utils.uuid();
    await tx.run(INSERT.into(ClausolaVersione).entries({
      ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: c.testo,
      dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
    }));

    await tx.run(INSERT.into(TemplateVersionClausola).entries({
      ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID,
      clausolaVersione_ID: clausolaVersioneID, ordine: i + 1
    }));
  }

  return { templateID, clausoleCreate: clausoleUnite.length };
}

module.exports = { eseguiImport, eseguiImportConfermato, estraiClausoleMultiFile, creaTemplateDaClausole };
