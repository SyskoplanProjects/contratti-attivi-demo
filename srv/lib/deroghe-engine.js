const openai = require('../modules/openai-module');

// Articoli vessatori delle CGC standard di Gruppo (approvati ex artt. 1341-1342 c.c.,
// vedi docs/requirements/02-standard-cgc-deroghe.md) da presidiare nel confronto deroghe
// (RF6 / obiettivo "Analisi Deroghe contrattuali"). Segnali derivati dal testo integrale
// delle CGC (fonte: CGC PASSIVE ICT DORA_Accettazione_30.04.2025.docx, vedi
// docs/requirements/04-esempi-reali-plesso-oda-registro.md). Per estendere il controllo
// ad altri articoli basta aggiungere una entry.
const ARTICOLI_CRITICI = [
  {
    articolo: '3',
    titolo: 'Osservanza di leggi, regolamenti e norme',
    segnaliDeroga: 'assenza di richiamo alla Circolare BI 285/2013 e alla normativa DORA, mancata previsione di adeguamento automatico a disposizioni sopravvenute, esclusione ingiustificata delle previsioni su Servizi TIC/FEI (diritto di audit, piani di emergenza, penetration test) per servizi che invece li richiedono'
  },
  {
    articolo: '4',
    titolo: 'Domicilio delle Parti, comunicazioni e modifiche',
    segnaliDeroga: 'assenza di obbligo di forma scritta per comunicazioni e modifiche contrattuali, lingua del contratto diversa dall\'italiano senza giustificazione, comunicazioni non tracciabili (nessun obbligo di PEC o raccomandata a.r.)'
  },
  {
    articolo: '7',
    titolo: 'Termini contrattuali, sospensione del Contratto e proroghe',
    segnaliDeroga: 'assenza di meccanismo di proroga per cause non imputabili all\'Appaltatore, assenza di esclusione delle penali durante la sospensione, termini rigidi senza possibilità di proroga motivata o di sospensione per forza maggiore'
  },
  {
    articolo: '9',
    titolo: 'Durata, corrispettivi e pagamenti',
    segnaliDeroga: 'rinnovo tacito o automatico del Contratto non espressamente concordato per iscritto (le CGC lo escludono di default), pagamento non subordinato a DURC/DURF regolari, assenza di tracciabilità dei pagamenti (bonifico o strumento equivalente), interessi moratori diversi dal tasso legale ex art. 1284 c.c.'
  },
  {
    articolo: '10',
    titolo: 'Sospensione dei pagamenti',
    segnaliDeroga: 'assenza della facoltà della Committente di sospendere i pagamenti in pendenza di contestazioni con l\'Appaltatore'
  },
  {
    articolo: '11',
    titolo: 'Variazioni',
    segnaliDeroga: 'attività svolte in difformità dal Contratto senza autorizzazione scritta della Committente che danno comunque diritto a compensi, indennizzi o rimborsi'
  },
  {
    articolo: '12',
    titolo: 'Livelli di Servizio, Indicatori Chiave di Prestazione e penali',
    segnaliDeroga: 'assenza di penali per mancato rispetto degli SLA, assenza del diritto della Committente al monitoraggio costante delle performance, assenza del diritto a livelli di garanzia alternativi quando coinvolti diritti di altri clienti, soglia di risoluzione per penali eccessive diversa dal 20% del compenso annuale'
  },
  {
    articolo: '13',
    titolo: 'Dichiarazioni e obblighi dell\'Appaltatore',
    segnaliDeroga: 'mancata previsione di uno o più obblighi standard (notifica tempestiva di incidenti, misure di sicurezza TIC, test di penetrazione periodici, produzione di backup, formazione del personale su sicurezza, piani operativi di emergenza, cooperazione ai TLPT) specialmente per Servizi TIC o a supporto di funzioni essenziali/importanti, dove sono inderogabili'
  },
  {
    articolo: '15',
    titolo: 'Conflitto di interesse',
    segnaliDeroga: 'assenza dell\'obbligo di comunicazione preventiva di conflitti di interesse, assenza del diritto di recesso della Committente in caso di conflitto accertato e non risolto'
  },
  {
    articolo: '16',
    titolo: 'Proprietà industriale e commerciale, proprietà intellettuale',
    segnaliDeroga: 'assenza della manleva della Committente per violazioni di proprietà intellettuale, mancata garanzia dell\'Appaltatore sulla titolarità dei diritti su hardware/software/brevetti utilizzati per erogare i Servizi'
  },
  {
    articolo: '17',
    titolo: 'Attività ispettive e verifiche',
    segnaliDeroga: 'limitazioni a frequenza o perimetro degli audit, esclusione del diritto di accesso a locali o sistemi, mancata previsione di reportistica periodica, restrizioni sul diritto di copia della documentazione'
  },
  {
    articolo: '18',
    titolo: 'Esecuzione, responsabilità e polizza assicurativa',
    segnaliDeroga: 'assenza dell\'obbligo di stipulare una polizza di responsabilità civile (RCO/RCT) con massimali adeguati, mancata responsabilità piena dell\'Appaltatore per danni propri e dei subappaltatori'
  },
  {
    articolo: '19',
    titolo: 'Sicurezza dei Sistemi Informatici, dei dati, delle Informazioni e continuità operativa',
    segnaliDeroga: 'assenza di un Piano di Continuità Operativa formalizzato, assenza di tempi di ripristino concordati in caso di emergenza, assenza di modalità di comunicazione di incidenti e malfunzionamenti alla Committente'
  },
  {
    articolo: '20',
    titolo: 'Riservatezza e protezione dei dati personali',
    segnaliDeroga: 'obbligo di riservatezza post-contrattuale inferiore a 2 anni dalla cessazione, assenza di nomina a Responsabile del trattamento ex art. 28 GDPR quando necessaria, assenza di autorizzazione scritta preventiva per trasferimento dati a terzi o extra-UE'
  },
  {
    articolo: '21',
    titolo: 'Cessione del Contratto, del credito e subappalto',
    segnaliDeroga: 'cessione o subappalto consentiti senza autorizzazione scritta della Committente, assenza di clausola change of control, mancata responsabilità dell\'Appaltatore per l\'operato dei subappaltatori, assenza di obbligo di comunicazione preventiva'
  },
  {
    articolo: '25',
    titolo: 'Clausola risolutiva espressa - Esecuzione in danno',
    segnaliDeroga: 'riduzione delle cause di risoluzione ex art. 1456 c.c. previste dallo standard (violazioni normativa esternalizzazioni, D.Lgs. 231/2001, sicurezza TIC, DURC irregolare), assenza del Periodo di Transizione di almeno 12 mesi post-cessazione, assenza dell\'obbligo di assistenza al trasferimento verso un nuovo fornitore'
  },
  {
    articolo: '26',
    titolo: 'Recesso dal Contratto o dai singoli Servizi',
    segnaliDeroga: 'preavviso di recesso della Committente inferiore a 60 giorni, preavviso di recesso dell\'Appaltatore diverso da 6 mesi, assenza dell\'obbligo di restituzione o cancellazione dei dati entro 6 mesi dalla cessazione del rapporto'
  },
  {
    articolo: '28',
    titolo: 'Legge applicabile e Foro competente',
    segnaliDeroga: 'legge applicabile diversa da quella italiana, foro competente diverso da Roma o foro esclusivo a favore dell\'Appaltatore'
  },
  {
    articolo: '29',
    titolo: 'D.Lgs. 231/2001',
    segnaliDeroga: 'assenza dell\'impegno al rispetto del Codice Etico e del Modello di Organizzazione, Gestione e Controllo di Gruppo, assenza di estensione degli obblighi ex D.Lgs. 231/2001 agli eventuali subappaltatori'
  }
];

