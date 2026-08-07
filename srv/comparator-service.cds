using { com.reply.contrattiattivi as db } from '../db/schema';

type UtilizzoClausolaEntry {
  contrattoID : UUID;
  tipo        : String;
  intestatario : String;
  variante    : Boolean;
}

type RiferimentoTrovato {
  templateID      : UUID;
  nome            : String;
  tipo            : String;
  similarity      : Decimal(5,4);
  coveragePercent : Decimal(5,2);
}

type PosizioneCampo {
  pagina : Integer;
  x      : Decimal(10,4);
  y      : Decimal(10,4);
  width  : Decimal(10,4);
  height : Decimal(10,4);
}

type ClausolaCoverageResult {
  numero            : Integer;
  titolo            : String;
  testo             : LargeString;
  stato             : String;
  similarity        : Decimal(5,4);
  matchClausolaID   : UUID;
  utilizzoStorico   : array of UtilizzoClausolaEntry;
  riferimento       : String;
  templateTitolo    : String;
  versione          : Integer;
  posizione         : PosizioneCampo;
}

type AllegatoDaClassificare {
  filename : String;
  file     : LargeString;
}

type MetadatoConfermato {
  campo                  : String(100);
  etichetta              : String(200);
  sezione                : String(100);
  valore                 : String;
  valoreOriginaleAI      : String;
  confidenza             : Decimal(5,4);
  modificatoManualmente  : Boolean;
  posizione              : PosizioneCampo;
}

type AllegatoClassificato {
  filename             : String;
  tipo                 : String;
  confidenza           : Decimal(5,4);
  metodoRiconoscimento : String;
  testo                : LargeString;
  metadati             : array of MetadatoConfermato;
  dataScadenza         : Date;
  pdfBase64            : LargeString;
}

type AllegatoConferma {
  filename : String;
  tipo     : String;
  metadati : array of MetadatoConfermato;
}

type TipologiaAllegato {
  codice : String;
  label  : String;
}

