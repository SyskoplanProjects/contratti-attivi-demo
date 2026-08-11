const cds = require('@sap/cds');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const openai = require('../modules/openai-module');

// Il modello indica solo dove INIZIA ogni clausola/articolo (numero, titolo, prime parole
// esatte del corpo): il testo completo viene poi ritagliato direttamente dal documento
// originale (vedi estraiClausoleAI), non ri-trascritto dal modello. Chiedere al modello di
// ricopiare per intero il corpo di una clausola lunga (anche centinaia di parole) è un compito
// soggetto a variabilità di campionamento — bug reale osservato (Contratto_ADAM.pdf): anche
// dopo aver corretto i problemi tipografici noti (virgolette, numeri di pagina iniettati), una
// clausola su otto veniva scartata in modo non deterministico, con una piccola differenza di
// trascrizione diversa a ogni chiamata. Un'ancora breve (poche parole) ha una probabilità di
// trascrizione imperfetta molto più bassa di un corpo intero, e il testo reale viene preso
// direttamente dalla fonte: non può mai divergere da essa.
const SEGMENTAZIONE_SYSTEM_PROMPT = `Sei un assistente che segmenta un documento contrattuale italiano individuando i confini delle clausole/articoli di primo livello.
Rispondi SOLO con un oggetto JSON nella forma: { "clausole": [ { "numero": <intero progressivo dell'articolo, a partire da 1>, "titolo": <stringa breve>, "inizio": <le prime 8-12 parole ESATTE con cui inizia il CORPO dell'articolo, copiate letteralmente> } ] }.
Considera solo i confini di clausola/articolo di primo livello (numerazione intera 1, 2, 3...): le sottosezioni (es. commi 5.1, 5.2 dentro l'articolo 5) NON vanno restituite come voci separate, fanno parte del corpo dell'articolo genitore e verranno incluse automaticamente.
Il campo "inizio" deve essere copiato ESATTAMENTE dal documento (stesse parole, stessa punteggiatura, senza il numero/titolo dell'articolo): viene usato per localizzare l'inizio dell'articolo nel testo originale tramite ricerca testuale.
Se il documento non contiene clausole/articoli riconoscibili, rispondi con { "clausole": [] }.`;

const SOGLIA_RIUSO = 0.92;
const SOGLIA_POSSIBILE_MODIFICA = 0.75;

async function estraiTestoDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function estraiTestoXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames.map(nome => XLSX.utils.sheet_to_csv(wb.Sheets[nome])).join('\n');
}

// Decide se tra due text-item consecutivi sulla stessa riga va inserito uno spazio, guardando
// il vuoto orizzontale reale tra la fine del primo e l'inizio del secondo (in unità PDF, dal
// transform). Senza questo, item adiacenti dello stesso "run" (es. "info@pec" + ".dominio.it"
// spezzati dal PDF per motivi di font) prendono uno spazio spurio, mentre celle di tabella
// distanti ne perdono uno.
function _serveSpazioTra(prev, curr) {
  if (!prev || !prev.transform || !curr.transform) return true;
  const xFinePrev = prev.transform[4] + (prev.width || 0);
  const xInizioCurr = curr.transform[4];
  const scala = prev.height || curr.height || 10;
  return (xInizioCurr - xFinePrev) > scala * 0.2;
}

// Righe di rumore tipiche delle visure/estratti camerali: puntini di un indice
// ("....................... 2") senza contenuto informativo.
function _eRigaIndice(riga) {
  return /^\.{4,}\s*\d*$/.test(riga.trim());
}

// Righe che sono SOLO un link o una filigrana di editor PDF non registrati (es. "Click to BUY
// NOW!", "PDF-XChange Editor", "www.pdf-xchange.com"), stampate dal software su ogni pagina.
// Non toccano email/PEC reali del documento (quelle non sono mai una riga isolata di solo URL).
function _eRigaLink(riga) {
  const r = riga.trim();
  if (/^(https?:\/\/|www\.)\S*$/i.test(r)) return true;
  if (/^click to buy now!?$/i.test(r)) return true;
  if (/^pdf-?x?change editor$/i.test(r)) return true;
  return false;
}

// Testo ruotato/diagonale (timbri e filigrane tipo "Click to BUY NOW!" di PDF-XChange) è reso
// da pdf.js come sequenza di text-item con matrice di trasformazione non allineata agli assi
// (b/c diversi da zero), spesso un carattere per item: il filtro per riga intera in _eRigaLink
// non li intercetta perché ogni "riga" è una singola lettera. Si scarta il testo alla fonte.
function _eRuotato(transform) {
  if (!transform || transform.length < 4) return false;
  return Math.abs(transform[1]) > 1e-3 || Math.abs(transform[2]) > 1e-3;
}

