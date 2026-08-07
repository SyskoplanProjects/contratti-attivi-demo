// Contenuto del template e dei contratti di esempio usati da srv/lib/seed-demo.js.
// Tenuto separato dallo script di seeding per poter aggiungere/modificare esempi
// senza toccare la logica di chiamata alle API.

const TEMPLATE = {
  nome: 'Fornitura Servizi ICT Bancari - DORA Compliance',
  tipoServizio: 'Servizi ICT',
  descrizione: 'Template standard per contratti di fornitura di servizi ICT a supporto di funzioni bancarie critiche, conforme al Regolamento (UE) 2022/2554 (DORA - Digital Operational Resilience Act).',
  clausole: [
    { titolo: 'Oggetto del Contratto', testo: 'Il presente Contratto disciplina la fornitura da parte del Fornitore all\'Istituto di servizi ICT a supporto di funzioni aziendali critiche o importanti, come definite dal Regolamento (UE) 2022/2554 ("DORA"). Il Fornitore si impegna a erogare i Servizi con la diligenza professionale richiesta a un fornitore terzo di servizi ICT operante nel settore finanziario.' },
    { titolo: 'Definizioni', testo: 'Ai fini del presente Contratto: "Servizi ICT" indica i servizi digitali e di dati forniti in modo continuativo, inclusi hardware come servizio e servizi di hardware che comprendono la fornitura di supporto tecnico tramite aggiornamenti software o firmware; "Funzione Critica o Importante" indica una funzione la cui interruzione comprometterebbe in modo sostanziale la performance finanziaria dell\'Istituto o la solidità e continuità dei suoi servizi; "Incidente ICT" indica un evento non pianificato che compromette la sicurezza dei sistemi di rete e informativi.' },
    { titolo: 'Livelli di Servizio (SLA)', testo: 'Il Fornitore garantisce i livelli di servizio (Service Level Agreement) descritti nell\'Allegato Tecnico, includendo indicatori quantitativi e qualitativi di performance, disponibilità (uptime), tempi di risposta e di risoluzione. Il mancato rispetto degli SLA concordati comporta l\'applicazione delle penali di cui all\'Allegato Economico, fatto salvo il diritto dell\'Istituto di risolvere il Contratto in caso di inadempimenti reiterati.' },
    { titolo: 'Gestione degli Incidenti ICT', testo: 'Il Fornitore notifica all\'Istituto, senza ritardo ingiustificato e comunque entro 4 (quattro) ore dalla rilevazione, ogni Incidente ICT che possa avere impatto sui servizi erogati, fornendo una descrizione dell\'incidente, la sua classificazione di gravità e le azioni di remediation intraprese, in conformità con gli obblighi di segnalazione degli incidenti gravi previsti dagli articoli 17-23 del Regolamento DORA.' },
    { titolo: 'Test di Resilienza Operativa Digitale', testo: 'Il Fornitore collabora attivamente con l\'Istituto ai fini dell\'esecuzione dei test di resilienza operativa digitale previsti dal Regolamento DORA, inclusi test basati sulla minaccia (Threat-Led Penetration Testing) qualora il Fornitore supporti funzioni critiche o importanti, mettendo a disposizione ambienti, dati e personale tecnico necessari senza oneri aggiuntivi per l\'Istituto oltre a quanto già previsto contrattualmente.' },
    { titolo: 'Catena di Fornitura ICT e Subappalto', testo: 'Il Fornitore non può subappaltare, in tutto o in parte, l\'erogazione dei Servizi a supporto di Funzioni Critiche o Importanti senza il preventivo consenso scritto dell\'Istituto. In caso di subappalto autorizzato, il Fornitore rimane pienamente responsabile verso l\'Istituto e garantisce che ogni subfornitore rispetti i medesimi obblighi di sicurezza, resilienza e notifica previsti dal presente Contratto e dal Regolamento DORA.' },
    { titolo: 'Diritti di Audit e Accesso', testo: 'L\'Istituto, le Autorità di Vigilanza competenti e i revisori da essi incaricati hanno diritto di accesso, ispezione e audit, anche senza preavviso in caso di urgenza, presso i locali, i sistemi e la documentazione del Fornitore rilevanti ai fini della verifica del rispetto degli obblighi contrattuali e regolamentari, ivi inclusi quelli derivanti dal Regolamento DORA.' },
    { titolo: 'Strategia di Uscita e Portabilità dei Dati', testo: 'Il Fornitore predispone e mantiene aggiornato un piano di uscita (Exit Plan) che garantisca, in caso di cessazione del Contratto per qualsiasi causa, la migrazione ordinata dei Servizi, dei dati e della documentazione verso l\'Istituto o un fornitore alternativo, senza interruzione delle Funzioni Critiche o Importanti supportate e in formato interoperabile e leggibile da sistemi terzi.' },
    { titolo: 'Sicurezza delle Informazioni e Protezione dei Dati', testo: 'Il Fornitore adotta misure tecniche e organizzative adeguate a garantire la riservatezza, integrità e disponibilità dei dati e delle informazioni dell\'Istituto, in conformità al Regolamento (UE) 2016/679 (GDPR) e ai requisiti di gestione del rischio ICT previsti dal Regolamento DORA, inclusa la cifratura dei dati in transito e a riposo e la gestione degli accessi secondo il principio del privilegio minimo.' },
    { titolo: 'Continuità Operativa e Disaster Recovery', testo: 'Il Fornitore mantiene un piano di continuità operativa (Business Continuity Plan) e un piano di disaster recovery testati con cadenza almeno annuale, con obiettivi di Recovery Time Objective (RTO) e Recovery Point Objective (RPO) indicati nell\'Allegato Tecnico, e ne fornisce evidenza documentale su richiesta dell\'Istituto.' },
    { titolo: 'Riservatezza', testo: 'Le Parti si impegnano a mantenere riservate tutte le informazioni di natura tecnica, commerciale e finanziaria scambiate in esecuzione del presente Contratto, e a non divulgarle a terzi senza il preventivo consenso scritto dell\'altra Parte, salvo quanto richiesto da obblighi di legge o dalle Autorità di Vigilanza.' },
    { titolo: 'Responsabilità e Indennizzo', testo: 'Il Fornitore risponde dei danni diretti causati all\'Istituto per inadempimento degli obblighi contrattuali, ivi inclusi quelli derivanti da Incidenti ICT imputabili al Fornitore, entro il massimale indicato nell\'Allegato Economico, fermo restando che tale limitazione non si applica in caso di dolo o colpa grave.' },
    { titolo: 'Durata, Recesso e Risoluzione', testo: 'Il presente Contratto ha durata di 36 (trentasei) mesi dalla Data di Stipula, tacitamente rinnovabile per pari periodo salvo disdetta di una delle Parti con preavviso di almeno 6 (sei) mesi. L\'Istituto ha facoltà di recedere in qualsiasi momento, con preavviso di 90 (novanta) giorni, qualora ciò sia richiesto da un\'Autorità di Vigilanza competente.' },
    { titolo: 'Legge Applicabile e Foro Competente', testo: 'Il presente Contratto è regolato dalla legge italiana. Per qualsiasi controversia relativa alla validità, interpretazione o esecuzione del presente Contratto sarà competente in via esclusiva il Foro di Milano.' }
  ]
};

