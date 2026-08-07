# Reportistica Fornitori (excel infoprovider) + Apertura contratto da dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caricare 4123 fornitori da `infoproviderdata (3).xlsx` nel DB, esporli come entità OData `Fornitore` in una nuova pagina "Report Fornitori" raggiungibile da bottone in home, e rendere navigabile il dettaglio contratto dalla tabella "Dettaglio contratti" del tab Cockpit della dashboard.

**Architecture:** Nuova entità `Fornitore` in `db/schema.cds` + proiezione `@readonly` in `srv/contratti-service.cds`. Dati importati una volta da excel a snapshot CSV `db/data/fornitori.csv` (committato). Seeder idempotente `srv/lib/seed-fornitori.js`. Frontend: nuova route `report` con `Report.view.xml` (tabella 13 colonne bind OData), bottone "Report Fornitori" nella home, rimozione tab "Reportistica" dalla dashboard e navigazione `onApriContrattoDettaglio` sulla tabella "Dettaglio contratti".

**Tech Stack:** CAP (`@sap/cds`), SQLite (`@cap-js/sqlite`) dev / HANA cloud prod, UI5 (sap.m), jest `cds.test`, openpyxl (solo script export, non runtime).

## Global Constraints

- Namespace: `com.reply.contrattiattivi`.
- Entità `Fornitore` con i 13 campi esatti in ordine excel; idempotenza seeder = DELETE completo + INSERT; chiave logica `ID SAP fornitore`.
- CSV `db/data/fornitori.csv`: delimiter `;`, UTF-8, header + 4123 righe, ordine colonne = ordine excel. Committato nel repo. Nessuna dipendenza runtime da `~/Downloads`.
- Seeder legge CSV dal filesystem, DELETE completo poi INSERT (idempotente), valori vuoti/non-parsabili → `null`.
- Proiezione `@readonly entity Fornitore` nel servizio `ContrattiService` (`/contratti/`).
- UI5: controller estendono `BaseController`, `sap.ui.define`, tabella `growing`/`growingThreshold`, prefissi `app-`, nav pattern `getRouter().navTo(...)`.
- `mockFornitori.js`, `mockCockpit.js` RESTANO (usati dal tab Cockpit top fornitori/donut). Rimuovere SOLO tab `reportistica`, fragment `DashboardReportistica.fragment.xml` e model `integrazione`.
- Non toccare `getDashboardKPIs`/`getAnomalie` (comparator).

---

## File structure (create/modify)

- `scripts/export-fornitori-csv.py` (Create) — export excel → CSV, one-off
- `db/data/fornitori.csv` (Create) — snapshot 4123 righe
- `db/schema.cds` (Modify) — entità `Fornitore` in fondo (dopo `EsempioClassificazione`)
- `srv/contratti-service.cds` (Modify) — proiezione Fornitore
- `srv/lib/seed-fornitori.js` (Create) — seeder idempotente
- `package.json` (Modify) — script `seed-fornitori`
- `app/contratti/webapp/manifest.json` (Modify) — route+target `report`
- `app/contratti/webapp/view/Report.view.xml` (Create)
- `app/contratti/webapp/controller/Report.controller.js` (Create)
- `app/contratti/webapp/view/Main.view.xml` (Modify) — bottone Report Fornitori
- `app/contratti/webapp/controller/Main.controller.js` (Modify) — `onApriReport`
- `app/contratti/webapp/view/Dashboard.view.xml` (Modify) — remove tab reportistica
- `app/contratti/webapp/fragment/DashboardReportistica.fragment.xml` (Delete)
- `app/contratti/webapp/fragment/DashboardCockpit.fragment.xml` (Modify) — nav riga
- `app/contratti/webapp/controller/Dashboard.controller.js` (Modify) — remove integrazione, add `onApriContrattoDettaglio`
- `test/seed-fornitori.test.js` (Create)
- `test/fornitore-odata.test.js` (Create)

---

### Task 1: Export excel → CSV snapshot

**Files:**
- Create: `scripts/export-fornitori-csv.py`
- Create: `db/data/fornitori.csv`

**Interfaces:**
- Produces: `db/data/fornitori.csv` (13 colonne in ordine excel, delimiter `;`, UTF-8). Colonne: `Codice ATECO,Rischio emissioni,ID SAP fornitore,Nome del fornitore,Codice Fiscale,Data Attivazione,N. Addetti,CGS score,Fatturato tot.,Anno fatturato tot.,Protesti,Pregiudizievoli,Score Vendor Rating` (header). Destinazione letta da questo file da seeder (Task 3).

- [ ] **Step 1: Scrivi script export**

