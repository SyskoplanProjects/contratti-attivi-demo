const openai = require('../modules/openai-module');
const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');
const { riconosciTemplateContrattuale } = require('./template-recognizer');

// Estrae dal testo grezzo di un allegato (già classificato per tipo) i campi strutturati
// definiti in campiChiave per quel tipo. Per ogni campo il modello ritorna { valore, confidenza }
// invece di un valore nudo: la confidenza è autodichiarata dal modello (0-1), non calibrata,
// e alimenta il badge nel wizard di verifica. I campi con staticValue e quelli con dynamic
// (es. templateContrattuale, valorizzato da un motore dedicato — vedi Task 3b) non vengono
// chiesti al modello insieme agli altri.
async function estraiCampiAllegato(tipo, testo) {
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
      `{ "valore": <stringa o numero o null>, "confidenza": <numero tra 0 e 1> }. Usa valore null e ` +
      `confidenza 0 se il campo non è presente nel testo, non inventare mai valori. Rispondi in JSON ` +
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
      return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore, confidenza };
    }
    return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore: null, confidenza: null };
  }));

  const metadati = campiDaChiedere.map(c => {
    const r = risultato[c.campo];
    const valore = (r && typeof r === 'object' && r.valore != null && r.valore !== '') ? String(r.valore) : null;
    const confidenza = (r && typeof r === 'object' && typeof r.confidenza === 'number')
      ? Math.max(0, Math.min(1, r.confidenza)) : 0;
    return { campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore, confidenza };
  }).concat(campiStatici.map(c => ({
    campo: c.campo, etichetta: c.etichetta, sezione: c.sezione, valore: c.staticValue, confidenza: null
  }))).concat(metadatiDinamici);

  const campoScadenza = tipologia.campiChiave.find(c => c.scadenza);
  const metaScadenza = campoScadenza && metadati.find(m => m.campo === campoScadenza.campo);
  const dataScadenza = (metaScadenza && metaScadenza.valore && /^\d{4}-\d{2}-\d{2}$/.test(metaScadenza.valore))
    ? metaScadenza.valore : null;

  return { metadati, dataScadenza };
}

module.exports = { estraiCampiAllegato };
