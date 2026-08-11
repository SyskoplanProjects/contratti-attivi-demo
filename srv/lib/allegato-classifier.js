const openai = require('../modules/openai-module');
const { cosineSimilarity } = require('./ai-import');
const { TIPOLOGIE_ALLEGATO, SOGLIA_TIPO_ALLEGATO } = require('./tipologie-allegato');
const { caricaEsempi } = require('./classificazione-esempi');

let _embeddingsRiferimentoCache = null;

// Regola DURC/DURF: un documento è DURC SOLO se contiene il nome esplicito
// ("Documento Unico di Regolarità Contributiva" o sigla "DURC"); altrimenti è DURF.
// I profili embedding di DURC e DURF sono quasi identici ("Documento Unico di
// Regolarità ...") e il fallback LLM li confonde: il nome esplicito è l'unico
// discriminante affidabile.
const RE_NOME_DURC = /documento unico (di )?regolarit[àa] contributiva/i;
const RE_NOME_DURF = /documento unico (di )?regolarit[àa] fiscale/i;
const RE_SIGLA_DURC = /\bdurc\b/i;
const RE_SIGLA_DURF = /\bdurf\b/i;

// L'API embeddings (text-embedding-3-small) rifiuta input oltre 8191 token (400 "maximum
// input length"): un contratto composito reale (es. NOMIOS, 227k caratteri) lo supera
// abbondantemente. 24000 caratteri è una stima prudente per testo giuridico italiano
// (~3 caratteri/token, margine di sicurezza sotto il limite di 8191 token) — abbastanza
// da superare il frontespizio/riferimenti amministrativi iniziali (SAP, OdA) e raggiungere
// il corpo delle clausole che identifica davvero il tipo di documento. BUG REALE osservato
// con un valore troppo basso (6000 caratteri, preso in prestito dal fallback LLM che ha un
// vincolo diverso — costo/latenza del prompt, non un limite API): il troncamento tagliava
// via le CGC lasciando solo il frontespizio amministrativo, classificato erroneamente ODA.
// Stesso valore usato per gli esempi salvati (classificazione-esempi.js#TRUNCATE_LEN) per
// coerenza nel confronto embedding.
const TRUNCATE_LEN = 24000;

function _nomeEsplicito(testo) {
  if (RE_NOME_DURC.test(testo) || RE_SIGLA_DURC.test(testo)) return 'DURC';
  if (RE_NOME_DURF.test(testo) || RE_SIGLA_DURF.test(testo)) return 'DURF';
  return null;
}

// Se la classificazione (embedding o LLM) ricade nel dominio DURC/DURF,
// applica la regola del nome esplicito. Ritorna la coppia {tipo, cambiato}.
function _applicaRegolaDurc(tipo, testo) {
  if (tipo !== 'DURC' && tipo !== 'DURF') return { tipo, cambiato: false };
  const esplicito = _nomeEsplicito(testo);
  if (esplicito) return { tipo: esplicito, cambiato: esplicito !== tipo };
  // Nessun nome esplicito nel documento: altrimenti è DURF.
  if (tipo !== 'DURF') return { tipo: 'DURF', cambiato: true };
  return { tipo, cambiato: false };
}

async function _embeddingsRiferimento() {
  if (!_embeddingsRiferimentoCache) {
    // Filter out entries without testoRiferimento to avoid sending undefined/null to OpenAI API
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const testi = conRiferimento.map(t => t.testoRiferimento);
    const vettori = await openai.embeddings(testi);
    _embeddingsRiferimentoCache = conRiferimento.map((t, i) => ({ key: t.key, embedding: vettori[i] }));
  }
  return _embeddingsRiferimentoCache;
}

async function _poolEmbeddings() {
  const [statici, esempi] = await Promise.all([_embeddingsRiferimento(), caricaEsempi()]);
  return [...statici, ...esempi];
}