`scripts/export-fornitori-csv.py`:

```python
#!/usr/bin/env python3
import csv, sys, openpyxl

SRC = "/Users/emiliocasella/Downloads/infoproviderdata (3).xlsx"
OUT = "db/data/fornitori.csv"
SHEET = "Esportazione SAPUI5"

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))
rows = [r for r in rows if any(c is not None and str(c).strip() for c in r)]
header = rows[0]
data = rows[1:]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow([str(c).strip() for c in header])
    for r in data:
        w.writerow(["" if c is None else str(c).strip() for c in r[:13]])
print(f"header={len(header)} rows={len(data)} -> {OUT}")
```

- [ ] **Step 2: Esegui, verifica output**

```bash
python3 scripts/export-fornitori-csv.py
```
Expected: `header=13 rows=4123 -> db/data/fornitori.csv`

```bash
wc -l db/data/fornitori.csv
```
Expected: `4124` (header + 4123).

- [ ] **Step 3: Commit**

```bash
git add scripts/export-fornitori-csv.py db/data/fornitori.csv
git commit -m "chore: snapshot fornitori infoprovider in db/data/fornitori.csv"
```

---

## Task 2: Entità `Fornitore`

**Files:**
- Modify: `db/schema.cds`
- Modify: `srv/contratti-service.cds`

**Interfaces:**
- Produces: entità `com.reply.contrattiattivi.Fornitore` (colonne excel→camelCase), proiezione `@readonly Fornitore` nel servizio.
- Consumes: ordine colonne CSV (Task 1).

- [ ] **Step 1: Aggiungi entità in fondo schema.cds**

`db/schema.cds` (append after `EsempioClassificazione`)

```cds
entity Fornitore : cuid, managed {
  idSapFornitore  : String(20) @title: 'ID SAP fornitore' not null;
  nomeFornitore   : String(300) @title: 'Nome del fornitore' not null;
  codiceAteco     : String(20)  @title: 'Codice ATECO';
  rischioEmissioni: String(100) @title: 'Rischio emissioni';
  codiceFiscale   : String(30)  @title: 'Codice Fiscale';
  dataAttivazione : Date        @title: 'Data Attivazione';
  numAddetti      : Integer     @title: 'N. Addetti';
  cgsScore        : String(50)  @title: 'CGS score';
  fatturatoTot    : Decimal(18,2) @title: 'Fatturato tot.';
  annoFatturatoTot: String(10)  @title: 'Anno fatturato tot.';
  protesti        : String(10)  @title: 'Protesti';
  pregiudizievoli : String(10)  @title: 'Pregiudizievoli';
  scoreVendorRating : String(50) @title: 'Score Vendor Rating';
}
```

- [ ] **Step 2: Esponi proiezione readonly**

Add into `srv/contratti-service.cds` in service block (after other `@readonly entity ... projection` lines, ~line 83):

```cds
  @readonly entity Fornitore as projection on db.Fornitore;
```

The service is `@path: '/contratti'`.

- [ ] **Step 3: Verifica compilazione modello**

```bash
cds compile db/schema.cds srv/contratti-service.cds > /dev/null && echo OK
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add db/schema.cds srv/contratti-service.cds
git commit -m "feat: entita Fornitore + proiezione readonly OData"
```

---

## Task 3: Seeder `seed-fornitori.js`

**Files:**
- Create: `srv/lib/seed-fornitori.js`
- Modify: `package.json`
- Create: `test/seed-fornitori.test.js`

**Interfaces:**
- Consumes: `db/data/fornitori.csv`; `cds.connect.to('db')`; cds `entities('com.reply.contrattiattivi').Fornitore` in test.
- Produces: exports `{ main }`; pattern-consistente con `seed-demo.js`.

- [ ] **Step 1: Scrivi script (corrected)**

`srv/lib/seed-fornitori.js`:

