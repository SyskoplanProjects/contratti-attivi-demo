namespace com.reply.contrattiattivi;
using { cuid, managed } from '@sap/cds/common';

entity Template : cuid, managed {
  nome         : String(200) not null;
  tipoServizio : String(100);
  descrizione  : String(1000);
  versioni     : Composition of many TemplateVersion on versioni.template = $self;
}

entity TemplateVersion : cuid, managed {
  template      : Association to Template not null;
  numero        : Integer not null;
  dataCreazione : DateTime not null;
  note          : String(500);
  righe         : Composition of many TemplateVersionClausola on righe.templateVersion = $self;
}

entity Clausola : cuid, managed {
  codice     : String(20) not null;
  titolo     : String(200) not null;
  aggiuntiva : Boolean default false;
  template   : Association to Template;
  versioni   : Composition of many ClausolaVersione on versioni.clausola = $self;
}

entity ClausolaVersione : cuid, managed {
  clausola                : Association to Clausola not null;
  numero                  : Integer not null;
  testo                   : LargeString not null;
  dataCreazione           : DateTime not null;
  modificata              : Boolean default false;
  dettaglioDelta          : LargeString;
  templateVersionOrigine  : Association to TemplateVersion;
  contrattoOrigine        : Association to Contratto;
  embedding               : LargeString;
}

entity TemplateVersionClausola : cuid {
  templateVersion  : Association to TemplateVersion not null;
  clausola         : Association to Clausola not null;
  clausolaVersione : Association to ClausolaVersione not null;
  ordine           : Integer not null;
}

type StatoContratto : String(20) enum { BOZZA; IN_REVISIONE; APPROVATO; FIRMATO; ARCHIVIATO; }
type CategoriaContratto : String(50) enum { fornitura; servizio; consulenza; NDA; altro; }

entity Contratto : cuid, managed {
  intestatario    : String(200) not null;
  responsabile    : String(200);
  importo         : Decimal(15,2);
  codiceFiscale   : String(20);
  dataStipula     : Date;
  stato           : StatoContratto default 'BOZZA' @assert.range;
  societaContraente      : String(300);
  responsabileControparte : String(200);
  emailControparte       : String(100);
  oggetto                : String(500);
  dataDecorrenza         : Date;
  dataScadenza           : Date;
  categoria              : CategoriaContratto @assert.range;
  bozzaSalvata           : Boolean default false;
  template        : Association to Template not null;
  templateVersion : Association to TemplateVersion not null;
  dataUltimaVerifica  : DateTime;
  esitoVerifica       : String(20) enum { ok; non_conforme; in_corso; };
  dataArchiviazione   : DateTime;
  clausole        : Composition of many ContrattoClausola on clausole.contratto = $self;
  allegati        : Composition of many ContrattoAllegato on allegati.contratto = $self;
  metadati        : Composition of many MetadatoDocumento on metadati.contratto = $self;
}

entity ContrattoClausola : cuid {
  contratto        : Association to Contratto not null;
  clausola         : Association to Clausola not null;
  clausolaVersione : Association to ClausolaVersione not null;
  ordine           : Integer not null;
  rimossa          : Boolean default false;
}

entity ContrattoImportato : cuid, managed {
  filename           : String(200) not null;
  documentoOriginale : LargeString not null;
  template           : Association to Template;
  coveragePercent    : Decimal(5,2);
  dataProcessamento  : DateTime not null;
  clausole           : Composition of many ClausolaImportata on clausole.contrattoImportato = $self;
}

entity ContrattoAllegato : cuid, managed {
  contratto            : Association to Contratto not null;
  filename              : String(200) not null;
  mimeType              : String(100);
  contenuto             : LargeString not null;
  tipo                  : String(50) not null;
  confidenza            : Decimal(5,4);
  metodoRiconoscimento  : String(20);
  testo                 : LargeString;
  dataScadenza          : Date;
  metadati              : Composition of many MetadatoDocumento on metadati.allegato = $self;
}

entity MetadatoDocumento : cuid, managed {
  contratto             : Association to Contratto;
  allegato               : Association to ContrattoAllegato;
  campo                  : String(100) not null;
  etichetta               : String(200) not null;
  valore                  : LargeString;
  valoreOriginaleAI        : LargeString;
  confidenza              : Decimal(5,4);
  modificatoManualmente   : Boolean default false;
}

entity ClausolaImportata : cuid {
  contrattoImportato : Association to ContrattoImportato not null;
  numero             : Integer not null;
  titolo             : String(200);
  testo              : LargeString not null;
  embedding          : LargeString;
  clausolaTemplate   : Association to Clausola;
  similarity         : Decimal(5,4);
  variante           : Boolean default false;
}

type StatoRevisione : String(20) enum { IN_REVISIONE; COMMENTATA; APPROVATA; RIFIUTATA; }
type StatoCommento : String(20) enum { APERTO; RISOLTO; }

entity Revisione : cuid, managed {
  contratto         : Association to Contratto not null;
  stato             : StatoRevisione default 'IN_REVISIONE' @assert.range;
  revisore          : String(255);
  dataInvio         : DateTime not null;
  dataCompletamento : DateTime;
  commenti          : Composition of many Commento on commenti.revisione = $self;
}

entity Commento : cuid, managed {
  revisione          : Association to Revisione not null;
  contrattoClausola  : Association to ContrattoClausola not null;
  testo              : LargeString not null;
  autore             : String(255) not null;
  stato              : StatoCommento default 'APERTO' @assert.range;
}

entity ChatThread : cuid, managed {
  utente   : String(255) not null;
  threadID : String(100) not null;
}

entity AlertModificaTemplate : cuid, managed {
  template         : Association to Template not null;
  clausola         : Association to Clausola not null;
  vecchiaVersione  : Association to ClausolaVersione;
  nuovaVersione    : Association to ClausolaVersione;
  dataModifica     : DateTime not null;
  risolto          : Boolean default false;
  contrattiCoinvolti : Composition of many AlertContrattoCoinvolto on contrattiCoinvolti.alert = $self;
}

entity AlertContrattoCoinvolto : cuid {
  alert            : Association to AlertModificaTemplate not null;
  contratto        : Association to Contratto not null;
  clausolaIdentica : Boolean;
  notificato       : Boolean default false;
}

entity ContrattoVersione : cuid, managed {
  contratto                : Association to Contratto not null;
  numero                   : Integer not null;
  stato                    : String(20) not null;
  dataVersione             : DateTime not null;
  intestatario              : String(200);
  responsabile              : String(200);
  importo                   : Decimal(15,2);
  codiceFiscale             : String(20);
  dataStipula               : Date;
  societaContraente         : String(300);
  responsabileControparte   : String(200);
  emailControparte          : String(100);
  oggetto                   : String(500);
  dataDecorrenza            : Date;
  dataScadenza              : Date;
  categoria                 : String(50);
  bozzaSalvata              : Boolean;
  clausoleSnapshot : Composition of many ContrattoVersioneClausola
    on clausoleSnapshot.contrattoVersione = $self;
}

entity ContrattoVersioneClausola : cuid {
  contrattoVersione : Association to ContrattoVersione not null;
  clausolaCodice    : String(20) not null;
  clausolaTitolo    : String(200) not null;
  clausolaVersione  : Association to ClausolaVersione not null;
  ordine            : Integer not null;
  rimossa           : Boolean default false;
}
