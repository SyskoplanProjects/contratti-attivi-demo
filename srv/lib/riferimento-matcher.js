const cds = require('@sap/cds');
const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { confrontaClausoleConTemplate } = require('./comparator-engine');

const N_SHORTLIST = 3;

function _media(vettori) {
  const n = vettori.length;
  const dim = vettori[0].length;
  const somma = new Array(dim).fill(0);
  for (const v of vettori) {
    for (let i = 0; i < dim; i++) somma[i] += v[i];
  }
  return somma.map(x => x / n);
}

async function _shortlist(embeddingMedio, tx, n) {
  const { Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
  const templates = await tx.run(SELECT.from(Template));
  const candidati = [];
  for (const t of templates) {
    const versioni = await tx.run(SELECT.from(TemplateVersion).where({ template_ID: t.ID }).orderBy('numero desc'));
    const ultima = versioni[0];
    if (!ultima || !ultima.embeddingDocumento) continue;
    const similarity = Math.round(cosineSimilarity(embeddingMedio, JSON.parse(ultima.embeddingDocumento)) * 10000) / 10000;
    candidati.push({ templateID: t.ID, nome: t.nome, tipo: t.tipoRiferimento, similarity });
  }
  candidati.sort((a, b) => b.similarity - a.similarity);
  return candidati.slice(0, n);
}

// Stadio 2 completo: shortlist per cosine similarity sull'embedding medio del documento
// caricato, poi rifinitura clausola-per-clausola sui top N candidati (riuso di
// confrontaClausoleConTemplate, nessuna riestrazione delle clausole già estratte in
// Stadio 1). Vince il candidato con coveragePercent più alto; a parità, similarity più alta.
async function trovaRiferimento(clausoleEstratte, tx) {
  const { Template } = cds.entities('com.reply.contrattiattivi');
  const tuttiTemplate = await tx.run(SELECT.from(Template));
  if (!tuttiTemplate.length || !clausoleEstratte.length) return null;

  // Embeddings API non disponibile: propaga l'errore (comportamento invariato rispetto a
  // oggi, es. comparator-engine.js#calcolaCoverage fa lo stesso su fallimento embeddings),
  // non va confuso con "pool vuoto"/"nessun match" che ritornano null.
  const vettoriClausole = await openai.embeddings(clausoleEstratte.map(c => c.testo));
  const embeddingMedio = _media(vettoriClausole);

  let candidati = await _shortlist(embeddingMedio, tx, N_SHORTLIST);
  if (!candidati.length) {
    if (tuttiTemplate.length !== 1) return null;
    // Nessun Template ha embeddingDocumento valorizzato, ma ce n'è uno solo in archivio:
    // fallback a confronto diretto invece di escluderlo dalla comparazione.
    candidati = [{ templateID: tuttiTemplate[0].ID, nome: tuttiTemplate[0].nome, tipo: tuttiTemplate[0].tipoRiferimento, similarity: 0 }];
  }

  let migliore = null;
  for (const candidato of candidati) {
    try {
      const { clausole, coveragePercent } = await confrontaClausoleConTemplate(clausoleEstratte, candidato.templateID, tx);
      const meglio = !migliore
        || coveragePercent > migliore.coveragePercent
        || (coveragePercent === migliore.coveragePercent && candidato.similarity > migliore.similarity);
      if (meglio) migliore = { ...candidato, coveragePercent, clausole };
    } catch (e) {
      console.warn('[riferimento-matcher] rifinitura fallita per', candidato.templateID, ':', e.message);
    }
  }
  return migliore;
}

module.exports = { trovaRiferimento };