using { com.reply.contrattiattivi as db } from '../db/schema';

type UtilizzoClausolaEntry {
  contrattoID : UUID;
  tipo        : String;
  intestatario : String;
  variante    : Boolean;
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
}

type AllegatoClassificato {
  filename             : String;
  tipo                 : String;
  confidenza           : Decimal(5,4);
  metodoRiconoscimento : String;
  testo                : LargeString;
  metadati             : array of MetadatoConfermato;
  dataScadenza         : Date;
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
  type AllegatoAttesoEsito {
    allegatoAtteso : String;
    etichetta      : String;
    presente       : Boolean;
    filename       : String;
  }

  action verificaCompletezza(previewID: UUID) returns {
    attesi      : array of AllegatoAttesoEsito;
    percentuale : Decimal(5,2);
  };
  action getTipologieAllegato() returns array of TipologiaAllegato;
  action confirmCoverage(previewID: UUID, clausole: array of ClausolaCoverageResult, allegati: array of AllegatoConferma, metadati: array of MetadatoConfermato) returns Contratto;
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