// Numero di pagina in piè/capo pagina: pdf.js lo restituisce come text-item a sé (spesso il
// PRIMO item della pagina, prima di qualunque contenuto reale) posizionato nella fascia di
// margine — bug reale osservato (Contratto_ADAM.pdf): il "2" di piè pagina 2 e il "3" di
// piè pagina 3 arrivano come primissimo item della rispettiva pagina (prev=undefined) alla
// stessa quota (y≈59.6 su pagina alta 842pt, fascia di margine standard ~1 pollice/72pt) e,
// senza un a-capo che li isoli, si fondono nella riga successiva del corpo del testo
// ("dati; 2 • allegato..."). Il testo AI-estratto (corretto, senza il numero) non trova più
// riscontro letterale nel documento e la clausola viene scartata da _clausolaPresenteNelTesto.
function _eNumeroPagina(it, altezzaPagina) {
  const testo = (it.str || '').trim();
  if (!/^[0-9]{1,4}$/.test(testo)) return false;
  const y = it.transform ? it.transform[5] : null;
  if (y == null || !altezzaPagina) return false;
  const margine = 72;
  return y < margine || y > altezzaPagina - margine;
}

// Intestazioni/piè di pagina ripetuti identici su ogni pagina (es. "Registro Imprese",
// "Archivio ufficiale della CCIAA", numero documento, codice fiscale...) non aggiungono
// informazione dalla seconda occorrenza in poi: le teniamo solo la prima volta.
function _rimuoviRigheRipetute(righe) {
  const conteggio = new Map();
  for (const r of righe) {
    const chiave = r.trim();
    if (chiave.length < 12) continue;
    conteggio.set(chiave, (conteggio.get(chiave) || 0) + 1);
  }
  const viste = new Set();
  return righe.filter(r => {
    const chiave = r.trim();
    if (chiave.length < 12 || (conteggio.get(chiave) || 0) < 3) return true;
    if (viste.has(chiave)) return false;
    viste.add(chiave);
    return true;
  });
}

async function estraiTestoPdf(buffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const righe = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const altezzaPagina = page.getViewport ? page.getViewport({ scale: 1 }).height : null;
    let riga = '';
    let prev = null;
    for (const it of content.items) {
      if (it.str && !_eRuotato(it.transform) && !_eNumeroPagina(it, altezzaPagina)) {
        if (riga && _serveSpazioTra(prev, it)) riga += ' ';
        riga += it.str;
        prev = it;
      }
      if (it.hasEOL) {
        if (riga.trim() && !_eRigaIndice(riga) && !_eRigaLink(riga)) righe.push(riga.trim());
        riga = '';
        prev = null;
      }
    }
    if (riga.trim() && !_eRigaIndice(riga) && !_eRigaLink(riga)) righe.push(riga.trim());
  }
  return _rimuoviRigheRipetute(righe).join('\n');
}

async function extractTextMultiFormato(buffer, mimeType, filename) {
  const name = (filename || '').toLowerCase();
  const isPdf = name.endsWith('.pdf') || mimeType === 'application/pdf';
  const isDocx = name.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isXlsx = name.endsWith('.xlsx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (isPdf) return estraiTestoPdf(buffer);
  if (isDocx) return estraiTestoDocx(buffer);
  if (isXlsx) return estraiTestoXlsx(buffer);

  const err = new Error(`Formato file non riconosciuto: ${filename}`);
  err.code = 'UNSUPPORTED_FORMAT';
  throw err;
}

// Costruisce una regex tollerante a spazi multipli/newline (\s+ tra ogni parola) e a varianti
// tipografiche di virgolette (dritte/curve equivalenti), per localizzare l'ancora ESATTAMENTE
// nel documento originale — non in una copia normalizzata: la posizione trovata è quella reale,
// usata direttamente per il taglio del testo (vedi estraiClausoleAI), senza bisogno di rimappare
// indici tra versione normalizzata e originale.
function _regexDaAncora(ancora) {
  const parole = String(ancora || '').trim().split(/\s+/).filter(Boolean);
  if (!parole.length) return null;
  const pattern = parole
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .map(p => p.replace(/["“”„‟″]/g, '["“”„‟″]').replace(/['‘’‚‛′]/g, "['‘’‚‛′]"))
    .join('\\s+');
  return new RegExp(pattern, 'i');
}

// Cerca l'ancora nel documento a partire da `daPosizione` (non dall'inizio): le clausole
// vengono elaborate nell'ordine restituito dal modello, che corrisponde all'ordine reale nel
// documento (richiesto esplicitamente nel prompt) — ricominciare la ricerca da dove si era
// arrivati impedisce che un'ancora corta trovi per errore un'occorrenza precedente (es. una
// citazione dell'articolo dentro una clausola-indice più in alto nel documento, bug reale visto
// con l'approccio precedente basato su corpo intero, vedi commento su SEGMENTAZIONE_SYSTEM_PROMPT).
function _trovaPosizioneAncora(ancora, testoDocumento, daPosizione) {
  const regex = _regexDaAncora(ancora);
  if (!regex) return -1;
  const match = testoDocumento.slice(daPosizione).match(regex);
  return match ? daPosizione + match.index : -1;
}