const SYSTEM_PROMPT = `Sei un assistente che verifica se un contratto presenta deroghe rispetto agli articoli critici delle Condizioni Generali di Contratto (CGC) standard del Gruppo. Per ogni articolo indica l'esito: "conforme" se il contratto rispetta lo standard, "derogato" se presenta una deroga rispetto ai segnali elencati, "non_determinabile" se dal testo non si può stabilire. Rispondi SOLO con un oggetto JSON nella forma: { "risultati": [ { "articolo": "...", "esito": "conforme|derogato|non_determinabile", "dettaglio": "...", "riferimentoComma": "...", "segnali": "..." } ] }.`;

const ESITI_VALIDI = ['conforme', 'derogato', 'non_determinabile'];

function _esitiNonDeterminabili() {
  return ARTICOLI_CRITICI.map(a => ({
    articolo: a.articolo, esito: 'non_determinabile', dettaglio: '', riferimentoComma: '', segnali: ''
  }));
}

// Normalizza la risposta LLM: solo articoli critici, esito nell'enum, un esito per articolo.
function _normalizzaRisultati(risultati) {
  const perArticolo = new Map();
  for (const r of (risultati || [])) {
    const articolo = r && r.articolo;
    if (!ARTICOLI_CRITICI.some(a => a.articolo === articolo)) continue;
    if (perArticolo.has(articolo)) continue; // duplicato: tiene il primo
    perArticolo.set(articolo, {
      articolo,
      esito: ESITI_VALIDI.includes(r.esito) ? r.esito : 'non_determinabile',
      dettaglio: r.dettaglio || '',
      riferimentoComma: r.riferimentoComma || '',
      segnali: r.segnali || ''
    });
  }
  return ARTICOLI_CRITICI.map(a =>
    perArticolo.get(a.articolo) || {
      articolo: a.articolo, esito: 'non_determinabile', dettaglio: '', riferimentoComma: '', segnali: ''
    });
}

async function verificaDeroghe(testoDocumento) {
  if (!testoDocumento || !testoDocumento.trim()) return _esitiNonDeterminabili();

  const elencoArticoli = ARTICOLI_CRITICI.map(a =>
    `- Art. ${a.articolo} (${a.titolo}). Segnali di deroga: ${a.segnaliDeroga}`).join('\n');
  const userMessage = `ARTICOLI CRITICI CGC:\n${elencoArticoli}\n\nDOCUMENTO:\n${testoDocumento.slice(0, 20000)}`;

  try {
    const risposta = await openai.chatJSON(SYSTEM_PROMPT, userMessage);
    const risultati = (risposta && risposta.risultati) || [];
    return risultati.length ? _normalizzaRisultati(risultati) : _esitiNonDeterminabili();
  } catch (e) {
    console.warn('[deroghe-engine] verifica deroghe fallita:', e.message);
    return _esitiNonDeterminabili();
  }
}

// Esito complessivo richiesto dal use case: "se le condizioni sono rimaste immutate rispetto
// allo standard di Gruppo segnala OK, altrimenti anomalia" — un'unica sintesi booleana sopra
// il dettaglio articolo-per-articolo già restituito da verificaDeroghe.
function esitoComplessivoDeroghe(risultati) {
  const lista = risultati || [];
  if (lista.some(r => r.esito === 'derogato')) return 'ANOMALIA';
  if (lista.length && lista.every(r => r.esito === 'conforme')) return 'OK';
  return 'NON_DETERMINATO';
}

module.exports = { verificaDeroghe, ARTICOLI_CRITICI, esitoComplessivoDeroghe };