async function _classificaConLLM(testo) {
  const categorie = TIPOLOGIE_ALLEGATO.map(t => `${t.key}: ${t.label}`).join('\n');
  const systemPrompt = `Sei un classificatore di documenti amministrativi/contrattuali. ` +
    `Data una delle seguenti categorie, oppure "ALTRO" se nessuna è pertinente, rispondi in JSON con { "tipo": "<CHIAVE>", "confidenza": <0-1> }.\nCategorie:\n${categorie}\nALTRO: nessuna delle precedenti`;
  try {
    const risposta = await openai.chatJSON(systemPrompt, testo.slice(0, 6000));
    const chiaviValide = new Set([...TIPOLOGIE_ALLEGATO.map(t => t.key), 'ALTRO']);
    if (risposta && chiaviValide.has(risposta.tipo)) {
      return { tipo: risposta.tipo, confidenza: typeof risposta.confidenza === 'number' ? risposta.confidenza : null, metodoRiconoscimento: 'llm' };
    }
  } catch (e) {
    console.warn('[allegato-classifier] fallback LLM fallito:', e.message);
  }
  return { tipo: 'ALTRO', confidenza: null, metodoRiconoscimento: 'llm' };
}

async function classificaAllegato(testo) {
  if (!testo || !testo.trim()) return { tipo: 'ALTRO', confidenza: null, metodoRiconoscimento: 'nessuno' };

  // Niente pre-check su tutto il testo: un contratto composito lungo (es. CGC+CPC+Allegati
  // concatenati) può CITARE "DURC" dentro una clausola di pagamento senza essere un DURC —
  // bug reale osservato: contratto NOMIOS classificato DURC solo perché l'art. 9.9 CGC
  // menziona "DURC (Documento Unico di Regolarità Contributiva)" a pagina 26/50. Il nome
  // esplicito resta affidabile SOLO come disambiguazione DURC/DURF quando la classificazione
  // (embedding/LLM) è già caduta in quel dominio (vedi _applicaRegolaDurc sotto), non come
  // override dell'intera classificazione basato su una singola menzione nel testo.
  const pool = await _poolEmbeddings();
  const [embeddingTesto] = await openai.embeddings([testo.slice(0, TRUNCATE_LEN)]);

  let bestSim = 0, bestKey = null;
  for (const rif of pool) {
    const sim = cosineSimilarity(embeddingTesto, rif.embedding);
    if (sim > bestSim) { bestSim = sim; bestKey = rif.key; }
  }
  bestSim = Math.round(bestSim * 10000) / 10000;

  let tipo, confidenza, metodoRiconoscimento;
  if (bestSim >= SOGLIA_TIPO_ALLEGATO) {
    tipo = bestKey; confidenza = bestSim; metodoRiconoscimento = 'embedding';
  } else {
    const llm = await _classificaConLLM(testo);
    tipo = llm.tipo; confidenza = llm.confidenza; metodoRiconoscimento = llm.metodoRiconoscimento;
  }

  // Regola DURC/DURF: se la classificazione ricade nel dominio, il nome esplicito decide.
  const regola = _applicaRegolaDurc(tipo, testo);
  if (regola.cambiato) {
    return { tipo: regola.tipo, confidenza, metodoRiconoscimento: 'nomeEsplicito' };
  }
  return { tipo: regola.tipo, confidenza, metodoRiconoscimento };
}

// Dimensione dei blocchi in cui viene spezzato il documento per rilevaTipiPresenti: abbastanza
// piccola da isolare una singola sezione senza diluirla con testo circostante di altro tipo,
// abbastanza grande da contenere contenuto sostanziale reale (non solo un titolo).
const DIMENSIONE_CHUNK_RILEVAZIONE = 3000;

function _spezzaInChunk(testo, dimensione) {
  const chunk = [];
  for (let i = 0; i < testo.length; i += dimensione) {
    chunk.push(testo.slice(i, i + dimensione));
  }
  return chunk;
}

