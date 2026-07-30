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
      { campo: 'numeroProtocollo', etichetta: 'Numero Protocollo', sezione: 'Dati documento', descrizione: 'Numero Protocollo INAIL/INPS del documento' },
      { campo: 'denominazione', etichetta: 'Denominazione', sezione: 'Dati documento', descrizione: 'Denominazione/ragione sociale del soggetto' },
      { campo: 'codiceFiscale', etichetta: 'Codice Fiscale', sezione: 'Dati documento', descrizione: 'Codice fiscale del soggetto' },
      { campo: 'sedeLegale', etichetta: 'Sede Legale', sezione: 'Dati documento', descrizione: 'Sede legale (indirizzo completo)' },
      { campo: 'dataRichiesta', etichetta: 'Data Richiesta', sezione: 'Dati documento', descrizione: 'Data richiesta, formato ISO YYYY-MM-DD' },
      { campo: 'scadenzaValidita', etichetta: 'Scadenza Validità', sezione: 'Dati documento', descrizione: 'Scadenza validità del documento, formato ISO YYYY-MM-DD', scadenza: true },
      { campo: 'esito', etichetta: 'Esito', sezione: 'Dati documento', descrizione: 'Esito verifica: REGOLARE o NON_REGOLARE' }
    ]
  },
  {
    key: 'DURF',
    label: 'DURF (Documento Unico Regolarità Fiscale)',
    testoRiferimento: 'Documento Unico di Regolarità Fiscale (DURF) rilasciato dall\'Agenzia delle Entrate, attestante l\'assenza di violazioni fiscali e la regolarità dei versamenti relativi alle ritenute fiscali sui redditi da lavoro.',
    campiChiave: [
      { campo: 'denominazione', etichetta: 'Denominazione', sezione: 'Dati documento', descrizione: 'Cognome e nome o denominazione del soggetto' },
      { campo: 'codiceFiscale', etichetta: 'Codice Fiscale', sezione: 'Dati documento', descrizione: 'Codice fiscale del soggetto' },
      { campo: 'partitaIva', etichetta: 'Partita IVA', sezione: 'Dati documento', descrizione: 'Numero partita IVA' },
      { campo: 'domicilioFiscale', etichetta: 'Domicilio Fiscale', sezione: 'Dati documento', descrizione: 'Domicilio fiscale (indirizzo completo con CAP, comune, provincia)' },
      { campo: 'dataRilascio', etichetta: 'Data Rilascio', sezione: 'Dati documento', descrizione: 'Luogo e data di rilascio del certificato (solo la data), formato ISO YYYY-MM-DD' },
      { campo: 'meseRiferimento', etichetta: 'Mese Riferimento', sezione: 'Dati documento', descrizione: 'Mese/anno a cui si riferisce la sussistenza dei requisiti, es. "novembre 2025"' },
      { campo: 'scadenzaValidita', etichetta: 'Scadenza Validità', sezione: 'Dati documento', descrizione: 'Data di scadenza validità: il certificato vale 4 mesi dalla data di rilascio indicata in calce, calcola dataRilascio + 4 mesi, formato ISO YYYY-MM-DD', scadenza: true }
    ]
  },
  {
    key: 'CAMERA_COMMERCIO',
    label: 'Visura Camera di Commercio',
    testoRiferimento: 'Visura camerale rilasciata dalla Camera di Commercio, Industria, Artigianato e Agricoltura, contenente i dati identificativi dell\'impresa: sede legale, forma giuridica, capitale sociale, amministratori e oggetto sociale.',
    campiChiave: [
      { campo: 'denominazione', etichetta: 'Denominazione', sezione: 'Dati documento', descrizione: 'Denominazione dell\'impresa' },
      { campo: 'codiceFiscale', etichetta: 'Codice Fiscale', sezione: 'Dati documento', descrizione: 'Codice fiscale e numero iscrizione Registro Imprese' },
      { campo: 'partitaIva', etichetta: 'Partita IVA', sezione: 'Dati documento', descrizione: 'Numero partita IVA' },
      { campo: 'formaGiuridica', etichetta: 'Forma Giuridica', sezione: 'Dati documento', descrizione: 'Forma giuridica (es. societa\' per azioni)' },
      { campo: 'sedeLegale', etichetta: 'Sede Legale', sezione: 'Dati documento', descrizione: 'Indirizzo sede legale completo con CAP' },
      { campo: 'pec', etichetta: 'PEC', sezione: 'Dati documento', descrizione: 'Indirizzo PEC' },
      { campo: 'numeroRea', etichetta: 'Numero REA', sezione: 'Dati documento', descrizione: 'Numero REA' },
      { campo: 'dataIscrizione', etichetta: 'Data Iscrizione', sezione: 'Dati documento', descrizione: 'Data di iscrizione al Registro Imprese, formato ISO YYYY-MM-DD' },
      { campo: 'dataCostituzione', etichetta: 'Data Costituzione', sezione: 'Dati documento', descrizione: 'Data atto di costituzione, formato ISO YYYY-MM-DD' },
      { campo: 'oggettoSociale', etichetta: 'Oggetto Sociale', sezione: 'Dati documento', descrizione: 'Oggetto sociale (attività dichiarate)' },
      { campo: 'capitaleSociale', etichetta: 'Capitale Sociale', sezione: 'Dati documento', descrizione: 'Capitale sociale versato in Euro (solo numero)' },
      { campo: 'amministratori', etichetta: 'Amministratori', sezione: 'Dati documento', descrizione: 'Elenco nomi degli amministratori/legali rappresentanti, separati da virgola' },
      { campo: 'dataEstrazione', etichetta: 'Data Estrazione', sezione: 'Dati documento', descrizione: 'Data di estrazione del documento dal Registro Imprese, formato ISO YYYY-MM-DD' }
    ]
  },
  {
    key: 'CONTRATTO',
    label: 'Contratto',
    testoRiferimento: null,
    campiChiave: [
      { campo: 'titoloContratto', etichetta: 'Titolo Contratto', sezione: 'Dati principali', descrizione: 'Denominazione ufficiale del contratto o accordo' },
      { campo: 'fornitore', etichetta: 'Fornitore', sezione: 'Dati principali', descrizione: 'Ragione sociale della controparte contrattuale (fornitore/appaltatore)' },
      { campo: 'societaContraente', etichetta: 'Società Contraente', sezione: 'Dati principali', descrizione: 'Società del Gruppo che sottoscrive il contratto' },
      { campo: 'partitaIvaFornitore', etichetta: 'Partita IVA / Codice Fiscale Fornitore', sezione: 'Dati principali', descrizione: 'Partita IVA o codice fiscale della controparte' },
      { campo: 'tipologiaContratto', etichetta: 'Tipologia Contratto', sezione: 'Dati principali', descrizione: 'Es. licenza software, SaaS, servizi professionali, outsourcing, manutenzione, consulenza' },
      { campo: 'accordoQuadroOAutonomo', etichetta: 'Accordo Quadro o Contratto Autonomo', sezione: 'Dati principali', descrizione: 'Indicare se accordo quadro (sole condizioni generali, condizioni generali+particolari, o condizioni generali+listino) oppure contratto autonomo' },
      { campo: 'oggettoContratto', etichetta: 'Oggetto del Contratto', sezione: 'Dati principali', descrizione: 'Breve descrizione del bene/servizio acquistato' },
      { campo: 'leggeGovernante', etichetta: 'Legge che Governa il Contratto', sezione: 'Dati principali', descrizione: 'Paese la cui legislazione governa l\'accordo, codice ISO-2 (es. IT)' },
      { campo: 'contractManager', etichetta: 'Contract Manager', sezione: 'Dati principali', descrizione: 'Referente responsabile della gestione contrattuale, lato controparte, se identificabile' },
      { campo: 'emailControparte', etichetta: 'Email Controparte', sezione: 'Dati principali', descrizione: 'Email del referente della controparte' },

      { campo: 'dataFirma', etichetta: 'Data Firma', sezione: 'Date e durata', descrizione: 'Data di sottoscrizione, formato ISO YYYY-MM-DD' },
      { campo: 'dataDecorrenza', etichetta: 'Data Decorrenza', sezione: 'Date e durata', descrizione: 'Data di avvio del rapporto contrattuale, formato ISO YYYY-MM-DD' },
      { campo: 'dataScadenza', etichetta: 'Data Scadenza', sezione: 'Date e durata', descrizione: 'Data di termine del contratto, formato ISO YYYY-MM-DD', scadenza: true },
      { campo: 'durata', etichetta: 'Durata', sezione: 'Date e durata', descrizione: 'Durata in mesi o anni' },
      { campo: 'rinnovoAutomatico', etichetta: 'Rinnovo Automatico', sezione: 'Date e durata', descrizione: 'Presenza di rinnovo automatico/tacito (si/no)' },
      { campo: 'preavvisoRecesso', etichetta: 'Preavviso Recesso', sezione: 'Date e durata', descrizione: 'Termine previsto per recesso/disdetta' },

      { campo: 'importoContrattuale', etichetta: 'Importo Contrattuale', sezione: 'Economia', descrizione: 'Valore economico totale del contratto in Euro, solo numero (es. 120000.00)' },
      { campo: 'valuta', etichetta: 'Valuta', sezione: 'Economia', descrizione: 'EUR, USD, GBP, ecc.' },

      { campo: 'presenzaSLA', etichetta: 'Presenza SLA', sezione: 'Compliance e sicurezza', descrizione: 'Presenza di allegati SLA (si/no)' },
      { campo: 'presenzaDPA', etichetta: 'Presenza DPA', sezione: 'Compliance e sicurezza', descrizione: 'Presenza di accordi sul trattamento dati personali (si/no)' },
      { campo: 'presenzaClausoleDORA', etichetta: 'Presenza Clausole DORA', sezione: 'Compliance e sicurezza', descrizione: 'Presenza di clausole DORA o requisiti ICT Third Party (si/no)' },
      { campo: 'subfornitori', etichetta: 'Subfornitori', sezione: 'Compliance e sicurezza', descrizione: 'Se è accettato il ricorso a subfornitori; se presenti, elenco delle denominazioni separate da virgola' },
      { campo: 'presenzaClausoleOutsourcing', etichetta: 'Presenza Clausole Outsourcing', sezione: 'Compliance e sicurezza', descrizione: 'Presenza di clausole di esternalizzazione (si/no)' },
      { campo: 'templateContrattuale', etichetta: 'Template Contrattuale', sezione: 'Compliance e sicurezza', dynamic: 'riconosciTemplateContrattuale' },
      { campo: 'conservazioneDati', etichetta: 'Conservazione dei Dati', sezione: 'Compliance e sicurezza', descrizione: 'Periodo/modalità/condizioni di conservazione dati: retention, cancellazione, distruzione, restituzione' },
      { campo: 'ubicazioneDati', etichetta: 'Ubicazione dei Dati', sezione: 'Compliance e sicurezza', descrizione: 'Paese/regione/data center dove i dati sono archiviati/trattati; hosting, cloud region, trasferimenti internazionali' },
      { campo: 'changeOfControl', etichetta: 'Change of Control', sezione: 'Compliance e sicurezza', descrizione: 'Cosa accade in caso di cambio del soggetto controllante una delle parti (tipicamente il fornitore) — Art. 21 CGC' },
      { campo: 'attivitaIspettiveEVerifiche', etichetta: 'Attività Ispettive e Verifiche', sezione: 'Compliance e sicurezza', descrizione: 'Obblighi dell\'Appaltatore su monitoraggio, reportistica, audit e diritti di accesso — Art. 17 CGC' },

      { campo: 'articoloPenali', etichetta: 'Articolo: Penali', sezione: 'Clausole di rischio', descrizione: 'Articolo/allegato relativo a penali per sospensione/risoluzione anticipata/inadempimento' },
      { campo: 'articoloRisoluzione', etichetta: 'Articolo: Risoluzione Contrattuale', sezione: 'Clausole di rischio', descrizione: 'Articolo/allegato con eventi che portano a risoluzione del contratto' },
      { campo: 'articoloTempoAssistenza', etichetta: 'Articolo: Tempo Assistenza Dopo Interruzione', sezione: 'Clausole di rischio', descrizione: 'Articolo/allegato sul periodo di assistenza post-risoluzione' }
    ]
  }
];

const SOGLIA_TIPO_ALLEGATO = 0.75;

module.exports = { TIPOLOGIE_ALLEGATO, SOGLIA_TIPO_ALLEGATO };