async function estraiClausoleAI(testoDocumento) {
  const result = await openai.chatJSON(SEGMENTAZIONE_SYSTEM_PROMPT, testoDocumento);
  const clausoleGrezze = Array.isArray(result?.clausole) ? result.clausole : [];
  if (!clausoleGrezze.length) throw new Error('AI non ha estratto nessuna clausola');

  const scartate = [];
  const posizionate = [];
  let cursore = 0;
  clausoleGrezze.forEach((c, i) => {
    const numero = Number(c.numero) || i + 1;
    const titolo = String(c.titolo || '').trim() || `Clausola ${numero}`;
    const posizione = _trovaPosizioneAncora(c.inizio, testoDocumento, cursore);
    if (posizione === -1) { scartate.push(titolo); return; }
    posizionate.push({ numero, titolo, posizione });
    cursore = posizione + 1;
  });

  if (scartate.length) {
    console.warn('[ai-import] clausole scartate perché il testo di inizio non è stato trovato nel documento:', scartate.join('; '));
  }
  if (!posizionate.length) throw new Error('AI non ha estratto nessuna clausola verificabile nel documento');

  // Il testo di ciascuna clausola è il taglio REALE del documento tra il proprio inizio e
  // l'inizio della clausola successiva (o fine documento per l'ultima): non può mai divergere
  // dalla fonte, e include automaticamente tutte le sottosezioni intermedie (es. 5.1, 5.2 tra
  // l'inizio dell'articolo 5 e l'inizio dell'articolo 6), senza bisogno di fonderle a parte.
  return posizionate.map((c, i) => {
    const fine = i + 1 < posizionate.length ? posizionate[i + 1].posizione : testoDocumento.length;
    return { numero: c.numero, titolo: c.titolo, testo: testoDocumento.slice(c.posizione, fine).trim() };
  });
}

async function estraiClausoleConFallback(buffer, filename, mimeType) {
  try {
    const testo = await extractTextMultiFormato(buffer, mimeType, filename);
    return await estraiClausoleAI(testo);
  } catch (e) {
    console.warn('[ai-import] estrazione AI fallita, fallback al parser regex:', e.message);
    const { parseFile } = require('../import-handler');
    return parseFile(buffer, filename, mimeType);
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function trovaMatch(clausoleEstratte, candidatiPerCodice) {
  const codiciConCandidato = clausoleEstratte
    .map(c => `C${c.numero}`)
    .filter(codice => candidatiPerCodice[codice]);

  const testiDaEmbeddare = [
    ...clausoleEstratte.map(c => c.testo),
    ...codiciConCandidato.map(codice => candidatiPerCodice[codice].testo)
  ];

  const nessunMatch = () => clausoleEstratte.map(c => ({
    ...c, stato: 'NUOVA', similarity: 0, matchClausolaVersioneID: null
  }));

  if (!testiDaEmbeddare.length) return nessunMatch();

  let vettori;
  try {
    vettori = await openai.embeddings(testiDaEmbeddare);
  } catch (e) {
    console.warn('[ai-import] embeddings falliti, tutte le clausole proposte come nuove:', e.message);
    return nessunMatch();
  }

  const vettoriClausole = vettori.slice(0, clausoleEstratte.length);
  const vettoriCandidati = {};
  codiciConCandidato.forEach((codice, i) => {
    vettoriCandidati[codice] = vettori[clausoleEstratte.length + i];
  });

  return clausoleEstratte.map((c, i) => {
    const codice = `C${c.numero}`;
    const candidato = candidatiPerCodice[codice];
    if (!candidato || !vettoriCandidati[codice]) {
      return { ...c, stato: 'NUOVA', similarity: 0, matchClausolaVersioneID: null };
    }
    const similarity = cosineSimilarity(vettoriClausole[i], vettoriCandidati[codice]);
    let stato;
    if (similarity >= SOGLIA_RIUSO) {
      stato = candidato.testo === c.testo ? 'RIUSATA' : 'MODIFICATA';
    } else if (similarity >= SOGLIA_POSSIBILE_MODIFICA) {
      stato = 'MODIFICATA';
    } else {
      stato = 'NUOVA';
    }
    return {
      ...c, stato, similarity,
      matchClausolaVersioneID: stato === 'NUOVA' ? null : candidato.clausolaVersioneID
    };
  });
}

async function buildCandidatiPerCodice(tx, templateID) {
  if (!templateID) return {};
  const { TemplateVersion, TemplateVersionClausola, Clausola, ClausolaVersione } =
    cds.entities('com.reply.contrattiattivi');

  const versions = await tx.run(SELECT.from(TemplateVersion).where({ template_ID: templateID }).orderBy('numero desc'));
  if (!versions.length) return {};

  const righe = await tx.run(SELECT.from(TemplateVersionClausola).where({ templateVersion_ID: versions[0].ID }));
  const candidati = {};
  for (const riga of righe) {
    const clausola = await tx.run(SELECT.one.from(Clausola, riga.clausola_ID));
    const versione = await tx.run(SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID));
    if (clausola && versione) {
      candidati[clausola.codice] = { clausolaID: clausola.ID, clausolaVersioneID: versione.ID, testo: versione.testo };
    }
  }
  return candidati;
}

module.exports = {
  extractTextMultiFormato,
  estraiClausoleConFallback,
  estraiClausoleAI,
  cosineSimilarity,
  trovaMatch,
  buildCandidatiPerCodice
};