// stato finale desiderato per ciascun contratto demo: 'BOZZA' | 'IN_REVISIONE' | 'APPROVATO'
const CONTRATTI = [
  {
    intestatario: 'Banca Alpha S.p.A.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 480000.00,
    codiceFiscale: 'IT01234560123',
    dataStipula: '2026-07-01',
    dataScadenza: '2029-06-30',
    categoria: 'fornitura',
    esitoVerifica: 'ok',
    statoFinale: 'BOZZA'
  },
  {
    intestatario: 'CloudTech Provider S.r.l.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 215000.00,
    codiceFiscale: 'IT09876540987',
    dataStipula: '2026-07-15',
    dataScadenza: '2028-07-14',
    categoria: 'servizio',
    esitoVerifica: 'in_corso',
    statoFinale: 'IN_REVISIONE'
  },
  {
    intestatario: 'Data Center Nord S.r.l.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 620000.00,
    codiceFiscale: 'IT05555550555',
    dataStipula: '2026-06-10',
    dataScadenza: '2028-06-09',
    categoria: 'fornitura',
    esitoVerifica: 'ok',
    statoFinale: 'APPROVATO'
  },
  {
    intestatario: 'FinTech Advisory S.p.A.',
    responsabile: 'anna.bianchi@contrattiattivi.it',
    importo: 140000.00,
    codiceFiscale: 'IT03344556677',
    dataStipula: '2026-07-20',
    dataScadenza: '2027-01-19',
    categoria: 'consulenza',
    esitoVerifica: 'non_conforme',
    statoFinale: 'IN_REVISIONE'
  },
  {
    intestatario: 'SecureCloud Italia S.r.l.',
    responsabile: 'luigi.verdi@contrattiattivi.it',
    importo: 760000.00,
    codiceFiscale: 'IT07665544332',
    dataStipula: '2026-05-15',
    dataScadenza: '2029-05-14',
    categoria: 'servizio',
    esitoVerifica: 'ok',
    statoFinale: 'FIRMATO'
  },
  {
    intestatario: 'CyberDefence Global S.p.A.',
    responsabile: 'anna.bianchi@contrattiattivi.it',
    importo: 310000.00,
    codiceFiscale: 'IT02121324354',
    dataStipula: '2026-06-25',
    dataScadenza: '2028-06-24',
    categoria: 'servizio',
    esitoVerifica: 'in_corso',
    statoFinale: 'APPROVATO'
  },
  {
    intestatario: 'Sarda Data Solutions S.r.l.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 98000.00,
    codiceFiscale: 'IT04214354657',
    dataStipula: '2026-07-05',
    dataScadenza: '2028-07-04',
    categoria: 'fornitura',
    esitoVerifica: 'ok',
    statoFinale: 'BOZZA'
  },
  {
    intestatario: 'Veneto Cloud Services S.p.A.',
    responsabile: 'anna.bianchi@contrattiattivi.it',
    importo: 435000.00,
    codiceFiscale: 'IT07987876543',
    dataStipula: '2026-04-18',
    dataScadenza: '2027-10-17',
    categoria: 'servizio',
    esitoVerifica: 'non_conforme',
    statoFinale: 'IN_REVISIONE'
  },
  {
    intestatario: 'Milano Fintech Hub S.r.l.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 85000.00,
    codiceFiscale: 'IT06785432109',
    dataStipula: '2026-07-12',
    dataScadenza: '2027-07-11',
    categoria: 'consulenza',
    esitoVerifica: 'ok',
    statoFinale: 'BOZZA'
  },
  {
    intestatario: 'Lombardia ICT Group S.p.A.',
    responsabile: 'luigi.neri@contrattiattivi.it',
    importo: 540000.00,
    codiceFiscale: 'IT07872345678',
    dataStipula: '2026-03-01',
    dataScadenza: '2029-02-28',
    categoria: 'fornitura',
    esitoVerifica: 'in_corso',
    statoFinale: 'FIRMATO'
  },
  {
    intestatario: 'Sicilia DORA Audit S.r.l.',
    responsabile: 'luigi.nero@contrattiattivi.it',
    importo: 120000.00,
    codiceFiscale: 'IT03214569870',
    dataStipula: '2026-06-30',
    dataScadenza: '2027-06-29',
    categoria: 'consulenza',
    esitoVerifica: 'ok',
    statoFinale: 'IN_REVISIONE'
  },
  {
    intestatario: 'Piemonte RE Testing S.p.A.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 265000.00,
    codiceFiscale: 'IT06231249876',
    dataStipula: '2026-05-22',
    dataScadenza: '2027-11-21',
    categoria: 'servizio',
    esitoVerifica: 'non_conforme',
    statoFinale: 'APPROVATO'
  },
  {
    intestatario: 'Tuscan Advisory Partners S.r.l.',
    responsabile: 'anna.bianchi@contrattiattivi.it',
    importo: 75000.00,
    codiceFiscale: 'IT04859593032',
    dataStipula: '2026-07-11',
    dataScadenza: '2027-07-10',
    categoria: 'consulenza',
    esitoVerifica: 'in_corso',
    statoFinale: 'BOZZA'
  },
  {
    intestatario: 'Liguria Network Services S.p.A.',
    responsabile: 'luigi.nero@contrattiattivi.it',
    importo: 395000.00,
    codiceFiscale: 'IT02647193857',
    dataStipula: '2026-04-05',
    dataScadenza: '2028-04-04',
    categoria: 'servizio',
    esitoVerifica: 'ok',
    statoFinale: 'FIRMATO'
  },
  {
    intestatario: 'Emilia Resilience Lab S.r.l.',
    responsabile: 'mario.rossi@contrattiattivi.it',
    importo: 180000.00,
    codiceFiscale: 'IT07485936471',
    dataStipula: '2026-07-22',
    dataScadenza: '2027-07-21',
    categoria: 'fornitura',
    esitoVerifica: 'in_corso',
    statoFinale: 'IN_REVISIONE'
  }
];

module.exports = { TEMPLATE, CONTRATTI };