@path: '/comparator'
service ComparatorService @(requires: 'Utente') {
  action calcolaCoverage(templateID: UUID, file: LargeString, filename: String) returns {
    previewID: UUID;
    coveragePercent: Decimal(5,2);
    clausole: array of ClausolaCoverageResult;
    metadati: array of MetadatoConfermato;
    testo: LargeString;
    riferimentoTrovato: RiferimentoTrovato;
    pdfBase64: LargeString;
  };
  type ClassificazioneDocumento {
    categoria  : String;
    sottoTipo  : String;
    confidenza : Decimal(5,4);
  }

  action classificaAllegati(previewID: UUID, allegati: array of AllegatoDaClassificare) returns {
    documentoPrincipale : ClassificazioneDocumento;
    allegati            : array of AllegatoClassificato;
  };
  action classificaDocumentoPrincipale(previewID: String) returns ClassificazioneDocumento;

  type ClausolaBozza {
    numero : Integer;
    titolo : String;
    testo  : LargeString;
    stato  : String;
  }
  type BozzaAllegato {
    filename : String;
    tipo     : String;
    metadati : array of MetadatoConfermato;
  }
  type BozzaDati {
    contrattoID  : UUID;
    intestatario : String;
    clausole     : array of ClausolaBozza;
    allegati     : array of BozzaAllegato;
    metadati     : array of MetadatoConfermato;
  }

  action salvaBozza(previewID: String, step: String, filename: String, tipo: String, intestatario: String, clausole: array of ClausolaBozza, metadati: array of MetadatoConfermato, allegatoID: String) returns {
    contrattoID : UUID;
    stato       : String;
  };
  action recuperaBozza(previewID: String) returns BozzaDati;
  type AllegatoAttesoEsito {
    allegatoAtteso : String;
    etichetta      : String;
    presente       : Boolean;
    filename       : String;
  }

  // Nota: in OData v4 il parametro array-of-complex va SEMPRE passato (anche `[]`),
  // il deserializzatore non gestisce l'omissione; il handler lo tratta come "usa preview".
  action verificaCompletezza(previewID: UUID, allegati: array of AllegatoClassificato null) returns {
    attesi            : array of AllegatoAttesoEsito;
    percentuale       : Decimal(5,2);
    standardApplicato : String;
  };
  type EsitoDeroga {
    articolo          : String;
    esito             : String;
    dettaglio         : LargeString;
    riferimentoComma  : String;
    segnali           : String;
  }

  action verificaDeroghe(previewID: UUID) returns {
    deroghe          : array of EsitoDeroga;
    esitoComplessivo : String;
  };

  // Step 1-2 del flusso: gate di classificazione a monte. Se il documento caricato non è
  // riconosciuto come contratto (categoria macro diversa da CONTRATTO), il flusso si interrompe
  // e viene registrata un'anomalia bloccante invece di procedere alla verifica di completezza.
  type EsitoGateDocumento {
    documentoID : UUID;
    esitoGate   : String;
    categoria   : String;
    sottoTipo   : String;
    gravita     : String;
    dettaglio   : String;
  }

  action verificaDocumento(previewID: UUID) returns EsitoGateDocumento;

  type EsitoAllineamentoSAPCampo {
    campo           : String;
    valoreContratto : String;
    valoreSAP       : String;
    esito           : String;
  }

  // Step "riconciliazione SAP": confronta i metadati estratti dal contratto (già in preview)
  // con i valori SAP inseriti manualmente (nessuna integrazione SAP disponibile in questa fase,
  // vedi 03-requisiti-evoluzione-gap-analysis.md RF7 — input manuale è il confine onesto finché
  // non è definito un connettore).
  action verificaAllineamentoSAP(previewID: UUID, dataDecorrenzaSAP: Date, dataScadenzaSAP: Date, importoSAP: Decimal(15,2)) returns array of EsitoAllineamentoSAPCampo;

  type KPIAndamento {
    data              : Date;
    completezzaMedia  : Decimal(5,2);
    totaleContratti   : Integer;
  }

  type DashboardKPIs {
    totaleContratti   : Integer;
    completezzaMedia  : Decimal(5,2);
    contrattiCompleti : Integer;
    derogheTotali     : Integer;
    anomalieAperte    : Integer;
    andamento         : array of KPIAndamento;
  }

  type AnomaliaRow {
    anomaliaID    : UUID;
    contrattoID   : UUID;
    intestatario  : String;
    tipo          : String;
    gravita       : String;
    riferimento   : String;
    stato         : String;
    assegnatario  : String;
    dataApertura  : DateTime;
  }

  action getDashboardKPIs() returns DashboardKPIs;
  action getAnomalie(stato: String, tipo: String, gravita: String) returns array of AnomaliaRow;
  action assegnaAnomalia(anomaliaID: UUID, assegnatario: String) returns Anomalia;
  action avviaLavorazione(anomaliaID: UUID) returns Anomalia;
  action risolviAnomalia(anomaliaID: UUID, nota: String, file: LargeString, filename: String) returns Anomalia;
  action chiudiAnomalia(anomaliaID: UUID, nota: String) returns Anomalia;

  // Report richiesti dal use case (Risultati Attesi): ciascuna riga riporta anche il referente
  // responsabile della remediation (assegnatario dell'anomalia collegata, se già assegnata).
  type OrdinePrivoDiContratto {
    documentoID  : UUID;
    filename     : String;
    dataRilievo  : DateTime;
    referente    : String;
  }
  type ContrattoIncompleto {
    contrattoID       : UUID;
    intestatario      : String;
    completezzaPercent : Decimal(5,2);
    standardApplicato : String;
    allegatiMancanti  : String;
    referente         : String;
  }
  type DerogaContrattuale {
    contrattoID      : UUID;
    intestatario     : String;
    articolo         : String;
    dettaglio        : String;
    riferimentoComma : String;
    referente        : String;
  }

  action getOrdiniPriviDiContratto() returns array of OrdinePrivoDiContratto;
  action getContrattiIncompleti() returns array of ContrattoIncompleto;
  action getDerogheContrattuali() returns array of DerogaContrattuale;

  @readonly entity EsitoVerificaContratto as projection on db.EsitoVerificaContratto;
  @readonly entity Anomalia as projection on db.Anomalia;
  @readonly entity DocumentoClassificato as projection on db.DocumentoClassificato;

  action getTipologieAllegato() returns array of TipologiaAllegato;
  action getTemplates() returns array of Template;
  action confirmCoverage(previewID: UUID, clausole: array of ClausolaCoverageResult, allegati: array of AllegatoConferma, metadati: array of MetadatoConfermato, tipoDocumento: String null, dataDecorrenzaSAP: Date null, dataScadenzaSAP: Date null, importoSAP: Decimal(15,2) null) returns Contratto;
  action cercaUtilizzoClausola(clausolaID: UUID) returns array of UtilizzoClausolaEntry;

  type ComplianceResult {
    requisito  : String;
    esito      : String;
    dettaglio  : LargeString;
    riferimento : String;
  }

  action verificaCompliance(file: LargeString, filename: String, prompt: LargeString, templateID: UUID) returns array of ComplianceResult;

  action calcolaCoverageDaContratto(contractID: UUID, templateID: UUID) returns {
    previewID: UUID;
    coveragePercent: Decimal(5,2);
    clausole: array of ClausolaCoverageResult;
  };
  action verificaComplianceDaContratto(contractID: UUID, prompt: LargeString) returns array of ComplianceResult;

  type ClausolaUsataInput {
    clausolaID : UUID;
    versione   : Integer;
  }

  type TipAI {
    tipo      : String;
    codice    : String;
    titolo    : String;
    messaggio : String;
  }

  action generaTipsAI(templateID: UUID, contractID: UUID, clausole: array of ClausolaUsataInput) returns array of TipAI;

  @readonly entity Template as projection on db.Template;
  @readonly entity Contratto as projection on db.Contratto;
  @readonly entity ContrattoImportato as projection on db.ContrattoImportato;
  @readonly entity ContrattoAllegato as projection on db.ContrattoAllegato;
  @readonly entity ClausolaImportata as projection on db.ClausolaImportata;
  @readonly entity AlertModificaTemplate as projection on db.AlertModificaTemplate;
}
