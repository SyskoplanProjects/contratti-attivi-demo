# Dashboard Dati Reali + Fix FE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Basare la dashboard su dati reali dal DB (zero mock), top fornitori dai 377 reali, e sistemare il FE (titolo tabella troncato, card KPI).

**Architecture:** Il controller Dashboard legge `Contratto` e `Fornitore` via `oModel.read()`, li aggrega tramite un modulo puro `aggregateCockpit`, e popola due JSONModel (`cockpit`, `fornitori`). `dashboardUtils` resta (donut/trend), ma `buildTopFornitoriHtml` cambia firma a `{nome, valore}`. Mock ricevuto. Seed demo espanso a 15 contratti.

**Tech Stack:** SAPUI5, CAP OData v4, CSS, Node/jest.

## Global Constraints

- Fornitore campi reali: `nomeFornitore`, `fatturatoTot` (Decimal), `numAddetti` (Integer). `contrattiAttivi`/`contrattiPassivi`/`importoAttiviEuro`/`importoPassiviEuro` NON esistono.
- Contratto campi reali: `intestatario`, `importo` (Decimal), `stato`, `dataStipula`, `dataScadenza`, `categoria`, `esitoVerifica`.
- Stato: enum `BOZZA|IN_REVISIONE|APPROVATO|FIRMATO|ARCHIVIATO`.
- `esitoVerifica`: enum `ok|non_conforme|in_corso`.
- `categoria`: enum `fornitura|servizio|consulenza|NDA|altro`.
- Seed demo idempotente per intestatario (`trovaContrattoPerIntestatario` in `seed-demo.js`).
- Test jest corrono con `npm test` (`--runInBand` nelle suite isolate).

---

### Task 1: Modulo aggregazione cockpit testabile

**Files:**
- Create: `app/contratti/webapp/model/aggregateCockpit.js`
- Test: `test/aggregate-cockpit.test.js`

**Interfaces:**
- Produces: `aggregateCockpit({ contratti, fornitori })` → `{ totaleContratti, importoTotaleAnno, donutTipologia, donutSurvey, trend, topFornitori }`

- [ ] **Step 1: Write failing test**