// Un singolo file caricato può essere un fascicolo che raccoglie più documenti concatenati
// (es. OdA + CGC + CPC + Allegati A-G in un unico PDF, caso reale osservato: NOMIOS 71 pagine).
// classificaAllegato ritorna UN solo tipo dominante sull'intero testo, quindi su un fascicolo
// composito riconosce solo la sezione più "pesante" (tipicamente la CGC) e nasconde le altre:
// la verifica di completezza le vedrebbe tutte assenti anche se fisicamente presenti nel file.
//
// Approccio: come classificaAllegato (vincitore-per-somiglianza sopra soglia), ma applicato per
// BLOCCO anziché sull'intero documento: ogni chunk vota per la SOLA tipologia a cui somiglia di
// più (non ogni tipologia sopra soglia indipendentemente), e solo se quella somiglianza supera
// SOGLIA_TIPO_ALLEGATO. Confrontato contro il pool reale (_poolEmbeddings: profili sintetici +
// esempi reali salvati), non solo contro le brevi descrizioni sintetiche — nel dominio di testo
// contrattuale italiano ICT tutte le tipologie condividono un lessico affine e le somiglianze
// assolute contro una descrizione di 1-2 frasi sono tutte alte e ravvicinate (es. reale: CPC
// 0.92 ma ALLEGATO_A 0.85 sullo stesso chunk, nessuna soglia assoluta separa i due); il ranking
// RELATIVO entro il chunk resta invece affidabile — il vincitore corretto vince sempre per un
// margine netto, confermato su documenti reali (vedi test).
//
// DUE BUG REALI osservati nei tentativi precedenti (Contratto_ADAM.pdf, solo CPC):
// 1) prompt LLM "elenca le tipologie che riconosci nel testo" (anche con istruzioni esplicite +
//    estratto letterale verificato ≥100 caratteri): una clausola indice ("Premesse e Allegati"
//    che elenca per lettera A) B) C)... gli allegati previsti, con descrizioni dettagliate)
//    veniva scambiata per contenuto reale di ogni tipologia citata — 7-9 falsi positivi, perché
//    la citazione stessa era lunga e dettagliata abbastanza da superare qualunque soglia di
//    lunghezza sull'estratto.
// 2) embedding a soglia indipendente PER tipologia (non vincitore-per-chunk) contro le sole
//    descrizioni sintetiche: stesso problema, punteggi assoluti troppo ravvicinati tra tipologie
//    diverse sullo stesso chunk per usare una soglia fissa su ciascuna indipendentemente.
async function rilevaTipiPresenti(testo) {
  if (!testo || !testo.trim()) return [];

  const pool = await _poolEmbeddings();
  const sottoTipologie = TIPOLOGIE_ALLEGATO.filter(t => t.sottoTipologia);
  const chiaviSotto = new Set(sottoTipologie.map(t => t.key));
  const poolSotto = pool.filter(p => chiaviSotto.has(p.key));
  if (!poolSotto.length) return [];

  try {
    const chunk = _spezzaInChunk(testo, DIMENSIONE_CHUNK_RILEVAZIONE);
    const embeddingChunk = await openai.embeddings(chunk);

    const tipiRilevati = new Set();
    for (const embChunk of embeddingChunk) {
      let bestSim = 0, bestKey = null;
      for (const rif of poolSotto) {
        const sim = cosineSimilarity(embChunk, rif.embedding);
        if (sim > bestSim) { bestSim = sim; bestKey = rif.key; }
      }
      if (bestSim >= SOGLIA_TIPO_ALLEGATO) tipiRilevati.add(bestKey);
    }
    return [...tipiRilevati];
  } catch (e) {
    console.warn('[allegato-classifier] rilevaTipiPresenti fallita:', e.message);
    return [];
  }
}

module.exports = { classificaAllegato, rilevaTipiPresenti };
