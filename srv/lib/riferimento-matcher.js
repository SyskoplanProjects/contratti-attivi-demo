const cds = require('@sap/cds');
const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { confrontaClausoleConTemplate } = require('./comparator-engine');

const N_SHORTLIST = 3;

function _media(vettori) {
  if (!vettori || !vettori.length) return null;
  const n = vettori.length;
  const dim = vettori[0].length;
  const somma = new Array(dim).fill(0);
  for (const v of vettori) {
    for (let i = 0; i < dim; i++) somma[i] += v[i];
  }
  return somma.map(x => x / n);
}

// confirmCoverage crea un nuovo Template a ogni contratto confermato: il pool cresce
// senza limite, quindi si evita la query TemplateVersion per-template in loop (1 + N) e
// si recupera l'ultima versione di ciascun template con un'unica query batched (2 totali,
// indipendentemente dal numero di template).
//
// Doppia scrematura (RF-2.x): se annoContratto è noto, il pool viene prima ristretto ai
// Template con annoRiferimento coincidente, e solo su quel sottoinsieme si applica il
// ranking per cosine similarity. Campo opzionale/nuovo: la maggior parte dei Template
// esistenti non lo ha ancora valorizzato, quindi con pool ristretto vuoto si ricade sul
// pool completo (nessuna regressione per i dati non ancora migrati).
async function _shortlist(embeddingMedio, tx, n, annoContratto) {
  const { Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
  let templates = await tx.run(SELECT.from(Template));
  if (!templates.length) return [];
  if (annoContratto) {
    const stessaEpoca = templates.filter(t => t.annoRiferimento === annoContratto);
    if (stessaEpoca.length) templates = stessaEpoca;
  }
  const templateIDs = templates.map(t => t.ID);
  const tutteLeVersioni = await tx.run(
    SELECT.from(TemplateVersion).where({ template_ID: { in: templateIDs } }).orderBy('numero desc')
  );
  const ultimaPerTemplate = {};
  for (const v of tutteLeVersioni) {
    if (!ultimaPerTemplate[v.template_ID]) ultimaPerTemplate[v.template_ID] = v; // orderBy desc -> il primo vince
  }
  const candidati = [];
  for (const t of templates) {
    const ultima = ultimaPerTemplate[t.ID];
    if (!ultima || !ultima.embeddingDocumento) continue;
    const similarity = Math.round(cosineSimilarity(embeddingMedio, JSON.parse(ultima.embeddingDocumento)) * 10000) / 10000;
    candidati.push({ templateID: t.ID, nome: t.nome, tipo: t.tipoRiferimento, similarity });
  }
  candidati.sort((a, b) => b.similarity - a.similarity);
  return candidati.slice(0, n);
}

// Stadio 2 completo: shortlist per cosine similarity sull'embedding medio del documento
// caricato (con doppia scrematura per epoca se annoContratto è noto), poi rifinitura
// clausola-per-clausola sui top N candidati (riuso di confrontaClausoleConTemplate,
// nessuna riestrazione delle clausole già estratte in Stadio 1). Vince il candidato con
// coveragePercent più alto; a parità, similarity più alta.
//
// Ritorna { migliore, candidati }: candidati è la shortlist rifinita per intero (fino a
// N_SHORTLIST=3), ordinata come migliore per primo, per esporre a UI un top-3 selezionabile
// invece del solo best match (RF-1.x).
async function trovaRiferimento(clausoleEstratte, tx, annoContratto) {
  const { Template } = cds.entities('com.reply.contrattiattivi');
  const tuttiTemplate = await tx.run(SELECT.from(Template));
  if (!tuttiTemplate.length || !clausoleEstratte.length) return null;

  // Embeddings API non disponibile: propaga l'errore (comportamento invariato rispetto a
  // oggi, es. comparator-engine.js#calcolaCoverage fa lo stesso su fallimento embeddings),
  // non va confuso con "pool vuoto"/"nessun match" che ritornano null.
  const vettoriClausole = await openai.embeddings(clausoleEstratte.map(c => c.testo));
  const embeddingMedio = _media(vettoriClausole);
  if (!embeddingMedio) return null;

  let candidati = await _shortlist(embeddingMedio, tx, N_SHORTLIST, annoContratto);
  if (!candidati.length) {
    if (tuttiTemplate.length !== 1) return null;
    // Nessun Template ha embeddingDocumento valorizzato, ma ce n'è uno solo in archivio:
    // fallback a confronto diretto invece di escluderlo dalla comparazione.
    candidati = [{ templateID: tuttiTemplate[0].ID, nome: tuttiTemplate[0].nome, tipo: tuttiTemplate[0].tipoRiferimento, similarity: 0 }];
  }

  const rifiniti = [];
  for (const candidato of candidati) {
    try {
      const { clausole, coveragePercent } = await confrontaClausoleConTemplate(clausoleEstratte, candidato.templateID, tx);
      rifiniti.push({ ...candidato, coveragePercent, clausole });
    } catch (e) {
      console.warn('[riferimento-matcher] rifinitura fallita per', candidato.templateID, ':', e.message);
    }
  }
  if (!rifiniti.length) return null;

  rifiniti.sort((a, b) =>
    b.coveragePercent - a.coveragePercent || b.similarity - a.similarity);

  return { migliore: rifiniti[0], candidati: rifiniti };
}

module.exports = { trovaRiferimento };