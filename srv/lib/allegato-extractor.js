const openai = require('../modules/openai-module');
const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');

// Estrae dal testo grezzo di un allegato (già classificato per tipo) i campi strutturati
// definiti in campiChiave per quel tipo, invece di lasciare il testo come unico blob
// "ammassato". Ritorna { campiEstratti, dataScadenza } pronti da salvare su ContrattoAllegato:
// campiEstratti è il JSON serializzato di tutti i campi, dataScadenza è il campo marcato
// scadenza:true (se presente e valorizzato), duplicato in colonna propria per query/alert.
async function estraiCampiAllegato(tipo, testo) {
  const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
  if (!tipologia || !tipologia.campiChiave || !testo || !testo.trim()) {
    return { campiEstratti: null, dataScadenza: null };
  }

  const elencoCampi = tipologia.campiChiave.map(c => `- ${c.campo}: ${c.descrizione}`).join('\n');
  const systemPrompt = `Sei un estrattore di dati da documenti amministrativi italiani (${tipologia.label}). ` +
    `Dal testo fornito estrai ESATTAMENTE questi campi e rispondi in JSON con un oggetto con queste chiavi ` +
    `(usa null per un campo se non presente nel testo, non inventare mai valori):\n${elencoCampi}`;

  let risultato;
  try {
    risultato = await openai.chatJSON(systemPrompt, testo.slice(0, 8000));
  } catch (e) {
    console.warn('[allegato-extractor] estrazione campi fallita:', e.message);
    return { campiEstratti: null, dataScadenza: null };
  }
  if (!risultato || typeof risultato !== 'object') return { campiEstratti: null, dataScadenza: null };

  const campoScadenza = tipologia.campiChiave.find(c => c.scadenza);
  const sScadenza = campoScadenza && risultato[campoScadenza.campo] &&
    /^\d{4}-\d{2}-\d{2}$/.test(risultato[campoScadenza.campo]) ? risultato[campoScadenza.campo] : null;

  return { campiEstratti: JSON.stringify(risultato), dataScadenza: sScadenza };
}

module.exports = { estraiCampiAllegato };
