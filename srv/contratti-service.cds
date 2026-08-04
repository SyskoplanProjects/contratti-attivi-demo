using { com.reply.contrattiattivi as db } from '../db/schema';
using { MetadatoConfermato } from './comparator-service';

type StoricoClausolaEntry {
  versioneID        : UUID;
  numero             : Integer;
  dataCreazione       : DateTime;
  templateOrigine     : String;
  contrattiCorrenti   : array of String;
  testo               : LargeString;
}

type ConfrontoVersioniResult {
  testo1 : LargeString;
  testo2 : LargeString;
  delta  : LargeString;
}

type FuoriSyncEntry {
  contrattoClausolaID : UUID;
  clausolaCodice      : String;
  fuoriSync           : Boolean;
}

type ContrattoUsoClausola {
  contrattoID  : UUID;
  intestatario : String;
  stato        : String;
  versione     : Integer;
}

type ImportResult {
  clausoleCreate       : Integer;
  clausoleRiutilizzate : Integer;
  clausoleConDelta     : Integer;
  templateID           : UUID;
}

type ClausolaProposta {
  numero                  : Integer;
  titolo                  : String;
  testo                   : LargeString;
  stato                   : String;
  similarity               : Decimal(5,4);
  matchClausolaVersioneID  : UUID;
}

type PreviewImportResult {
  previewID : UUID;
  clausole  : array of ClausolaProposta;
}

type AllegatoClassificatoInfo {
  tipo                 : String;
  confidenza           : Decimal(5,4);
  metodoRiconoscimento : String;
  testo                : LargeString;
  metadati             : array of MetadatoConfermato;
  dataScadenza         : Date;
}

type ClausolaManuale {
  titolo : String;
  testo  : LargeString;
}

