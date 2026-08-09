const openai = require('../modules/openai-module');
const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');
const { riconosciTemplateContrattuale } = require('./template-recognizer');

// Cerca lo span di un valore estratto nel testo posizionato: match esatto (case-insensitive)
// prima, poi fallback su normalizzazione whitespace. Unisce (bounding box) tutti gli item che
// si sovrappongono allo span trovato. Nessun match -> null, non blocca mai il flusso a monte.
function _trovaPosizione(valore, testoPosizionato) {
  if (!valore || !testoPosizionato || !testoPosizionato.items || !testoPosizionato.items.length) return null;

  const { testo, items } = testoPosizionato;
  const sValore = String(valore);

  let indice = testo.indexOf(sValore);
  let lunghezza = sValore.length;

  if (indice < 0) {
    // Normalizza run di spazi/newline in un singolo spazio, mantenendo per ogni carattere
    // della stringa normalizzata l'indice corrispondente in `testo` (mappa): senza la mappa,
    // collassare run multipli (es. gli "\n" a cavallo di paragrafi diversi) sposta l'offset
    // trovato rispetto al testo originale, e itemsCoinvolti sotto usa offset sul testo originale.
    let testoNorm = '';
    const mappa = [];
    let ultimoEraSpazio = false;
    for (let i = 0; i < testo.length; i++) {
      const ch = testo[i];
      if (/\s/.test(ch)) {
        if (!ultimoEraSpazio) { testoNorm += ' '; mappa.push(i); }
        ultimoEraSpazio = true;
      } else {
        testoNorm += ch.toLowerCase();
        mappa.push(i);
        ultimoEraSpazio = false;
      }
    }
    const valoreNorm = sValore.replace(/\s+/g, ' ').trim().toLowerCase();
    const idxNorm = testoNorm.indexOf(valoreNorm);
    if (idxNorm < 0 || !valoreNorm.length) return null;
    indice = mappa[idxNorm];
    lunghezza = mappa[idxNorm + valoreNorm.length - 1] - indice + 1;
  }

  const fine = indice + lunghezza;
  const itemsSpan = items.filter(it => it.offsetInizio < fine && it.offsetFine > indice);
  if (!itemsSpan.length) return null;

  // Se lo span attraversa un salto pagina, limita il box alla sola pagina del primo item:
  // le coordinate y ripartono da 0 su ogni pagina, mescolarle produrrebbe un box enorme
  // (min/max su y di pagine diverse) invece di uno span sulla singola pagina.
  const pagina = itemsSpan[0].pagina;
  const itemsCoinvolti = itemsSpan.filter(it => it.pagina === pagina);
  const x = Math.min(...itemsCoinvolti.map(it => it.x));
  const y = Math.min(...itemsCoinvolti.map(it => it.y));
  const right = Math.max(...itemsCoinvolti.map(it => it.x + it.width));
  const bottom = Math.max(...itemsCoinvolti.map(it => it.y + it.height));

  // Arrotondato a 4 decimali: precisione dello schema CDS Decimal(10,4) di PosizioneCampo,
  // altrimenti il rumore in virgola mobile di pdf.js (es. 172.49999281250004) viene rifiutato.
  const round4 = n => Math.round(n * 10000) / 10000;
  return { pagina, x: round4(x), y: round4(y), width: round4(right - x), height: round4(bottom - y) };
}

