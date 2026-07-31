const openai = require('../modules/openai-module');

// Articoli critici delle CGC standard di Gruppo da presidiare nel confronto deroghe (RF6).
// Contenuto dei segnali di deroga da `docs/requirements/02-standard-cgc-deroghe.md`.
// Per estendere il controllo ad altri articoli vessatori basta aggiungere una entry.
const ARTICOLI_CRITICI = [
  {
    articolo: '17',
    titolo: 'Attività ispettive e verifiche',
    segnaliDeroga: 'limitazioni a frequenza o perimetro degli audit, esclusione del diritto di accesso a locali o sistemi, mancata previsione di reportistica periodica, restrizioni sul diritto di copia della documentazione'
  },
  {
    articolo: '21',
    titolo: 'Cessione del Contratto, del credito e subappalto',
    segnaliDeroga: 'cessione o subappalto consentiti senza autorizzazione scritta della Committente, assenza di clausola change of control, mancata responsabilità dell\'Appaltatore per l\'operato dei subappaltatori, assenza di obbligo di comunicazione preventiva'
  }
];

const SYSTEM_PROMPT = `Sei un assistente che verifica se un contratto presenta deroghe rispetto agli articoli critici delle Condizioni Generali di Contratto (CGC) standard del Gruppo. Per ogni articolo indica l'esito: "conforme" se il contratto rispetta lo standard, "derogato" se presenta una deroga rispetto ai segnali elencati, "non_determinabile" se dal testo non si può stabilire. Rispondi SOLO con un oggetto JSON nella forma: { "risultati": [ { "articolo": "...", "esito": "conforme|derogato|non_determinabile", "dettaglio": "...", "riferimentoComma": "...", "segnali": "..." } ] }.`;

function _esitiNonDeterminabili() {
  return ARTICOLI_CRITICI.map(a => ({
    articolo: a.articolo, esito: 'non_determinabile', dettaglio: '', riferimentoComma: '', segnali: ''
  }));
}

async function verificaDeroghe(testoDocumento) {
  if (!testoDocumento || !testoDocumento.trim()) return _esitiNonDeterminabili();

  const elencoArticoli = ARTICOLI_CRITICI.map(a =>
    `- Art. ${a.articolo} (${a.titolo}). Segnali di deroga: ${a.segnaliDeroga}`).join('\n');
  const userMessage = `ARTICOLI CRITICI CGC:\n${elencoArticoli}\n\nDOCUMENTO:\n${testoDocumento.slice(0, 20000)}`;

  try {
    const risposta = await openai.chatJSON(SYSTEM_PROMPT, userMessage);
    const risultati = (risposta && risposta.risultati) || [];
    return risultati.length ? risultati : _esitiNonDeterminabili();
  } catch (e) {
    console.warn('[deroghe-engine] verifica deroghe fallita:', e.message);
    return _esitiNonDeterminabili();
  }
}

module.exports = { verificaDeroghe, ARTICOLI_CRITICI };