```js
const path = require('path');
const fs = require('fs');
const { DELETE, INSERT } = require('@sap/cds');

const NAMESPACE = 'com.reply.contrattiattivi';
const CSV_PATH = path.join(__dirname, '..', '..', 'db', 'data', 'fornitori.csv');

function parseCsv(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim() !== '');
  return rows.map(l => l.split(';'));
}

function clean(row) {
  const s = (i) => { const v = row[i] !== undefined ? row[i].trim() : ''; return v === '' ? null : v; };
  return {
    idSapFornitore: s(2),
    codiceAteco: s(0),
    rischioEmissioni: s(1),
    nomeFornitore: s(3),
    codiceFiscale: s(4),
    dataAttivazione: s(5),
    numAddetti: s(6) === null ? null : parseInt(s(6), 10) || null,
    cgsScore: s(7),
    fatturatoTot: s(8) === null ? null : parseFloat(s(8).replace(',', '.')) || null,
    annoFatturatoTot: s(9),
    protesti: s(10),
    pregiudizievoli: s(11),
    scoreVendorRating: s(12)
  };
}

async function seed(cds) {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv).slice(1);
  const { Fornitore } = cds.entities(NAMESPACE);
  await DELETE.from(Fornitore);
  const entries = rows.map(clean).filter(r => r.idSapFornitore);
  await INSERT.into(Fornitore).entries(entries);
  console.log(`Fornitori importati: ${entries.length}`);
  return entries.length;
}

async function main() {
  const cds = require('@sap/cds');
  await cds.connect.to('db');
  await seed(cds);
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { seed, main, parseCsv };
```

- [ ] **Step 2: package.json script**

Add to `"scripts"` (in `"seed-demo"` line):

```json
"seed-fornitori": "node srv/lib/seed-fornitori.js",
```

- [ ] **Step 3: test seeder idempotente** (doppia chiamata stesso conteggio).

`test/seed-fornitori.test.js`:

```js
const path = require('path');
const cds = require('@sap/cds');
const { SELECT } = cds;
const { seed } = require('../srv/lib/seed-fornitori');

let db;
beforeAll(async () => {
  await cds.test(path.join(__dirname, '..'));
  db = cds.db;
});

describe('seed-fornitori', () => {
  it('imports fornitori from CSV and is idempotent', async () => {
    const n1 = await seed(cds);
    const { COUNT } = await SELECT.from('com.reply.contrattiattivi.Fornitore').columns([{ ref: ['count(*)'], as: 'COUNT' }]);
    expect(COUNT).toBe(n1);
    const n2 = await seed(cds);
    expect(n2).toBe(n1);
    const { COUNT: c2 } = await SELECT.from('com.reply.contrattiattivi.Fornitore').columns([{ ref: ['count(*)'], as: 'c2' }]);
    expect(c2).toBe(n1);
  });
});
```

- [ ] **Step 4: Run test**

```bash
npx jest test/seed-fornitori.test.js --testTimeout=30000 --forceExit
```
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add srv/lib/seed-fornitori.js package.json test/seed-fornitori.test.js
git commit -m "feat: seeder idempotente fornitori da CSV (npm run seed-fornitori)"
```

---

## Task 4: Test OData `Fornitore` (filtro contains)

**Files:**
- Create: `test/fornitore-odata.test.js`

**Interfaces:**
- Consumes: seeder (Task 3), entità Fornitore (Task 2). Server `cds.test`.
- Produces: sicurezza OData Fornitore GET + filter.

- [ ] **Step 1: Scrivi test**

`test/fornitore-odata.test.js`:

```js
const path = require('path');
const cds = require('@sap/cds');
const { GET } = cds.test(path.join(__dirname, '..'));
const { seed } = require('../srv/lib/seed-fornitori');
const { MOCK_USER } = require('./helpers/auth');