```javascript
const aggregateCockpit = require('../app/contratti/webapp/model/aggregateCockpit');

describe('aggregateCockpit', () => {
  const contratti = [
    { stato: 'BOZZA', categoria: 'fornitura', esitoVerifica: 'in_corso', dataStipula: '2026-01-15', dataScadenza: '2026-06-15', importo: 100000 },
    { stato: 'IN_REVISIONE', categoria: 'fornitura', esitoVerifica: 'ok', dataStipula: '2026-02-10', dataScadenza: '2026-08-10', importo: 200000 },
    { stato: 'APPROVATO', categoria: 'NDA', esitoVerifica: 'non_conforme', dataStipula: '2026-03-20', dataScadenza: '2027-03-20', importo: 500000 },
    { stato: 'ARCHIVIATO', categoria: 'servizio', esitoVerifica: null, dataStipula: '2025-01-01', dataScadenza: '2025-12-31', importo: 999999 }
  ];
  const fornitori = [
    { nomeFornitore: 'STEP SPA', fatturatoTot: 47545, numAddetti: 158 },
    { nomeFornitore: 'HSPI SPA', fatturatoTot: 900000, numAddetti: 80 }
  ];

  test('excludes ARCHIVIATO from totals', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.totaleContratti).toBe(3);
    expect(r.importoTotaleAnno).toBe(800000);
  });

  test('donut tipologia groups by categoria with correct counts', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    const fornitura = r.donutTipologia.find(s => s.label === 'fornitura');
    expect(fornitura.value).toBe(2);
  });

  test('donut survey maps esitoVerifica to labels (excludes ARCHIVIATO)', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.donutSurvey.every(s => s.value > 0)).toBe(true);
    expect(r.donutSurvey.map(s => s.value).reduce((a, b) => a + b, 0)).toBe(3);
  });

  test('trend has 12 months', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.trend.length).toBe(12);
  });

  test('topFornitori sorted desc by fatturato, capped at 8', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.topFornitori[0].nome).toBe('HSPI SPA');
    expect(r.topFornitori[0].value).toBe(900000);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx jest test/aggregate-cockpit.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement module**

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
}(this, function () {
  "use strict";

  var DEFAULT_COLORS = ["#0a6ed1", "#e9730c", "#107e3e", "#bb0000", "#6a6d70"];
  var MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  var SURVEY_META = {
    ok: { label: "Completata", color: "#107e3e" },
    non_conforme: { label: "Non conforme", color: "#bb0000" },
    in_corso: { label: "In corso", color: "#0a6ed1" }
  };

  function countBy(lista, keyFn) {
    var m = {};
    lista.forEach(function (v) {
      var k = keyFn(v);
      if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function buildTipologia(contratti) {
    var counts = countBy(contratti, function (c) { return c.categoria; });
    return Object.keys(counts).map(function (k, i) {
      return { label: k, value: counts[k], color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
    });
  }

  function buildSurvey(contratti) {
    var counts = countBy(contratti, function (c) { return c.esitoVerifica || 'in_corso'; });
    return Object.keys(counts).map(function (k) {
      var meta = SURVEY_META[k] || { label: k, color: DEFAULT_COLORS[4] };
      return { label: meta.label, value: counts[k], color: meta.color };
    });
  }

  function buildTrend(contratti) {
    var mesi = [];
    for (var m = 0; m < 12; m++) mesi.push({ mese: MESI[m], attivati: 0, scadenza: 0 });
    contratti.forEach(function (c) {
      if (c.dataStipula) mesi[new Date(c.dataStipula).getMonth()].attivati++;
      if (c.dataScadenza) mesi[new Date(c.dataScadenza).getMonth()].scadenza++;
    });
    return mesi;
  }

  function buildTopFornitori(fornitori) {
    return fornitori
      .filter(function (f) { return f.fatturatoTot != null; })
      .map(function (f) { return { nome: f.nomeFornitore, value: f.fatturatoTot }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
  }

  function aggregateCockpit(input) {
    var contratti = (input.contratti || []).filter(function (c) { return c.stato !== 'ARCHIVIATO'; });
    var fornitori = input.fornitori || [];
    return {
      totaleContratti: contratti.length,
      importoTotaleAnno: contratti.reduce(function (n, c) { return n + (c.importo || 0); }, 0),
      donutTipologia: buildTipologia(contratti),
      donutSurvey: buildSurvey(contratti),
      trend: buildTrend(contratti),
      topFornitori: buildTopFornitori(fornitori)
    };
  }

  return {
    aggregateCockpit: aggregateCockpit,
    buildTipologia: buildTipologia,
    buildSurvey: buildSurvey,
    buildTrend: buildTrend,
    buildTopFornitori: buildTopFornitori,
    countBy: countBy
  };
}));
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest test/aggregate-cockpit.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/contratti/webapp/model/aggregateCockpit.js test/aggregate-cockpit.test.js
git commit -m "feat: aggregator cockpit da contratti reali"
```

---

### Task 2: Adattare buildTopCapitoliHtml a Fornitore

**Files:**
- Modify: `app/contratti/webapp/model/dashboardUtils.js:80-104`
- Test: `test/dashboard-mock.test.js:75-107`

**Interfaces:**
- Consumes: `aggregateCockpit.topFornitori` → array `{ nome, value }`
- Produces: `buildTopFornitoriHtml(aTop, sMetric)` con nuova firma `{ nome, value }`

- [ ] **Step 1: Rewrite test block** (sostituisci describe `buildTopCapitoliHtml`, linee 75-107)

