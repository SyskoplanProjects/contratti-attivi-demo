const cds = require('@sap/cds');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const openai = require('../modules/openai-module');

const SEGMENTAZIONE_SYSTEM_PROMPT = `Sei un assistente che segmenta un documento contrattuale italiano in clausole numerate.
Rispondi SOLO con un oggetto JSON nella forma: { "clausole": [ { "numero": <intero progressivo a partire da 1>, "titolo": <stringa breve>, "testo": <testo completo della clausola> } ] }.
Le sottosezioni di una clausola (es. commi 5.1, 5.2 dentro l'articolo 5) NON vanno restituite come clausole separate: il numero resta quello della clausola madre e tutte le sottosezioni vanno incluse nel campo "testo" della clausola madre, nell'ordine in cui compaiono nel documento.
Il campo "testo" deve riportare il contenuto della clausola COPIATO LETTERALMENTE dal documento originale (stessa punteggiatura, stesse parole, nessuna correzione, riformulazione o riassunto): viene usato per localizzare la clausola nell'anteprima del documento tramite ricerca testuale, quindi anche piccole modifiche al testo impediscono di trovarla.
Se il documento non contiene clausole riconoscibili, rispondi con { "clausole": [] }.`;

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
    let riga = '';
    let prev = null;
    for (const it of content.items) {
      if (it.str && !_eRuotato(it.transform)) {
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

// Il prompt chiede al modello di copiare il testo letteralmente, ma nulla lo impedisce di
// riformulare o inventare una clausola plausibile (specialmente su documenti lunghi): senza
// verifica, capita che vengano restituite clausole che nel documento non ci sono affatto.
// Normalizza gli spazi bianchi (whitespace/newline collassati, case-insensitive) e verifica che
// il testo della clausola sia effettivamente un sottostringa del documento originale.
function _normalizzaSpazi(testo) {
  return String(testo || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function _clausolaPresenteNelTesto(testoClausola, testoDocumento) {
  const normClausola = _normalizzaSpazi(testoClausola);
  if (!normClausola) return false;
  return _normalizzaSpazi(testoDocumento).includes(normClausola);
}

// Il modello può restituire le sottosezioni di una clausola (5.1, 5.2) come clausole separate con
// numero decimale: se lasciate così l'anteprima mostra commi orfani e la clausola madre senza
// contenuto. La riportiamo dentro la clausola madre (numero = parte intera), nell'ordine del
// documento. Se la madre non c'è, la sezione va aggregata alla clausola con numero intero
// immediatamente precedente (comportamento del parser regex).
function _fondeSezioni(clausole) {
  const madri = [];
  const sezioni = [];
  for (const c of clausole) {
    (Number.isInteger(c.numero) ? madri : sezioni).push(c);
  }

  // Un riepilogo/allegato del documento può ricitare un articolo già estratto altrove
  // (es. "...con riferimento all'art. 3) (Osservanza di leggi...)..."): il modello lo segmenta
  // come clausola a sé con lo stesso numero intero della clausola reale, ma testo minimo
  // (poche parole tra parentesi). Tra due candidate con lo stesso numero si tiene quella con
  // testo più lungo (la clausola vera) e si scarta l'altra.
  const madriPerNumero = new Map();
  for (const m of madri) {
    const esistente = madriPerNumero.get(m.numero);
    if (!esistente || m.testo.length > esistente.testo.length) madriPerNumero.set(m.numero, m);
  }
  const madriUniche = [...madriPerNumero.values()];

  if (!sezioni.length) return madriUniche.sort((a, b) => a.numero - b.numero);

  const risultato = [...madriUniche];

  const madrePerSezione = s => {
    const madre = madriPerNumero.get(Math.floor(s.numero));
    if (madre) return madre;
    let precedente = null;
    for (const m of madriUniche) {
      if (m.numero < s.numero) precedente = m;
    }
    return precedente;
  };

  for (const s of sezioni) {
    const madre = madrePerSezione(s);
    if (!madre) { risultato.push(s); continue; }
    madre.testo = madre.testo ? `${madre.testo}\n${s.testo}` : s.testo;
  }

  return risultato.sort((a, b) => a.numero - b.numero);
}

// Alcuni documenti hanno l'intestazione della clausola scritta a ridosso del testo (senza
// separazione tipografica netta): il modello a volte la lascia dentro "testo" invece di
// valorizzare "titolo", che arriva vuoto. Se la prima riga del testo è breve e non è già
// l'inizio di una sottosezione numerata (es. "1.1 ..."), la trattiamo come titolo recuperato
// e la stacchiamo dal corpo, invece del placeholder generico "Clausola N".
function _recuperaTitoloDaTesto(sTesto) {
  const iNewline = sTesto.indexOf('\n');
  const sPrimaRiga = (iNewline === -1 ? sTesto : sTesto.slice(0, iNewline)).trim();
  if (!sPrimaRiga || sPrimaRiga.length > 100 || /^\d+(\.\d+)*[\s.)]/.test(sPrimaRiga)) return null;
  return { titolo: sPrimaRiga, resto: (iNewline === -1 ? '' : sTesto.slice(iNewline + 1)).replace(/^\s+/, '') };
}

async function estraiClausoleAI(testoDocumento) {
  const result = await openai.chatJSON(SEGMENTAZIONE_SYSTEM_PROMPT, testoDocumento);
  const clausole = Array.isArray(result?.clausole) ? result.clausole : [];
  if (!clausole.length) throw new Error('AI non ha estratto nessuna clausola');

  const scartate = [];
  const valide = clausole
    .map((c, i) => {
      const sTestoGrezzo = String(c.testo || '');
      const sTitoloAI = String(c.titolo || '').trim();
      if (sTitoloAI) return { numero: Number(c.numero) || i + 1, titolo: sTitoloAI, testo: sTestoGrezzo };

      const recuperato = sTestoGrezzo && _recuperaTitoloDaTesto(sTestoGrezzo);
      return {
        numero: Number(c.numero) || i + 1,
        titolo: recuperato ? recuperato.titolo : `Clausola ${i + 1}`,
        testo: recuperato ? recuperato.resto : sTestoGrezzo
      };
    })
    .filter(c => c.testo)
    .filter(c => {
      const presente = _clausolaPresenteNelTesto(c.testo, testoDocumento);
      if (!presente) scartate.push(c.titolo);
      return presente;
    });

  if (scartate.length) {
    console.warn('[ai-import] clausole scartate perché non trovate letteralmente nel documento:', scartate.join('; '));
  }
  if (!valide.length) throw new Error('AI non ha estratto nessuna clausola verificabile nel documento');
  return _fondeSezioni(valide);
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