@path: '/contratti'
service ContrattiService @(requires: ['Utente','Revisore']) {

  @readonly entity Template as projection on db.Template;
  @readonly entity ContrattoVersione as projection on db.ContrattoVersione;
  @readonly entity ContrattoVersioneClausola as projection on db.ContrattoVersioneClausola;
  @readonly entity TemplateVersion as projection on db.TemplateVersion;
  @readonly entity Clausola as projection on db.Clausola {
    *,
    virtual null as numContratti : Integer,
    virtual null as origineDettaglio : String,
    virtual null as origineTipo : String,
    virtual null as origineNome : String,
    virtual null as origineID : String
  };
  @readonly entity ClausolaVersione as projection on db.ClausolaVersione { ID, clausola, numero, testo, dataCreazione, modificata, dettaglioDelta, templateVersionOrigine, contrattoOrigine };
  @readonly entity TemplateVersionClausola as projection on db.TemplateVersionClausola;

  // @restrict not used — CDS 7.9.5 bug: @restrict + bound action annotations
  // cause 403 for all roles on bound actions. CRUD gating done in JS before handlers.
  entity Contratto as projection on db.Contratto {
    *
  } actions {
    @(requires: 'Utente') action aggiungiClausola(clausolaVersioneID: UUID) returns Contratto;
    @(requires: 'Utente') action rimuoviClausola(contrattoClausolaID: UUID) returns Contratto;
    @(requires: 'Utente') action modificaClausolaTesto(contrattoClausolaID: UUID, nuovoTesto: LargeString) returns Contratto;
  };

  entity ContrattoClausola as projection on db.ContrattoClausola;
  @readonly entity ContrattoAllegato as projection on db.ContrattoAllegato;
  @readonly entity MetadatoDocumento as projection on db.MetadatoDocumento;

  function getCategorieContratto() returns array of String;

  @(requires: 'Utente') action creaDaTemplate(templateID: UUID) returns Contratto;
  @(requires: 'Utente') action importTemplate(templateID: UUID) returns ImportResult;
  @(requires: 'Utente') action previewImportAI(templateID: UUID) returns PreviewImportResult;
  @(requires: 'Utente') action confirmImportAI(previewID: UUID, clausole: array of ClausolaProposta) returns ImportResult;
  @(requires: 'Utente') action creaTemplateManuale(nome: String, tipoServizio: String, descrizione: String, tipoRiferimento: String, clausole: array of ClausolaManuale, testata: TestataInput) returns Contratto;
  @(requires: 'Utente') action creaClausola(codice: String, titolo: String, testo: LargeString, clausolaBaseID: UUID) returns Clausola;
  action getStoricoClausola(clausolaID: UUID) returns array of StoricoClausolaEntry;
  action getContrattiClausola(clausolaID: UUID) returns array of ContrattoUsoClausola;
  action confrontaVersioni(versioneID1: UUID, versioneID2: UUID) returns ConfrontoVersioniResult;
  action confrontaContrattoConTemplate(contrattoID: UUID) returns array of FuoriSyncEntry;
  @(requires: 'Utente') action copiaVersioneClausola(clausolaVersioneID: UUID, contrattoDestinazioneID: UUID) returns ContrattoClausola;
  @(requires: 'Utente') action duplicaContratto(contrattoID: UUID) returns Contratto;
  @(requires: 'Utente') action cancellaClausola(clausolaID: UUID) returns Boolean;
  @(requires: 'Utente') action cancellaTemplate(templateID: UUID) returns Boolean;
  @(requires: 'Utente') action classificaAllegatoContratto(filename: String, file: LargeString) returns AllegatoClassificatoInfo;
  @(requires: 'Utente') action aggiungiAllegatoContratto(contrattoID: UUID, filename: String, file: LargeString, tipo: String, confidenza: Decimal(5,4), metodoRiconoscimento: String, testo: LargeString, metadati: array of MetadatoConfermato) returns ContrattoAllegato;
  @(requires: 'Utente') action eliminaAllegatoContratto(allegatoID: UUID) returns Boolean;

  action getVersioniContratto(contrattoID: UUID) returns array of {
    versioneID       : UUID;
    numero           : Integer;
    stato            : String;
    dataVersione     : DateTime;
    totaleClausole   : Integer;
    clausoleModificate : Integer;
  };

  action confrontaVersioniContratto(versioneID1: UUID, versioneID2: UUID) returns {
    differenzeTestata  : LargeString;
    clausoleAggiunte   : Integer;
    clausoleRimosse    : Integer;
    clausoleModificate : Integer;
    clausoleDettaglio  : LargeString;
  };

  @(requires: 'Utente') action archiviaContratto(contrattoID : UUID) returns Contratto;
  @(requires: 'Utente') action ripristinaContratto(contrattoID : UUID) returns Contratto;

  type TestataInput {
    intestatario            : String;
    responsabile            : String;
    codiceFiscale           : String;
    dataStipula             : Date;
    societaContraente       : String;
    responsabileControparte : String;
    emailControparte        : String;
    oggetto                 : String;
    dataDecorrenza          : Date;
    dataScadenza            : Date;
    categoria               : String;
    importo                 : Decimal(15,2);
  }

  @(requires: 'Utente') action salvaBozza(contrattoID: UUID) returns Contratto;
  @(requires: 'Utente') action aggiornaTestata(contrattoID: UUID, testata: TestataInput) returns Contratto;

  @readonly entity Revisione as projection on db.Revisione;
  @readonly entity Commento as projection on db.Commento;
  @readonly entity ContrattoImportato as projection on db.ContrattoImportato;
  @readonly entity ClausolaImportata as projection on db.ClausolaImportata;

  @(requires: 'Utente') action inviaARevisione(contrattoID: UUID) returns Contratto;
  @(requires: 'Revisore') action aggiungiCommento(contrattoID: UUID, contrattoClausolaID: UUID, testo: LargeString) returns Commento;
  @(requires: 'Utente') action risolviCommento(contrattoID: UUID, commentoID: UUID) returns Commento;
  @(requires: 'Utente') action riaprireBozza(contrattoID: UUID) returns Contratto;
  @(requires: 'Revisore') action approvaRevisione(revisioneID: UUID) returns Contratto;
  @(requires: 'Revisore') action rifiutaRevisione(revisioneID: UUID) returns Contratto;
}