```js
describe('dashboardUtils.buildTopFornitoriHtml', () => {
  const aTop = [
    { nome: 'A', value: 100000 },
    { nome: 'B', value: 900000 },
    { nome: 'C', value: 120000 },
    { nome: 'D', value: 5000 }
  ];

  test('sorts desc by value and renders top name first', () => {
    const sHtml = dashboardUtils.buildTopFornitoriHtml(aTop, 'fatturato');
    const iB = sHtml.indexOf('>B<');
    const iA = sHtml.indexOf('>A<');
    expect(iB).toBeGreaterThan(-1);
    expect(iB).toBeLessThan(iA);
    expect(sHtml).toContain('€ 900k');
  });

  test('caps rendered rows at 8', () => {
    const aMany = Array.from({ length: 12 }, (_, i) => ({ nome: 'F' + i, value: (12 - i) * 1000 }));
    const sHtml = dashboardUtils.buildTopCapitoliHtml(aMany, 'value');
    const aRows = sHtml.match(/app-topf-row/g) || [];
    expect(aRows.length).toBe(8);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest test/dashboard-mock.test.js -t "buildTopFornitoriHtml"`
Expected: FAIL

- [ ] **Step 3: Implement new signature** (sostituisce funzione alle linee 80-104)

```js
  function buildTopFornitoriHtml(aTop, sMetric) {
    var aRows = (aTop || []).slice().sort(function (x, y) { return (y.value || 0) - (x.value || 0); }).slice(0, 8);
    var fMax = aRows.reduce(function (n, r) { return Math.max(n, r.value || 0); }, 1);
    var sRows = aRows.map(function (r) {
      var fW = Math.round((r.value || 0) / fMax * 100);
      var sText = r.value != null ? '€ ' + Math.round(r.value / 1000) + 'k' : '';
      return '<div class="app-topf-row">' +
        '<span class="app-topf-name">' + escapeHtml(r.nome) + '</span>' +
        '<div class="app-topf-bars">' +
        '<div class="app-topf-bar app-topf-bar-fatturato" style="width:' + fW + '%"><span>' + sText + '</span></div>' +
        '</div>' +
        '</div>';
    }).join('');
    return '<div class="app-topf-chart">' + sRows + '</div>';
  }
```

- [ ] **Step 4: Run, verify pass**

Run: `npx jest test/dashboard-mock.test.js -t "buildTopFornitoriHtml"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/contratti/webapp/model/dashboardUtils.js test/dashboard-mock.test.js
git commit -m "fix: buildTopFornitoriHtml per Fornitore fatturato"
```

---

### Task 3: Eliminare mock e aggiornare test dashboard-mock

**Files:**
- Modify: `test/dashboard-mock.test.js` (rimuovi righe 109-148)
- Modify: `app/contratti/webapp/controller/Dashboard.controller.js` (rimuovi import mock)
- Delete: `app/contratti/webapp/model/mockCockpit.js`, `app/contratti/webapp/model/mockFornitori.js`

- [ ] **Step 1: Remove mock describe blocks** — cancella righe 109-148 (i due describe `mockCockpit` e `mockFornitori` e i `require` alle righe 109-110) da `test/dashboard-mock.test.js`

- [ ] **Step 2: Run existing dashboard-mock tests**

Run: `npx jest test/dashboard-mock.test.js`
Expected: PASS (solo matchFornitore/donut/trend/top)

- [ ] **Step 3: Delete mock files + update controller imports in Task 4** (controller senza `mockCockpit`/`mockFornitori` in require). Rimuovi da `Dashboard.controller.js:9` i `"../model/mockCockpit"` e `"../model/mockFornitori"`.

- [ ] **Step 4: Commit**

```bash
git rm app/contratti/webapp/model/mockCockpit.js app/contratti/webapp/model/mockFornitori.js
git add test/dashboard-mock.test.js app/contratti/webapp/controller/Dashboard.controller.js
git commit -m "refactor: rimuovi mock dashboard"
```

