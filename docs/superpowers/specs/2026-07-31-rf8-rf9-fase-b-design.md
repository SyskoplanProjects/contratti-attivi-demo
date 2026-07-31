# Design — Fase B: RF8 Dashboard KPI + RF9 Workflow Remediation

**Data**: 2026-07-31
**Base**: Fase A (RF2/RF4/RF6) su branch `worktree-rf2-rf9-fase-a`, merged logicamente su main. Questo design estende `db/schema.cds` (prima eccezione: Fase A vietava modifiche schema; Fase B introduce entità nuove).

## Contesto

- RF8: vista aggregata su stato qualità/completezza documentale, deroghe per articolo, andamento nel tempo.
- RF9: ciclo vita anomalia (aperta → assegnata → in lavorazione → risolta), assegnazione a responsabile, azione correttiva allegabile.
- Fase A produce esiti volatile in `previewStore` (TTL 30 min). Fase B li rende persistenti come snapshot per contratto.
- `AlertModificaTemplate`/`AlertContrattoCoinvolto` esistono ma coprono solo alert da modifica template: non riusabili per anomalie (semantica diversa).
- `Revisione`/`Commento` danno il pattern stati enum + azioni service (`contratti-service.js:391-484`).
- UI: dashboard vive in app comparator (nuova vista), stesso pattern wizard esistente.

## Requisiti Fase B

- RF8: dashboard KPI + andamento temporale da snapshot storici.
- RF9: workflow remediation con 4 stati + chiusa-senza-azione.
- Persistenza: snapshot `EsitoVerificaContratto` per contratto+data; anomalie vivono oltre lo snapshot.
- Condizioni anomalia: deroghe Art.17/21, completezza < 100%, confidenza classificazione < 0.80.

## Architettura

### Modello dati (`db/schema.cds`)

```cds
type StatoAnomalia : String(20) enum { APERTA; ASSEGNATA; IN_LAVORAZIONE; RISOLTA; CHIUSA_SENZA_AZIONE; }

entity EsitoVerificaContratto : cuid, managed {
  contratto          : Association to Contratto not null;
  dataVerifica       : DateTime not null;
  completezzaPercent : Decimal(5,2);
  allegatiAttesi     : array of { codice: String; presente: Boolean; filename: String; };
  deroghe            : array of { articolo: String; esito: String; dettaglio: String; riferimentoComma: String; };
  totaleAllegati     : Integer;
  allegatiPresenti   : Integer;
  confidenzaMedia    : Decimal(5,4);
  fonte              : String(20) enum { AVVIO_VERIFICA; CONTRATTO; };
}

entity Anomalia : cuid, managed {
  esitoVerifica   : Association to EsitoVerificaContratto not null;
  tipo            : String(20) enum { DEROGHE; COMPLETEZZA; CONFIDENZA; };
  riferimento     : String(200);
  dettaglio       : LargeString;
  stato           : StatoAnomalia default 'APERTA';
  assegnatario    : String(255);
  notaCorrettiva  : LargeString;
  allegato        : LargeString;
  filenameAllegato : String(200);
}
```

- `array of {struct}` → JSON column via CAP (ok sqlite + HANA).
- Snapshot immutabile: creata a ogni conferma verifica. Nessuna UPDATE su righe esistenti.
- Nessuna modifica a `Contratto`, `ContrattoAllegato`, `AlertModificaTemplate`.

### Pipeline snapshot (`srv/comparator-service.js`)

Hook in `confirmCoverage` (dopo salvataggio allegati/metadati, stessa transazione):

1. Riclassifica allegati salvati (non preview) con classificatore esistente.
2. `verificaCompletezza` sugli allegati salvati → `completezzaPercent`, `allegatiAttesi`, `totaleAllegati`, `allegatiPresenti`.
3. `verificaDeroghe` sul documento principale → array deroghe.
4. `confidenzaMedia` = media confidenze allegati classificati.
5. INSERT `EsitoVerificaContratto`.
6. Genera anomalie (vedi sotto) senza duplicati per la stessa verifica.

Nota: `verificaCompletezza(previewID, allegati)` e `verificaDeroghe(previewID)` di Fase A lavorano su previewStore. Fase B le usa ri-utilizzando le pure function nei lib (`allegati-attesi.js`, `deroghe-engine.js`) con input da DB, non da preview. Non riusa le action (che sono preview-based): chiama direttamente i lib.

### Generazione anomalie

Per ogni snapshot:

