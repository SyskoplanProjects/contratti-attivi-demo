// Categorie riconosciute per gli allegati caricati nel comparator.
// Per aggiungerne una nuova basta aggiungere una entry: la classificazione
// (embedding + fallback LLM) la userà automaticamente, senza altre modifiche.
// campiChiave: elenco dei campi strutturati da estrarre dal testo grezzo del documento
// (via LLM, vedi allegato-extractor.js). "campo" è la chiave nel JSON risultato,
// "scadenza: true" marca il campo che va anche duplicato nella colonna dataScadenza
// (usata per controlli/alert di validità), quando presente.
const TIPOLOGIE_ALLEGATO = [
  {
    key: 'APPENDICE_CONTRATTO',
    label: 'Appendice contratto',
    testoRiferimento: 'Appendice al contratto principale. Il presente allegato integra e specifica le condizioni tecniche ed economiche già previste nel contratto di riferimento, di cui costituisce parte integrante e sostanziale.'
  },
  {
    key: 'DURC',
    label: 'DURC (Documento Unico di Regolarità Contributiva)',
    testoRiferimento: 'Documento Unico di Regolarità Contributiva (DURC). Si attesta la regolarità dell\'impresa nei versamenti dei contributi previdenziali, assistenziali e assicurativi verso INPS, INAIL e Cassa Edile.',
    campiChiave: [
      { campo: 'numeroProtocollo', descrizione: 'Numero Protocollo INAIL/INPS del documento' },
      { campo: 'denominazione', descrizione: 'Denominazione/ragione sociale del soggetto' },
      { campo: 'codiceFiscale', descrizione: 'Codice fiscale del soggetto' },
      { campo: 'sedeLegale', descrizione: 'Sede legale (indirizzo completo)' },
      { campo: 'dataRichiesta', descrizione: 'Data richiesta, formato ISO YYYY-MM-DD' },
      { campo: 'scadenzaValidita', descrizione: 'Scadenza validità del documento, formato ISO YYYY-MM-DD', scadenza: true },
      { campo: 'esito', descrizione: 'Esito verifica: REGOLARE o NON_REGOLARE' }
    ]
  },
  {
    key: 'DURF',
    label: 'DURF (Documento Unico Regolarità Fiscale)',
    testoRiferimento: 'Documento Unico di Regolarità Fiscale (DURF) rilasciato dall\'Agenzia delle Entrate, attestante l\'assenza di violazioni fiscali e la regolarità dei versamenti relativi alle ritenute fiscali sui redditi da lavoro.',
    campiChiave: [
      { campo: 'denominazione', descrizione: 'Cognome e nome o denominazione del soggetto' },
      { campo: 'codiceFiscale', descrizione: 'Codice fiscale del soggetto' },
      { campo: 'partitaIva', descrizione: 'Numero partita IVA' },
      { campo: 'domicilioFiscale', descrizione: 'Domicilio fiscale (indirizzo completo con CAP, comune, provincia)' },
      { campo: 'dataRilascio', descrizione: 'Luogo e data di rilascio del certificato (solo la data), formato ISO YYYY-MM-DD' },
      { campo: 'meseRiferimento', descrizione: 'Mese/anno a cui si riferisce la sussistenza dei requisiti, es. "novembre 2025"' },
      { campo: 'scadenzaValidita', descrizione: 'Data di scadenza validità: il certificato vale 4 mesi dalla data di rilascio indicata in calce, calcola dataRilascio + 4 mesi, formato ISO YYYY-MM-DD', scadenza: true }
    ]
  },
  {
    key: 'CAMERA_COMMERCIO',
    label: 'Visura Camera di Commercio',
    testoRiferimento: 'Visura camerale rilasciata dalla Camera di Commercio, Industria, Artigianato e Agricoltura, contenente i dati identificativi dell\'impresa: sede legale, forma giuridica, capitale sociale, amministratori e oggetto sociale.',
    campiChiave: [
      { campo: 'denominazione', descrizione: 'Denominazione dell\'impresa' },
      { campo: 'codiceFiscale', descrizione: 'Codice fiscale e numero iscrizione Registro Imprese' },
      { campo: 'partitaIva', descrizione: 'Numero partita IVA' },
      { campo: 'formaGiuridica', descrizione: 'Forma giuridica (es. societa\' per azioni)' },
      { campo: 'sedeLegale', descrizione: 'Indirizzo sede legale completo con CAP' },
      { campo: 'pec', descrizione: 'Indirizzo PEC' },
      { campo: 'numeroRea', descrizione: 'Numero REA' },
      { campo: 'dataIscrizione', descrizione: 'Data di iscrizione al Registro Imprese, formato ISO YYYY-MM-DD' },
      { campo: 'dataCostituzione', descrizione: 'Data atto di costituzione, formato ISO YYYY-MM-DD' },
      { campo: 'oggettoSociale', descrizione: 'Oggetto sociale (attività dichiarate)' },
      { campo: 'capitaleSociale', descrizione: 'Capitale sociale versato in Euro (solo numero)' },
      { campo: 'amministratori', descrizione: 'Elenco nomi degli amministratori/legali rappresentanti, separati da virgola' },
      { campo: 'dataEstrazione', descrizione: 'Data di estrazione del documento dal Registro Imprese, formato ISO YYYY-MM-DD' }
    ]
  }
];

const SOGLIA_TIPO_ALLEGATO = 0.75;

module.exports = { TIPOLOGIE_ALLEGATO, SOGLIA_TIPO_ALLEGATO };