describe('fornitore odata', () => {
  beforeAll(async () => { await seed(cds.db); });

  it('GET /contratti/Fornitore returns seeded rows', async () => {
    const res = await GET('/contratti/Fornitore', { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value.length).toBeGreaterThan(4000);
  });

  it('supports $filter contains', async () => {
    const res = await GET('/contratti/Fornitore?$filter=contains(nomeFornitore,%27APP%27)', { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value.length).toBeGreaterThan(0);
  });

  it('rejects without auth', async () => {
    const res = await GET('/contratti/Fornitore');
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx jest test/fornitore-odata.test.js --testTimeout=30000 --forceExit
```
Expected: PASS (3 test).

- [ ] **Step 3: Commit**

```bash
git add test/fornitore-odata.test.js
git commit -m "test: OData Fornitore GET + filter contains"
```

---

## Task 5: Route report + view + controller

**Files:**
- Modify: `app/contratti/webapp/manifest.json`
- Create: `app/contratti/webapp/view/Report.view.xml`
- Create: `app/contratti/webapp/controller/Report.controller.js`

**Interfaces:**
- Produces: route `report` + target. Component default model bind `/Fornitore`.
- Consumes: Task 2 (entità esposta), pattern BaseController.

- [ ] **Step 1: Aggiungi route/target a manifest**

`app/contratti/webapp/manifest.json` — aggiungi tra le `routes`:

```json
{ "pattern": "report", "name": "report", "target": "report" }
```

e tra i `targets`:

```json
"report": { "viewName": "Report", "viewLevel": 1 }
```

- [ ] **Step 2: Vista**

`app/contratti/webapp/view/Report.view.xml`:

```xml
<mvc:View controllerName="com.reply.contrattiattivi.app.controller.Report"
  xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:core="sap.ui.core">
  <Page>
    <customHeader>
      <Toolbar class="app-page-header">
        <Button icon="sap-icon://nav-back" type="Transparent" class="app-toolbar-btn" press="onNavBack" />
        <Title text="Report Fornitori" class="app-header-title" />
      </Toolbar>
    </customHeader>
    <content>
      <VBox class="sapUiSmallMargin app-page-content">
        <HBox class="sapUiSmallMarginBottom" alignItems="End" wrap="Wrap">
          <VBox class="sapUiTinyMarginEnd">
            <Label text="Ricerca" />
            <SearchField id="rfSearch" placeholder="Nome fornitore o ID SAP..." width="20rem" search="onSearch" change="onChange" />
          </VBox>
          <VBox>
            <Label text="" />
            <Button icon="sap-icon://reset" text="Reset" press="onReset" class="app-btn app-btn-neutral" />
          </VBox>
        </HBox>
        <Table id="fornitoriTable" items="{path:'/Fornitore', parameters:{operationMode:'Server'}}"
          growing="true" growingThreshold="50" noDataText="Nessun fornitore" class="app-table-wrap">
        <columns>
          <Column><Text text="Codice ATECO" /></Column>
          <Column><Text text="Rischio emissioni" /></Column>
          <Column><Text text="ID SAP fornitore" /></Column>
          <Column><Text text="Nome del fornitore" /></Column>
          <Column><Text text="Codice Fiscale" /></Column>
          <Column><Text text="Data Attivazione" /></Column>
          <Column><Text text="N. Addetti" /></Column>
          <Column><Text text="CGS score" /></Column>
          <Column><Text text="Fatturato tot." /></Column>
          <Column><Text text="Anno fatturato tot." /></Column>
          <Column><Text text="Protesti" /></Column>
          <Column><Text text="Pregiudizievoli" /></Column>
          <Column><Text text="Score Vendor Rating" /></Column>
        </columns>
        <items>
          <ColumnListItem>
            <cells>
              <Text text="{codiceAteco}" />
              <Text text="{rischioEmissioni}" />
              <Text text="{idSapFornitore}" />
              <Text text="{nomeFornitore}" />
              <Text text="{codiceFiscale}" />
              <Text text="{dataAttivazione}" />
              <Text text="{numAddetti}" />
              <Text text="{cgsScore}" />
              <Text text="{path:'fatturatoTot', formatter:'.formatter.euroText'}" />
              <Text text="{annoFatturatoTot}" />
              <Text text="{protesti}" />
              <Text text="{pregiudizievoli}" />
              <Text text="{scoreVendorRating}" />
            </cells>
          </ColumnListItem>
        </items>
        </Table>
      </VBox>
    </content>
  </Page>
</mvc:View>
```

- [ ] **Step 3: controller**

`app/contratti/webapp/controller/Report.controller.js`:

```js
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (Controller, Filter, FilterOperator) {
  "use strict";
  return Controller.extend("com.reply.contrattiattivi.app.controller.Report", {
    onInit: function () {},
    onNavBack: function () { this.getOwnerComponent().getRouter().navTo("main"); },
    onSearch: function (oEvent) {
      var sValue = oEvent.getParameter("query") || "";
      this._applyFilter(sValue);
    },
    onChange: function (oEvent) {
      this._applyFilter(oEvent.getSource().getValue());
    },
    onReset: function () {
      var oT = this.byId("rfSearch"); if (oT) oT.setValue("");
      this._applyFilter("");
    },
    _applyFilter: function (sValue) {
      var sTrim = (sValue || "").trim();
      var aFilters = [];
      if (sTrim) {
        aFilters.push(new Filter({
          filters: [
            new Filter({ path: "nomeFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false }),
            new Filter({ path: "idSapFornitore", operator: FilterOperator.Contains, value1: sTrim, caseSensitive: false })
          ],
          and: false
        }));
      }
      var oTable = this.byId("fornitoriTable");
      if (oTable) {
        var oBinding = oTable.getBinding("items");
        if (oBinding) oBinding.filter(aFilters);
      }
    }
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add app/contratti/webapp/manifest.json app/contratti/webapp/view/Report.view.xml app/contratti/webapp/controller/Report.controller.js
git commit -m "feat: pagina Report Fornitori con tabella OData"
```

---

## Task 6: Bottone Report Fornitori in home

**Files:**
- Modify: `app/contratti/webapp/view/Main.view.xml`
- Modify: `app/contratti/webapp/controller/Main.controller.js`

**Interfaces:**
- Produces: `onApriReport` handler.
- Consumes: route `report` (Task 5).

- [ ] **Step 1: Aggiungi bottone** dopo bottone Dashboard (riga 38)

```xml
<Button text="Report Fornitori" icon="sap-icon://measure" press="onApriReport" class="app-btn app-btn-neutral" />
```

- [ ] **Step 2: handler** in `Main.controller.js` (accanto a `onApriDashboard` riga 56)

```js
    onApriReport: function () {
      this.getOwnerComponent().getRouter().navTo("report");
    },
```

- [ ] **Step 3: Commit**

```bash
git add app/contratti/webapp/view/Main.view.xml app/contratti/webapp/controller/Main.controller.js
git commit -m "feat: bottone Report Fornitori in home"
```

---

## Task 7: Rimuovi tab Reportistica dashboard + nav dettaglio contratto

**Files:**
- Modify: `app/contratti/webapp/view/Dashboard.view.xml`
- Delete: `app/contratti/webapp/fragment/DashboardReportistica.fragment.xml`
- Modify: `app/contratti/WebApp/fragment/DashboardCockpit.fragment.xml`
- Modify: `app/contratti/webapp/controller/Dashboard.controller.js`

**Interfaces:**
- Consumes: route `detail` (esistente).
- Produces: `onApriContrattoDettaglio`.

- [ ] **Step 1: Rimuovi tab reportistica**

`Dashboard.view.xml` — remove lines 19-21 (the `IconTabFilter` block), leaving only `cockpit`.

- [ ] **Step 2: Delete fragment**

```bash
rm app/contratti/webapp/fragment/DashboardReportistica.fragment.xml
```

- [ ] **Step 3: Rendi cliccabile riga dettaglio contratti**

`DashboardCockpit.fragment.xml` — riga `<ColumnListItem>` (riga 63):

```xml
<ColumnListItem type="Navigation" press="onApriContrattoDettaglio">
```

- [ ] **Step 4: controller — rimuovi integrazione, aggiungi handler**

In `Dashboard.controller.js`:
- Rimuovi riga 24 `this.getView().setModel(new JSONModel([]), "integrazione");`
- Rimuovi riga 27 `this._loadIntegrazioneContratti();`
- Rimuovi `onFornitoreVendorMeshPress` (riga 72-75) e `onApriContrattoIntegrazione` (riga 77-81) e `_loadIntegrazioneContratti` (riga 87-108).
- Aggiungi:

```js
    onApriContrattoDettaglio: function (oEvent) {
      var sID = oEvent.getSource().getBindingContext().getProperty("ID");
      if (!sID) return;
      this.getOwnerComponent().getRouter().navTo("detail", { id: encodeURIComponent(sID) });
    },
```

Il binding della tabella è `/Contratto` (model default), quindi `getBindingContext()` ha path col `ID`.

- [ ] **Step 5: Commit**

```bash
git add -A app/contratti/webapp
git commit -m "feat(contratti UI5): rimuovi tab reportistica da dashboard, apri contratto da dettaglio"
```

---

## Task 8: Verifica finale

- [ ] **Step 1: Full backend suite**

```bash
npx jest --testTimeout=30000 --forceExit --runInBand
```
Expected: PASS, no regressions.

- [ ] **Step 2: Frontend manual**

Avvia `npm run dev` (server already uptick pid 34384), browser `http://localhost:4004/contratti/webapp/index.html`:
- Home → bottone "Report Fornitori" apre pagina con 13 colonne e ~4123 righe.
- Search "APP" filtra.
- Dashboard tab Cockpit → click riga "Dettaglio contratti" apre view Detail.

- [ ] **Step 3: Seed dev (lancio unico)**

```bash
npm run seed-fornitori
```
Expected: `Fornitori importati: 4123`
End — push branch + PR (se richiesto). Commits frequenti fatti nei task.

---

## Self-review notes

- Spec coverage: entità 13 campi → Task 2; CSV snapshot → Task 1; seeder idempotente → Task 3; OData filter → Task 4; pagina report + bottone → Task 5,6; rimozione tab + nav dettaglio → Task 7; `mockFornitori`/`mockCockpit` mantenuti → mai rimossi. OK.
- Placeholder check: codice completo in ogni step.
- Type consistency: `fatturatoTot`, `idSapFornitore`, `nomeFornitore` coerenti schema/view/seeder. `onApriContrattoIntegrazione` rimosso (tab Cockpit non lo usa).