---

### Task 4: Controller Dashboard legge dati reali

**Files:**
- Modify: `app/contatti/webapp/controller/Dashboard.controller.js`

**Interfaces:**
- Consumes: `aggregateCockpit` (Task 1), `dashboardUtils` (Task 2)
- Produces: JSONModel `cockpit` con path: `totaleContrattiAnno`, `importoTotaleAnno`, `donutTipologiaHtml`, `donutSurveyHtml`, `trendHtml`, `topFornitoriHtml`; model `fornitori` non più usato.

- [ ] **Step 1: Rewrite onInit and add _caricaDati**

```js
onInit: function () {
  this.getView().setModel(new JSONModel({ fornitoreAttivo: null }), "filtro");
  this._caricaDati();
  this.getOwnerComponent().getRouter().getRoute("dashboard").attachPatternMatched(this._onRouteMatched, this);
},

_caricaDati: function () {
  var that = this;
  var oModel = this.getView().getModel();
  if (!oModel) {
    this.getView().setModel(new JSONModel({ totaleContrattiAnno: 0, importoTotaleAnno: 0 }), "cockpit");
    return;
  }
  Promise.all([
    oModel.read("/Contratto", { filters: [{ path: "stato", operator: "NE", value1: "ARCHIVIATO" }] }),
    oModel.read("/Fornitore", {})
  ]).then(function (results) {
    var contratti = results[0].results || [];
    var fornitori = results[1].results || [];
    var ui = aggregateCockpit({ contratti: contratti, fornitori: fornitori });
    that.getView().setModel(new JSONModel({
      totaleContrattiAnno: ui.totaleContratti,
      importoTotaleAnno: ui.importoTotaleAnno,
      donutTipologiaHtml: dashboardUtils.buildDonutHtml(ui.donutTipologia),
      donutSurveyHtml: dashboardUtils.buildDonutHtml(ui.donutSurvey),
      trendHtml: dashboardUtils.buildTrendHtml(ui.trend),
      topFornitoriHtml: dashboardUtils.buildTopFornitoriHtml(ui.topFornitori, "fatturato")
    }), "cockpit");
  }, function (err) {
    console.error("Dashboard load error", err);
  });
}
```

- [ ] **Step 2: Ensure _onRouteMatched table binding now on coffee/filters; guard quando model cockpit ancora engagement** — mantieni `_applyFiltroFornitore` invariata; `dettaglioContrattiTable` binding resta `/Contratto`. Nessun change oltre onInit.

- [ ] **Step 3: Commit**

```bash
git add app/contratti/webapp/controller/Dashboard.controller.js
git commit -m "feat: dashboard carica dati reali da OData"
```

---

### Task 5: FE fix — titolo tabella non troncato + card KPI

**Files:**
- Modify: `app/contratti/webapp/fragment/DashboardCockpit.fragment.xml:48-49`
- Modify: `app/contratti/webapp/css/style.css:376-388`

- [ ] **Step 1: Move Title outside table-wrap** — nel fragment, il `VBox class="app-table-wrap"` contiene `Title` + `Table`. Sposta il `Title level="H2"` in un VBox separato prima, VBox wrap contiene solo la `Table`.

```xml
<VBox class="sapUiTinyMarginBottom">
  <Title text="Dettaglio contratti" level="H2" />
</VBox>
<VBox class="app-table-wrap">
  <Table id="dettaglioContrattiTable" growing="true" growingThreshold="50"
    items="{path: '/Contratto', filters: [{path: 'stato', operator: 'NE', value1: 'ARCHIVIATO'}]}">
  <!-- … colonne e items invariate … -->
  </Table>
</VBox>
```

- [ ] **Step 2: Polish KPI** in `style.css` (aggiorna `.app-dash-kpi-card`, `.app-dash-kpi-value`, `.app-dash-kpi-label`)