// Estrae dal testo grezzo di un allegato (già classificato per tipo) i campi strutturati
// definiti in campiChiave per quel tipo. Per ogni campo il modello ritorna { valore, confidenza }
// invece di un valore nudo: la confidenza è autodichiarata dal modello (0-1), non calibrata,
// e alimenta il badge nel wizard di verifica. I campi con staticValue e quelli con dynamic
// (es. templateContrattuale, valorizzato da un motore dedicato — vedi Task 3b) non vengono
// chiesti al modello insieme agli altri.
async function estraiCampiAllegato(tipo, testo, testoPosizionato = null) {
  const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
  if (!tipologia || !tipologia.campiChiave || !testo || !testo.trim()) {
    return { metadati: [], dataScadenza: null };
  }

  const campiDaChiedere = tipologia.campiChiave.filter(c => !c.staticValue && !c.dynamic);
  const campiStatici = tipologia.campiChiave.filter(c => c.staticValue);
  const campiDinamici = tipologia.campiChiave.filter(c => c.dynamic);

  let risultato = {};
  if (campiDaChiedere.length) {
    const elencoCampi = campiDaChiedere.map(c => `- ${c.campo}: ${c.descrizione}`).join('\n');
    const systemPrompt = `Sei un estrattore di dati da documenti amministrativi/contrattuali italiani (${tipologia.label}). ` +
      `Dal testo fornito estrai ESATTAMENTE questi campi. Per ciascun campo rispondi con un oggetto ` +
      `{ "valore": <stringa o numero o null>, "confidenza": <numero tra 0 e 1>, "testoOriginale": <stringa: porzione di testo letterale, esattamente come appare nel documento, da cui è stato ricavato il valore (es. per una data riformattata in ISO, riporta qui la data come scritta nel testo originale); null se il campo non è presente> }. ` +
      `Usa valore null e confidenza 0 se il campo non è presente nel testo, non inventare mai valori. Rispondi in JSON ` +
      `con un oggetto che ha come chiavi questi campi:\n${elencoCampi}`;

    try {
      risultato = await openai.chatJSON(systemPrompt, testo.slice(0, 8000)) || {};
    } catch (e) {
      console.warn('[allegato-extractor] estrazione campi fallita:', e.message);
      risultato = {};
    }
  }

  const metadatiDinamici = await Promise.all(campiDinamici.map(async (c) => {
    if (c.dynamic === 'riconosciTemplateContrattuale') {
      const { valore, confidenza } = await riconosciTemplateContrattuale(testo);
      return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore, confidenza, valoreOriginaleAI: valore, posizione: _trovaPosizione(valore, testoPosizionato) };
    }
    return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore: null, confidenza: null, valoreOriginaleAI: null, posizione: null };
  }));

  const metadati = campiDaChiedere.map(c => {
    const r = risultato[c.campo];
    const valoreGrezzo = (r && typeof r === 'object' && r.valore != null) ? String(r.valore).trim() : '';
    const valore = (valoreGrezzo && valoreGrezzo.toLowerCase() !== 'null') ? valoreGrezzo : null;
    const confidenza = (r && typeof r === 'object' && typeof r.confidenza === 'number')
      ? Math.max(0, Math.min(1, r.confidenza)) : 0;
    // Per campi che il modello riformatta (es. date in ISO, importi come numero puro) il valore
    // normalizzato non compare mai letteralmente nel testo del PDF: si cerca invece la posizione
    // usando lo span verbatim restituito dal modello, con fallback al valore stesso.
    const testoOriginale = (r && typeof r === 'object' && r.testoOriginale) ? String(r.testoOriginale) : valore;
    return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore, confidenza, valoreOriginaleAI: valore, posizione: _trovaPosizione(testoOriginale, testoPosizionato) };
  }).concat(campiStatici.map(c => ({
    campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore: c.staticValue, confidenza: null, valoreOriginaleAI: c.staticValue, posizione: null
  }))).concat(metadatiDinamici);

  const campoScadenza = tipologia.campiChiave.find(c => c.scadenza);
  const metaScadenza = campoScadenza && metadati.find(m => m.campo === campoScadenza.campo);
  const dataScadenza = (metaScadenza && metaScadenza.valore && /^\d{4}-\d{2}-\d{2}$/.test(metaScadenza.valore))
    ? metaScadenza.valore : null;

  return { metadati, dataScadenza };
}

module.exports = { estraiCampiAllegato, trovaPosizione: _trovaPosizione };
