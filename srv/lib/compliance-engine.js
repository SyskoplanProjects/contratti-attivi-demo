const openai = require('../modules/openai-module');

const SYSTEM_PROMPT = `Sei un assistente che verifica la conformità di un documento contrattuale rispetto a una lista di requisiti/regole fornita dall'utente. Analizza il documento e per ogni requisito indica se è PRESENTE, ASSENTE o PARZIALE con relativo dettaglio e riferimento al testo del documento. Rispondi SOLO con un oggetto JSON nella forma: { "risultati": [ { "requisito": "...", "esito": "PRESENTE|ASSENTE|PARZIALE", "dettaglio": "...", "riferimento": "..." } ] }.`;

const SYSTEM_PROMPT_RISPOSTA = `Sei un assistente specializzato in contratti. Rispondi in modo chiaro e dettagliato alla domanda dell'utente basandoti esclusivamente sul documento contrattuale fornito. Se la domanda non puo' essere risposta sulla base del documento, dillo esplicitamente.`;

async function verificaCompliance(testoDocumento, prompt) {
  const userMessage = `PROMPT/REQUISITI:\n${prompt}\n\nDOCUMENTO:\n${testoDocumento}`;
  return openai.chatJSON(SYSTEM_PROMPT, userMessage);
}

async function rispondiAPromptPersonalizzato(testoDocumento, promptPersonalizzato) {
  const userMessage = `DOMANDA:\n${promptPersonalizzato}\n\nDOCUMENTO:\n${testoDocumento}`;
  return openai.chat(SYSTEM_PROMPT_RISPOSTA, userMessage);
}

module.exports = { verificaCompliance, rispondiAPromptPersonalizzato };
