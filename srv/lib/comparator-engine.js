const cds = require('@sap/cds');
const { extractTextMultiFormato, cosineSimilarity } = require('./ai-import');
const { parseFile } = require('../import-handler');
const openai = require('../modules/openai-module');

const SOGLIA_MATCH = 0.92;
const SOGLIA_VARIANTE = 0.75;

async function estraiClausole(buffer, filename, mimeType) {
  try {
    const { estraiClausoleAI } = require('./ai-import');
    const testo = await extractTextMultiFormato(buffer, mimeType, filename);
    return await estraiClausoleAI(testo);
  } catch (e) {
    console.warn('[comparator] AI fallback to regex parser:', e.message);
    return parseFile(buffer, filename, mimeType);
  }
}

async function buildTemplateClausoleMap(tx, templateID) {
  const { TemplateVersion, TemplateVersionClausola, Clausola, ClausolaVersione } =
    cds.entities('com.reply.contrattiattivi');
  const versions = await tx.run(SELECT.from(TemplateVersion)
    .where({ template_ID: templateID }).orderBy('numero desc'));
  if (!versions.length) return {};
  const righe = await tx.run(SELECT.from(TemplateVersionClausola)
    .where({ templateVersion_ID: versions[0].ID }).orderBy('ordine'));
  const map = {};
  for (const r of righe) {
    const c = await tx.run(SELECT.one.from(Clausola, r.clausola_ID));
    const v = await tx.run(SELECT.one.from(ClausolaVersione, r.clausolaVersione_ID));
    if (c && v) map[c.codice] = { clausolaID: c.ID, versioneID: v.ID, testo: v.testo, titolo: c.titolo, versione: v.numero };
  }
  return map;
}

// Cerca dove una clausola del template è già stata usata in passato: contratti
// nativi (ContrattoClausola) e contratti importati via Comparator (ClausolaImportata),
// segnalando se la versione usata differisce da quella di riferimento (variante).
async function cercaUtilizzoClausola(clausolaID, tx) {
  const { ContrattoClausola, Contratto, TemplateVersionClausola, ClausolaImportata, ContrattoImportato } =
    cds.entities('com.reply.contrattiattivi');
  const results = [];

  const righeNative = await tx.run(SELECT.from(ContrattoClausola).where({ clausola_ID: clausolaID, rimossa: false }));
  for (const r of righeNative) {
    const c = await tx.run(SELECT.one.from(Contratto, r.contratto_ID));
    if (!c) continue;
    const templateVersions = await tx.run(SELECT.from(TemplateVersionClausola)
      .where({ clausola_ID: clausolaID, templateVersion_ID: c.templateVersion_ID }));
    const variante = templateVersions.length > 0
      ? templateVersions[0].clausolaVersione_ID !== r.clausolaVersione_ID
      : false;
    results.push({ contrattoID: c.ID, tipo: 'NATIVO', intestatario: c.intestatario, variante });
  }

  const righeImportate = await tx.run(SELECT.from(ClausolaImportata).where({ clausolaTemplate_ID: clausolaID }));
  for (const r of righeImportate) {
    const ci = await tx.run(SELECT.one.from(ContrattoImportato, r.contrattoImportato_ID));
    if (!ci) continue;
    results.push({ contrattoID: ci.ID, tipo: 'IMPORTATO', intestatario: ci.filename, variante: r.variante });
  }

  return results;
}

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

  let vettori;
  try {
    vettori = await openai.embeddings(testiDaEmbeddare);
  } catch (e) {
    console.warn('[comparator] embeddings failed:', e.message);
    throw e;
  }

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

async function calcolaCoverage(buffer, filename, mimeType, templateID, tx) {
  const { Template } = cds.entities('com.reply.contrattiattivi');
  const oTemplate = await tx.run(SELECT.one.from(Template, templateID));
  const sNomeTemplate = oTemplate ? oTemplate.nome : "Template";

  const clausoleEstratte = await estraiClausole(buffer, filename, mimeType);
  const templateMap = await buildTemplateClausoleMap(tx, templateID);
  const templateEntries = Object.entries(templateMap);
  if (!templateEntries.length) throw new Error('Template has no clauses');

  const testiDaEmbeddare = [
    ...clausoleEstratte.map(c => c.testo),
    ...templateEntries.map(([, t]) => t.testo)
  ];

  let vettori;
  try {
    vettori = await openai.embeddings(testiDaEmbeddare);
  } catch (e) {
    console.warn('[comparator] embeddings failed:', e.message);
    throw e;
  }

  const embClausole = vettori.slice(0, clausoleEstratte.length);
  const embTemplate = {};
  templateEntries.forEach(([codice], i) => {
    embTemplate[codice] = vettori[clausoleEstratte.length + i];
  });

  const matchedTemplateCodici = new Set();
  const results = clausoleEstratte.map((c, i) => {
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
      return { ...c, titolo: c.titolo, templateTitolo: bestCodice + " (" + (bestMatch.titolo || "") + ")", stato: 'MATCH_TEMPLATE', similarity: bestSim, matchClausolaID: bestMatch.clausolaID, matchClausolaVersioneID: bestMatch.versioneID, versione: bestMatch.versione, testoTemplate: bestMatch.testo };
    }
    if (bestSim >= SOGLIA_VARIANTE) {
      matchedTemplateCodici.add(bestCodice);
      return { ...c, titolo: c.titolo, templateTitolo: bestCodice + " (" + (bestMatch.titolo || "") + ")", stato: 'VARIANTE', similarity: bestSim, matchClausolaID: bestMatch.clausolaID, matchClausolaVersioneID: bestMatch.versioneID, versione: bestMatch.versione, testoTemplate: bestMatch.testo };
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

module.exports = { calcolaCoverage, buildTemplateClausoleMap, cercaUtilizzoClausola, confrontaClausoleConTemplate, estraiClausole };