| Condizione | Anomalia |
|---|---|
| `completezzaPercent < 100` | COMPLETEZZA, riferimento = lista codici mancanti (es. "ALLEGATO_B, ALLEGATO_E") |
| esito deroga `derogato` (uno per articolo derogato) | DEROGHE, riferimento = "Art. N comma X", dettaglio dal snapshot |
| `confidenza < SOGLIA_CONFIDENZA` (0.80) per allegato | CONFIDENZA, riferimento = filename |

- `fonte`: preview con `contractID` → `CONTRATTO`; preview da upload (calcolaCoverage) → `AVVIO_VERIFICA`. Derivata dal campo `contractID` della preview, stessa logica di `confirmCoverage`.
- Soglia: costante `SOGLIA_CONFIDENZA = 0.80` in `srv/lib/anomalie-utils.js`.
- Duplicati: una verifica genera al massimo un'anomalia per condizione (dedup per tipo+riferimento in-memory prima dell'INSERT). Due articoli derogati → due anomalie DEROGHE distinte.

### Azioni service (`srv/comparator-service.cds` + `.js`)

Tutte `@requires: 'Utente'`, pattern action esistenti.

```cds
action getDashboardKPIs() returns {
  totaleContratti    : Integer;
  completezzaMedia   : Decimal(5,2);
  contrattiCompleti  : Integer;
  derogheTotali      : Integer;
  anomalieAperte     : Integer;
  andamento          : array of { data: Date; completezzaMedia: Decimal(5,2); totaleContratti: Integer; };
};
action getAnomalie(stato: String, tipo: String) returns array of {
  anomaliaID: UUID; contrattoID: UUID; intestatario: String; tipo: String; riferimento: String;
  stato: String; assegnatario: String; dataApertura: DateTime;
};
action assegnaAnomalia(anomaliaID: UUID, assegnatario: String) returns Anomalia;
action avviaLavorazione(anomaliaID: UUID) returns Anomalia;
action risolviAnomalia(anomaliaID: UUID, nota: String, file: LargeString, filename: String) returns Anomalia;
action chiudiAnomalia(anomaliaID: UUID, nota: String) returns Anomalia;
```

Transizioni stato:

| Azione | Da → A |
|---|---|
| assegnaAnomalia | APERTA → ASSEGNATA |
| avviaLavorazione | ASSEGNATA → IN_LAVORAZIONE |
| risolviAnomalia | IN_LAVORAZIONE → RISOLTA |
| chiudiAnomalia | APERTA/ASSEGNATA/IN_LAVORAZIONE → CHIUSA_SENZA_AZIONE |

- Transizione non valida → 409 (pattern `_isRevisore`, `contratti-service.js:880`).
- Anomalia inesistente → 404.
- `getDashboardKPIs.andamento`: aggregazione per giorno su snapshot storici (group by data, avg completezzaPercent). Ultimi 30 giorni.

### Dashboard UI (app comparator)

- `app/comparator/webapp/view/Dashboard.view.xml` + `controller/Dashboard.controller.js`.
- Route nuova in `manifest.json`; voce "Dashboard" nella navigazione.
- Componenti: KPI cards (`sap.m.ObjectHeader`/Label+Text), lista andamento con `sap.m.ProgressIndicator` (no librerie grafiche extra), tabella anomalie con `sap.m.Table` + filtri stato/tipo, dialog per assegna/risolvi/chiudi.
- Consuma le action service via OData model comparator.

## Error handling

| Caso | Comportamento |
|---|---|
| transizione stato non valida | 409 con messaggio |
| anomaliaID inesistente | 404 |
| confirmCoverage senza allegati | snapshot con completezza 0, deroghe dal documento principale se presente |
| file opzionale in risolviAnomalia | allegato nullable, filename nullable |

## Test

Pattern: `cds.test` + mock `../srv/modules/openai-module` (chatJSON→mockChatJSON, embeddings→`[1,0,0]`), `MOCK_USER` da `./helpers/auth`.

- `test/snapshot-esiti.test.js`: confirmCoverage crea snapshot (completezza, deroghe, confidenza media, allegatiAttesi); anomalie generate per condizioni (completa, deroga, confidenza bassa); nessun duplicato; fonte=AVVIO_VERIFICA/CONTRATTO.
- `test/anomalie-workflow.test.js`: transizioni valide e invalide (409), 404, risolvi con/without file, chiudi con nota.
- `test/dashboard-kpi.test.js`: KPIs aggregate corrette; andamento raggruppato per data; contratti senza snapshot esclusi.

## Fuori scope Fase B

- RF7 riconciliazione SAP (post-SAP).
- Ingestion RF1.
- UI wizard nuove (esistente resta).
- Notifiche push/email per anomalie.
- Delega/riassegnazione storica (solo ultimo assegnatario su Anomalia).