```css
.app-dash-kpi-card {
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 1.25rem 1.5rem;
}
.app-dash-kpi-value { font-size: 2rem; font-weight: 700; color: #0a6ede; letter-spacing: -.01em; }
.app-dash-kpi-label { color: #6a6d70; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
```

- [ ] **Step 3: Commit**

```bash
git add app/contratti/webapp/fragment/DashboardCockpit.fragment.xml app/contratti/webapp/css/style.css
git commit -m "fix: dashboard FE titolo tabella + card KPI"
```

---

### Task 6: Seed demo ~15 contratti

**Files:**
- Modify: `srv/lib/demo-data.js`
- Test: `test/seed-demo.test.js` (new)

**Interfaces:**
- Consumes: `CONTRATTI` entries shape `{ intestatario, importo, codiceFiscale, dataStipula, dataScadenza, categoria, esitoVerifica, statoFinale }`
- Produces: >=15 entries; `categoria` in `fornitura|servizio|NDA|altro`; `esitoVerifica` in `ok|non_conforme|in_corso`; `statoFinale` in `BOZZA|IN_REVISIONE|APPROVATO`

- [ ] **Step 1: Write failing test**

```js
const { TEMPLATE, CONTRATTI } = require('../srv/lib/demo-data');
describe('demo-data', () => {
  test('has at least 15 contratti', () => { expect(CONTRATTI.length).toBeGreaterThanOrEqual(15); });
  test('each contratto has valid fields', () => {
    const stati = ['BOZZA','IN_REVISIONE','APPROVATO','FIRMATO'];
    const cat = ['fornitura','servizio','consulenza','NDA','altro'];
    const esiti = ['ok','non_conforme','in_corso'];
    CONTRATTI.forEach(c => {
      expect(c.intestatario).toBeTruthy();
      expect(c.importo).toBeGreaterThan(0);
      expect(c.dataStipula).toBeTruthy();
      expect(stati).toContain(c.statoFinale);
      expect(cat).toContain(c.categoria || 'fornitura');
      if (c.esitoVerifica) expect(esi).toContain(c.esitoVerifica);
    });
  });
  test('declares dataScadenza when dataStipula present', () => {
    expect(CONTRATTI.every(c => !c.dataStipula || c.dataScadenza)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest test/seed-demo.test.js`
Expected: FAIL (len < 15)

- [ ] **Step 3: Expand CONTRATTI in `srv/lib/demo-data.js`** to 15 entries. Add `categoria`, `dataScadenza` (+ 12m), `esitoVerifica`. Keep `intestatario` gathered from common contract vevs (reuse existing three: Banca Alpha, CloudTech, Data Center Nord) + new realistic names (e.g. STEP SPA, HSPI SPA, più altri). Ensure `statoFinale` varied.

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest test/seed-demo.test.js`

- [ ] **Step 5: Run seed-demo idempotency** (server up)

Run: `node srv/lib/seed-demo.js` twice; expect second run skips already-inserted intestatari.

- [ ] **Step 6: Commit**

```bash
git add srv/lib/demo-data.js test/seed-demo.test.js
git commit -m "feat: seed demo ~15 contratti"
```

---

### Task 7: Suite completa + integrazione

- [ ] **Step 1: Run full suite**

Run: `npm test`
Expected: nell'en 328+ tests; nessuna regressione su cockpit/fornitori/seed.

- [ ] **Step 2: Seed dati reali + demo**

```bash
npm run seed-fornitori
node srv/lib/seed-demo.js
```

- [ ] **Step 3: Verify OData**

```bash
curl -u "mario.rossi@contrattiattivi.it:test" http://localhost:4004/contratti/Fornitore?$top=1
curl -u "mario.rossi@contrattiattivi.it:test" "http://localhost:4004/contratti/Contratto?$filter=stato ne 'ARCHIVIATO'"
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: integrazione dashboard real"
git push
```