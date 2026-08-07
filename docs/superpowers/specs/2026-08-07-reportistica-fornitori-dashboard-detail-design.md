# Reportistica Fornitori (excel infoprovider) + Apertura contratto da dashboard — Design

> Data: 2026-08-07
> Area: `app/contratti/webapp` + `srv/contratti-service.cds` + `db/schema.cds` + seeder

## Goal

Due modifiche nell'app contratti:

1. **Reportistica Vendor Mesh da dati reali.** Oggi il tab "Reportistica" dell'IconTabBar dashboard mostra due tabelle da dati MOCK (`mockFornitori.js`). Il report va spostato fuori dalla dashboard come bottone "Report Fornitori" nel header della home (`Main.view.xml`), con una nuova pagina/route dedicata che mostra **le 13 colonne dell'excel `infoproviderdata (3).xlsx`** (sheet `Esportazione SAPUI5`, 4123 righe) caricate nel DB tramite seeder idempotente da snapshot CSV nel repo.
2. **Apertura contratto dalla dashboard.** La tabella "Dettaglio contratti" del tab Cockpit della dashboard (`DashboardCockpit.fragment.xml`) ha righe senza click: aggiungere navigazione alla stessa view `Detail` usata dalla sezione Contratti.

## Vincoli globali

- Entità nuova `Fornitore` in `db/schema.cds` con le 13 colonne esatte dell'excel.
- Snapshot dati: `db/data/fornitori.csv` (generato una volta dall'excel, committato nel repo) — nessuna dipendenza dal file in `~/Downloads`.
- Seeder: script `npm run seed-fornitori` → `srv/lib/seed-fornitori.js`, idempotente (DELETE + INSERT o upsert), riusa `parseXlsx`/CSV già disponibili.
- Proiezione `@readonly entity Fornitore` nel servizio `ContrattiService` (`/contratti/`) → filtri OData standard.
- UI5: pattern esistenti — `sap.ui.define`, controller estendono BaseController, raw `fetch` per azioni, prefissi `app-`, tabella con `growing`/`growingThreshold`.
- Non rimuovere `mockFornitori.js`/`mockCockpit.js`: ancora usati dal tab Cockpit (top fornitori, donut). Rimuovere SOLO il tab `Reportistica` e i model ad esso collegati se orfani.

---

## Punto 1 — Report Fornitori con colonne excel

### Stato attuale
- `Dashboard.view.xml`: IconTabBar con `dashboardTabBar` → filtri `cockpit` e `reportistica`.
- `DashboardReportistica.fragment.xml`: tabella `vendorMeshTable` (15 colonne mock: codiceSAP, nome, piva, codiceFiscale, tipologia, sottoTipologia, statoQualifica, rischi vari, dipendenzaEconomica) + tabella `integrazioneTable` (fornitori con contratti collegati).
- `Dashboard.controller.js`: model `fornitori` (JSONModel da `mockFornitori`), model `integrazione` (fetched via `/contratti/Contratto?$filter=...`), `onFornitoreVendorMeshPress` naviga a `dashboard` con parametro fornitore.
- Excel: 13 colonne, header esatti: `Codice ATECO | Rischio emissioni | ID SAP fornitore | Nome del fornitore | Codice Fiscale | Data Attivazione | N. Addetti | CGS score | Fatturato tot. | Anno fatturato tot. | Protesti | Pregiudizievoli | Score Vendor Rating`. Righe esempio: `1300000327 | APPIAN SOFTWARE INTERNATI`, `1000017910 | IDEALSERVICE SOC. COOP. | 00223850306`, ecc.

### Modificazioni

#### Backend — schema + servizio + seeder
- `db/schema.cds`: nuova entità `Fornitore : cuid` con campi (camelCase, tipi):
  - `codiceAteco : String(20)`
  - `rischioEmissioni : String(100)` (valore excel libero)
  - `idSapFornitore : String(20)` — NOT NULL, usato come chiave logica per idempotenza
  - `nomeFornitore : String(300)` — NOT NULL
  - `codiceFiscale : String(30)`
  - `dataAttivazione : Date`
  - `numAddetti : Integer`
  - `cgsScore : String(50)`
  - `fatturatoTot : Decimal(18,2)`
  - `annoFatturatoTot : String(10)` (valore libero excel, es. "2023")
  - `protesti : String(10)` ("Si"/"No")
  - `pregiudizievoli : String(10)` ("Si"/"No")
  - `scoreVendorRating : String(50)`
- `srv/contratti-service.cds`: `@readonly entity Fornitore as projection on db.Fornitore;`
- `db/data/fornitori.csv`: snapshot generato dall'excel (riga header + 4123 righe). CSV con separatore `;`, encoding UTF-8, colonne in ordine excel. Generato via script una tantum e committato.
- `srv/lib/seed-fornitori.js`: legge `db/data/fornitori.csv`, DELETE completo di `Fornitore` poi INSERT batch (idempotente). Esporta `main()`. Robustezza: valori vuoti → null; numeri non parsabili → null.
- `package.json`: script `"seed-fornitori": "node srv/lib/seed-fornitori.js"`.

#### Frontend — nuova route report + bottone + pagina
- `app/contratti/webapp/manifest.json`: nuova route `{ "pattern": "report", "name": "report", "target": "report" }` + target `{ "viewName": "Report", "viewLevel": 1 }`.
- `app/contratti/webapp/view/Report.view.xml`: pagina con header (back → main), ricerca libera `SearchField` + filtro per ID SAP + tabella 13 colonne bind a `/Fornitore` OData (model default del Component), `growing`/`growingThreshold=50`, `noDataText`.
  - Colonne header esatte come label (matching excel): Codice ATECO, Rischio emissioni, ID SAP fornitore, Nome del fornitore, Codice Fiscale, Data Attivazione, N. Addetti, CGS score, Fatturato tot., Anno fatturato tot., Protesti, Pregiudizievoli, Score Vendor Rating.
- `app/contratti/webapp/controller/Report.controller.js`: estende BaseController; `onInit` setta filtro; `onFilter` applica `Filter` (Contains su nomeFornitore/idSapFornitore, caseSensitive false) al binding `items`; `onNavBack` → `navTo("main")`.
- `app/contratti/webapp/view/Main.view.xml`: aggiungere bottone **"Report Fornitori"** icon `sap-icon://list` nell'HBox `app-btn-group` (riga 34-40), press `onApriReport`.
- `app/contratti/webapp/controller/Main.controller.js`: `onApriReport` → `router.navTo("report")`.

#### Rimozione tab Reportistica dalla dashboard
- `Dashboard.view.xml`: rimuovere il filtro `reportistica` da `dashboardTabBar` (resta solo `cockpit`).
- `Dashboard.controller.js`: rimuovere init dei model `fornitori`/`integrazione` e il metodo `onFornitoreVendorMeshPress`/`_loadIntegrazioneContratti` SOLO se non usati altrove nel tab Cockpit. **Attenzione:** tab Cockpit usa `fornitori` model (top fornitori, `onCambiaVistaFornitori`) e `cockpit` model — questi RESTANO. Da rimuovere solo `integrazione` (usato solo da tabella integrazione che spariva) e relativo fetch. Verificare al momento dell'implementazione quali model restano usati dal tab Cockpit; `mockFornitori.js` resta (top fornitori).
- `DashboardReportistica.fragment.xml`: rimuovere file (non più referenziato).
- `mockFornitori.js`: RESTA (usato dal tab Cockpit top fornitori).

---

## Punto 2 — Apertura contratto dalla dashboard

### Stato attuale
- `DashboardCockpit.fragment.xml` `dettaglioContrattiTable` (riga 63): `ColumnListItem` senza `type`/`press` → click non fa nulla.
- Pattern esistente: `Main.view.xml` `onSelectContratto` apre in nuova tab `#/detail/<id>`; `Dashboard.controller.js` `onApriContrattoIntegrazione` (riga 77-81) fa `router.navTo("detail", { id })`.

### Modifica
- `DashboardCockpit.fragment.xml`: `ColumnListItem` → `type="Navigation"` + `press="onApriContrattoDettaglio"`.
- `Dashboard.controller.js`: nuovo metodo `onApriContrattoDettaglio(oEvent)`: legge `ID` dal binding context del model default (path `/Contratto/...`) e naviga `router.navTo("detail", { id: encodeURIComponent(sID) })` — stessa route/view del click dalla sezione Contratti (view `Detail`).

---

## Test

- Backend: `test/seed-fornitori.test.js` — seeder popola `Fornitore` da fixture CSV minimale (2-3 righe), idempotente (doppia esecuzione → stesso conteggio), campi mappati correttamente (valori vuoti → null).
- OData: `test/fornitore-odata.test.js` — GET `/contratti/Fornitore` ritorna righe seed; filtro `$filter=contains(nomeFornitore,'...')` funziona.
- Frontend: verifica manuale (nessun QUnit view contratti): bottone apre route report, tabella 13 colonne da backend, click riga tabella dettaglio contratti dashboard apre Detail.

## Note tempo/rischio

- CSV 4123 righe → dimensione file ok nel repo (~200-400 KB).
- Seed su DB dev sqlite via script, non a ogni avvio (no auto-deploy data). Nel deploy HANA servirà eseguire `npm run seed-fornitori` a parte.
- Non toccare `getDashboardKPIs`/`getAnomalie` (comparator) — report fornitori non li usa.

## Non incluso (YAGNI)

- Modifica del tab Cockpit (top fornitori, donut) — resta mock come oggi.
- Export xlsx del report.
- Filtri complessi per colonna oltre ricerca + ID SAP.
- Collegamento Fornitore ↔ Contratto via FK (match per nome esiste solo nel mock integrazione che si rimuove).
