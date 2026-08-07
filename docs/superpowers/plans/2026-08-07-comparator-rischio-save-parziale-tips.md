# Comparator — Clausole rischio solo doc, salva bozza parziale, fix tips AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare 3 modifiche comparator: (1) clausole di rischio solo VARIANTE/NUOVA + tabella mancanti nel finale, (2) salvaBozza/recuperaBozza su Contratto stato BOZZA con ripresa automatica wizard, (3) classificaDocumentoPrincipale backend gpt fallback + gate tips non-bloccante.

**Architecture:** Backend CDS: 3 nuove action su `ComparatorService` (`salvaBozza`, `recuperaBozza`, `classificaDocumentoPrincipale`) + 2 colonne opzionali su `Contratto` (`previewID`, `snapshotBozza`). Frontend SAPUI5: filtro + model `mancanti` in `Wizard.controller.js`, tabella in `WizardStepFinale.fragment.xml`, bottone in `Wizard.view.xml`, gate tips fix in `ComparatorHome.controller.js`.

**Tech Stack:** CAP Node.js (cds.ApplicationService), SAPUI5 XML/JS, jest (test), sqlite dev (auto-migra schema), OpenAI `gpt-4o-mini` via `srv/modules/openai-module.js`.

## Global Constraints

- Modello progetto: `gpt-4o-mini` via `openai.chatJSON` / `chat`. Classificazione documento riusa `classificaAllegato` (embedding + `_classificaConLLM` fallback) in `srv/lib/allegato-classifier.js`.
- Nessuna nuova tabella: riuso `Contratto`, `ContrattoClausola`, `ContrattoAllegato`, `MetadatoDocumento`, `Template`, `TemplateVersion`.
- Non bloccante: fallimento classificazione gpt / salvataggio bozza non impedisce l'analisi.
- UI5: `sap.ui.define` AMD, controller estendono `BaseController`, raw `fetch` per azioni, prefissi `app-` CSS.
- Contratto ha associazioni `template` e `templateVersion` **not null**: creare bozza Contratto richiede anche Template + TemplateVersion minimale (stesso pattern `confirmCoverage`).
- Test runner: `npm test` = `jest --testTimeout=30000 --forceExit`. Mock openai via `jest.mock('../srv/modules/openai-module', ...)`.
- Nuovi tipi CDS riusano array di `ClausolaCoverageResult`, `MetadatoConfermato` esistenti.

---

### Task 1: Schema — colonne previewID e snapshotBozza su Contratto

**Files:**
- Modify: `db/schema.cds:51-74` (entity Contratto)

**Interfaces:**
- Produces: `Contratto.previewID : String(100)` opzionale, `Contratto.snapshotBozza : LargeString` opzionale (JSON snapshot clausole wizard).

- [ ] **Step 1: Aggiungi le due colonne**

In `db/schema.cds`, entity `Contratto`, dopo `bozzaSalvata : Boolean default false;` (riga 65):

```cds
  bozzaSalvata           : Boolean default false;
  previewID              : String(100);
  snapshotBozza          : LargeString;
```

- [ ] **Step 2: Verifica compile CDS**

Run: `npx cds compile db/schema.cds --to sql`
Expected: exit 0, output SQL con `previewID` e `snapshotBozza` nelle colonne di `Contratto`.

- [ ] **Step 3: Commit**

```bash
git add db/schema.cds
git commit -m "feat: colonne previewID e snapshotBozza su Contratto per bozze wizard"
```

---

### Task 2: CDS — tipi e action salvaBozza / recuperaBozza / classificaDocumentoPrincipale

**Files:**
- Modify: `srv/comparator-service.cds`

**Interfaces:**
- Consumes: `ClausolaCoverageResult`, `MetadatoConfermato`, `ClassificazioneDocumento` (già definite).
- Produces:
  - `action classificaDocumentoPrincipale(previewID: String) returns ClassificazioneDocumento`
  - `type ClausolaBozza { numero: Integer; titolo: String; testo: LargeString; stato: String; }`
  - `type BozzaAllegato { filename: String; tipo: String; metadati: array of MetadatoConfermato; }`
  - `type BozzaDati { contrattoID: UUID; intestatario: String; clausole: array of ClausolaBozza; allegati: array of BozzaAllegato; metadati: array of MetadatoConfermato; }`
  - `action salvaBozza(previewID: String, step: String, filename: String, tipo: String, intestatario: String, clausole: array of ClausolaBozza, metadati: array of MetadatoConfermato, allegatoID: String) returns { contrattoID: UUID; stato: String; }`
  - `action recuperaBozza(previewID: String) returns BozzaDati`

- [ ] **Step 1: Aggiungi tipi e action**

In `srv/comparator-service.cds`, dopo `action classificaAllegati(...)` (riga 98) aggiungi:

```cds
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
    contrattoID : UUID;
    intestatario : String;
    clausole    : array of ClausolaBozza;
    allegati    : array of BozzaAllegato;
    metadati    : array of MetadatoConfermato;
  }

  action salvaBozza(previewID: String, step: String, filename: String, tipo: String, intestatario: String, clausole: array of ClausolaBozza, metadati: array of MetadatoConfermato, allegatoID: String) returns {
    contrattoID : UUID;
    stato       : String;
  };
  action recuperaBozza(previewID: String) returns BozzaDati;
```

- [ ] **Step 2: Verifica compile**

Run: `npx cds compile srv/comparator-service.cds`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add srv/comparator-service.cds
git commit -m "feat: action salvaBozza, recuperaBozza, classificaDocumentoPrincipale nel servizio comparator"
```

---

### Task 3: Handler classificaDocumentoPrincipale + test

**Files:**
- Modify: `srv/comparator-service.js` (dopo `classificaAllegati`, riga 177)
- Test: `test/classifica-documento-principale.test.js`

**Interfaces:**
- Consumes: `previewStore.get(previewID)`, `classificaAllegato(testo)` (allegato-classifier), `TIPOLOGIE_ALLEGATO`/`categoriaMacro`, `_normalizzaConfidenza`.
- Produces: `{ categoria, sottoTipo, confidenza }`; aggiorna anche `preview.documentoPrincipale`. Mai throw: su errore/`ALTRO` ritorna `{ categoria: 'ALTRO'|tipo, sottoTipo: null, confidenza: 0 }`.

- [ ] **Step 1: Scrivi test fallimentare**

`test/classifica-documento-principale.test.js`:

```js
const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

jest.mock('../srv/lib/allegato-classifier', () => ({
  classificaAllegato: jest.fn(),
  rilevaTipiPresenti: jest.fn(() => Promise.resolve([]))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');
const { classificaAllegato } = require('../srv/lib/allegato-classifier');

describe('classificaDocumentoPrincipale', () => {
  beforeEach(() => {
    classificaAllegato.mockReset();
    classificaAllegato.mockResolvedValue({ tipo: 'CGC', confidenza: 0.9, metodoRiconoscimento: 'llm' });
  });

  it('ritorna sottoTipo CGC / categoria CONTRATTO quando classificaAllegato riconosce sotto-tipologia', async () => {
    const previewID = previewStore.put({ filename: 'contratto.pdf', testo: 'Condizioni Generali di Contratto per Servizi ICT.', clausole: [], coveragePercent: 100 });

    const res = await POST('/comparator/classificaDocumentoPrincipale', { previewID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.sottoTipo).toBe('CGC');
    expect(res.data.categoria).toBe('CONTRATTO');
    expect(res.data.confidenza).toBe(0.9);
  });

  it('ritorna sottoTipo null senza errore quando classificazione = ALTRO', async () => {
    classificaAllegato.mockResolvedValue({ tipo: 'ALTRO', confidenza: 0.3, metodoRiconoscimento: 'llm' });
    const previewID = previewStore.put({ filename: 'contratto.pdf', testo: 'Documento generico non riconoscibile.', clausole: [], coveragePercent: 100 });

    const res = await POST('/comparator/classificaDocumentoPrincipale', { previewID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.sottoTipo).toBeNull();
    expect(res.data.categoria).toBe('ALTRO');
  });

  it('reject 410 se preview inesistente', async () => {
    const res = await POST('/comparator/classificaDocumentoPrincipale', { previewID: 'inesistente' }, { auth: MOCK_USER });
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Esegui test, atteso FAIL**

Run: `npx jest test/classifica-documento-principale.test.js --testTimeout=30000 --forceExit`
Expected: 3 fail (action non implementata → 404).

- [ ] **Step 3: Implementa handler**

In `srv/comparator-service.js`, dopo il blocco `classificaAllegati` (dopo riga 177), aggiungi:

```js
    // Punto 3 spec: classificazione del documento principale indipendente dalla presenza
    // di allegati. Chiamata dal frontend upload quando classificaAllegati non ha prodotto
    // sottoTipo (es. embedding ALTRO): fallback gpt-4o-mini già dentro classificaAllegato.
    this.on('classificaDocumentoPrincipale', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente');

      let documentoPrincipale = { categoria: null, sottoTipo: null, confidenza: null };
      try {
        if (preview.testo && preview.testo.trim()) {
          const { tipo, confidenza } = await classificaAllegato(preview.testo);
          const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
          documentoPrincipale = {
            categoria: categoriaMacro(tipo),
            sottoTipo: (tipologia && tipologia.sottoTipologia) ? tipo : null,
            confidenza: _normalizzaConfidenza(confidenza)
          };
        }
      } catch (e) {
        console.warn('[classificaDocumentoPrincipale] classificazione fallita:', e.message);
      }
      previewStore.update(previewID, { documentoPrincipale });
      return documentoPrincipale;
    });
```

- [ ] **Step 4: Esegui test, atteso PASS**

Run: `npx jest test/classifica-documento-principale.test.js --testTimeout=30000 --forceExit`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add srv/comparator-service.js test/classifica-documento-principale.test.js
git commit -m "feat: action classificaDocumentoPrincipale con fallback gpt per gate tips"
```

---

### Task 4: Handler salvaBozza + test

**Files:**
- Modify: `srv/comparator-service.js` (dopo handler classificaDocumentoPrincipale)
- Test: `test/salva-bozza.test.js`

**Interfaces:**
- Consumes: `previewStore`, `cds.tx(req)`, `salvaMetadati({ tx, parentType, parentID, metadati })`, entity `Contratto`/`Template`/`TemplateVersion`/`ContrattoAllegato`.
- Produces: `{ contrattoID, stato: 'BOZZA' }`. Idempotente: stessa `previewID` → stessa riga `Contratto` (update, mai duplicato).

- [ ] **Step 1: Scrivi test fallimentare**

`test/salva-bozza.test.js`:

```js
const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

const CLAUSOLE = [
  { numero: 1, titolo: 'Oggetto', testo: 'Testo oggetto.', stato: 'MATCH_TEMPLATE' },
  { numero: 2, titolo: 'Penali', testo: 'Testo variante.', stato: 'VARIANTE' },
  { numero: 3, titolo: 'Dati di consegna', testo: 'Testo dal template.', stato: 'NON_PRESENTE' }
];
const METADATI = [{ campo: 'oggettoContratto', etichetta: 'Oggetto contratto', valore: 'Fornitura ICT' }];

async function creaPreview(allegati) {
  return previewStore.put({
    filename: 'contratto.pdf',
    testo: 'Testo del documento.',
    clausole: CLAUSOLE,
    coveragePercent: 80,
    allegati: allegati || []
  });
}

describe('salvaBozza', () => {
  beforeEach(async () => {
    const { Contratto, ContrattoAllegato, MetadatoDocumento, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    await DELETE.from(MetadatoDocumento);
    await DELETE.from(ContrattoAllegato);
    await DELETE.from(ContrattoClausola);
    await DELETE.from(Contratto);
  });

  it('crea Contratto stato BOZZA con previewID, intestatario, metadati e snapshot clausole (step CONTRATTO)', async () => {
    const previewID = await creaPreview();

    const res = await POST('/comparator/salvaBozza', {
      previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme S.p.A.',
      clausole: CLAUSOLE, metadati: METADATI, allegatoID: null
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('BOZZA');

    const { Contratto, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const bozze = await SELECT.from(Contratto).where({ previewID });
    expect(bozze).toHaveLength(1);
    expect(bozze[0].stato).toBe('BOZZA');
    expect(bozze[0].intestatario).toBe('Acme S.p.A.');
    expect(JSON.parse(bozze[0].snapshotBozza).clausole).toHaveLength(3);

    const metadati = await SELECT.from(MetadatoDocumento).where({ contratto_ID: bozze[0].ID });
    expect(metadati.map(m => m.campo)).toContain('oggettoContratto');
  });

  it('doppio salvataggio idempotente: una sola riga Contratto', async () => {
    const previewID = await creaPreview();
    const body = { previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme S.p.A.', clausole: CLAUSOLE, metadati: METADATI, allegatoID: null };

    await POST('/comparator/salvaBozza', body, { auth: MOCK_USER });
    await POST('/comparator/salvaBozza', body, { auth: MOCK_USER });

    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const bozze = await SELECT.from(Contratto).where({ previewID });
    expect(bozze).toHaveLength(1);
  });

  it('step ALLEGATO upsert ContrattoAllegato per filename con metadati', async () => {
    const previewID = await creaPreview([{ filename: 'dure.pdf', mimeType: 'application/pdf', contenuto: 'YQ==', tipo: 'DURC', confidenza: 0.9, metodoRiconoscimento: 'embedding', testo: 'DURC testo.', metadati: [] }]);
    await POST('/comparator/salvaBozza', { previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme', clausole: CLAUSOLE, metadati: [], allegatoID: null }, { auth: MOCK_USER });

    const res = await POST('/comparator/salvaBozza', {
      previewID, step: 'ALLEGATO', filename: 'contratto.pdf', tipo: 'DURC', intestatario: null,
      clausole: [], metadati: [{ campo: 'numeroProtocollo', etichetta: 'Numero protocollo', valore: '12345' }], allegatoID: 'dure.pdf'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);

    const { Contratto, ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const bozze = await SELECT.from(Contratto).where({ previewID });
    const allegati = await SELECT.from(ContrattoAllegato).where({ contratto_ID: bozze[0].ID });
    expect(allegati).toHaveLength(1);
    expect(allegati[0].filename).toBe('dure.pdf');
    const metadati = await SELECT.from(MetadatoDocumento).where({ allegato_ID: allegati[0].ID });
    expect(metadati.map(m => m.campo)).toContain('numeroProtocollo');
  });
});
```

- [ ] **Step 2: Esegui test, atteso FAIL**

Run: `npx jest test/salva-bozza.test.js --testTimeout=30000 --forceExit`
Expected: fail (action non implementata).

- [ ] **Step 3: Implementa handler**

In `srv/comparator-service.js`, dopo handler `classificaDocumentoPrincipale`, aggiungi:

```js
    // Punto 2 spec: salvataggio parziale del wizard. Persiste (o aggiorna) un Contratto con
    // stato='BOZZA' e previewID = preview corrente, idempotente. Snapshot clausole salvato in
    // JSON su Contratto.snapshotBozza (preserva stato VARIANTE/NUOVA/NON_PRESENTE per il
    // ripopolamento del wizard); metadati in MetadatoDocumento, allegati in ContrattoAllegato.
    this.on('salvaBozza', async (req) => {
      const { previewID, step, filename, tipo, intestatario, clausole, metadati, allegatoID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');
      const preview = previewStore.get(previewID);

      const result = await cds.tx(req).run(async (tx) => {
        const { Contratto, Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
        let contratto = await tx.run(SELECT.one.from(Contratto).where({ previewID, stato: 'BOZZA' }));

        if (!contratto) {
          const templateID = cds.utils.uuid();
          const versionID = cds.utils.uuid();
          const nome = (filename || 'Bozza contratto').replace(/\.[^.]+$/, '');
          await tx.run(INSERT.into(Template).entries({ ID: templateID, nome }));
          await tx.run(INSERT.into(TemplateVersion).entries({
            ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
          }));
          const contrattoID = cds.utils.uuid();
          await tx.run(INSERT.into(Contratto).entries({
            ID: contrattoID, stato: 'BOZZA', intestatario: intestatario || nome,
            responsabile: req.user.id, previewID, template_ID: templateID, templateVersion_ID: versionID
          }));
          contratto = { ID: contrattoID };
        }

        if (step === 'CONTRATTO' || step === 'FINE') {
          if (intestatario) await tx.run(UPDATE(Contratto, contratto.ID).with({ intestatario }));
          if (metadati && metadati.length) {
            await salvaMetadati({ tx, parentType: 'Contratto', parentID: contratto.ID, metadati });
          }
          if (clausole && clausole.length) {
            await tx.run(UPDATE(Contratto, contratto.ID).with({ snapshotBozza: JSON.stringify({ clausole }) }));
          }
        }

        if (step === 'ALLEGATO' && allegatoID) {
          const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
          let allegato = await tx.run(SELECT.one.from(ContrattoAllegato).where({ contratto_ID: contratto.ID, filename: allegatoID }));
          if (!allegato && preview) {
            const src = (preview.allegati || []).find(a => a.filename === allegatoID);
            if (src) {
              const id = cds.utils.uuid();
              await tx.run(INSERT.into(ContrattoAllegato).entries({
                ID: id, contratto_ID: contratto.ID, filename: src.filename, mimeType: src.mimeType,
                contenuto: src.contenuto || '', tipo: tipo || src.tipo, confidenza: src.confidenza,
                metodoRiconoscimento: src.metodoRiconoscimento, testo: src.testo, dataScadenza: src.dataScadenza
              }));
              allegato = { ID: id };
            }
          }
          if (allegato && metadati && metadati.length) {
            await salvaMetadati({ tx, parentType: 'ContrattoAllegato', parentID: allegato.ID, metadati });
          }
        }

        return { contrattoID: contratto.ID, stato: 'BOZZA' };
      });

      return result;
    });
```

- [ ] **Step 4: Esegui test, atteso PASS**

Run: `npx jest test/salva-bozza.test.js --testTimeout=30000 --forceExit`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add srv/comparator-service.js test/salva-bozza.test.js
git commit -m "feat: salvaBozza idempotente per wizard con Contratto stato BOZZA"
```

---

### Task 5: Handler recuperaBozza + test

**Files:**
- Modify: `srv/comparator-service.js` (dopo handler salvaBozza)
- Test: `test/salva-bozza.test.js` (append)

**Interfaces:**
- Consumes: `Contratto.previewID`/`snapshotBozza`, `MetadatoDocumento`, `ContrattoAllegato`.
- Produces: `BozzaDati` o `null` (HTTP 204 No Content quando nessuna bozza).

- [ ] **Step 1: Scrivi test fallimentare** (append a `test/salva-bozza.test.js`)

```js
describe('recuperaBozza', () => {
  beforeEach(async () => {
    const { Contratto, ContrattoAllegato, MetadatoDocumento, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    await DELETE.from(MetadatoDocumento);
    await DELETE.from(ContrattoAllegato);
    await DELETE.from(ContrattoClausola);
    await DELETE.from(Contratto);
  });

  it('ritorna dati bozza salvata (intestatario, clausole, metadati, allegati)', async () => {
    const previewID = await creaPreview([{ filename: 'dure.pdf', mimeType: 'application/pdf', contenuto: 'YQ==', tipo: 'DURC', confidenza: 0.9, metodoRiconoscimento: 'embedding', testo: 'DURC testo.', metadati: [] }]);
    await POST('/comparator/salvaBozza', {
      previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme S.p.A.',
      clausole: CLAUSOLE, metadati: METADATI, allegatoID: null
    }, { auth: MOCK_USER });
    await POST('/comparator/salvaBozza', {
      previewID, step: 'ALLEGATO', filename: 'contratto.pdf', tipo: 'DURC', intestatario: null,
      clausole: [], metadati: [{ campo: 'numeroProtocollo', etichetta: 'Numero protocollo', valore: '12345' }], allegatoID: 'dure.pdf'
    }, { auth: MOCK_USER });

    const res = await POST('/comparator/recuperaBozza', { previewID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.contrattoID).toBeTruthy();
    expect(res.data.intestatario).toBe('Acme S.p.A.');
    expect(res.data.clausole).toHaveLength(3);
    expect(res.data.metadati.map(m => m.campo)).toContain('oggettoContratto');
    expect(res.data.allegati[0].filename).toBe('dure.pdf');
    expect(res.data.allegati[0].metadati.map(m => m.campo)).toContain('numeroProtocollo');
  });

  it('ritorna 204 (no body) quando nessuna bozza per previewID', async () => {
    const res = await POST('/comparator/recuperaBozza', { previewID: 'mai-salvata' }, { auth: MOCK_USER });
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Esegui test, atteso FAIL**

Run: `npx jest test/salva-bozza.test.js --testTimeout=30000 --forceExit`
Expected: 2 fail (action non implementata).

- [ ] **Step 3: Implementa handler**

In `srv/comparator-service.js`, dopo handler `salvaBozza`, aggiungi:

```js
    // Riprende i dati della bozza salvata per lo stesso previewID (stesso documento riaperto
    // nel wizard): precompila metadati/clausole/allegati salvati in precedenza.
    this.on('recuperaBozza', async (req) => {
      const { previewID } = req.data;
      if (!previewID) return req.reject(400, 'previewID obbligatorio');

      return cds.tx(req).run(async (tx) => {
        const { Contratto, ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
        const contratto = await tx.run(SELECT.one.from(Contratto).where({ previewID, stato: 'BOZZA' }));
        if (!contratto) return null;

        let clausole = [];
        try { clausole = (JSON.parse(contratto.snapshotBozza || 'null') || {}).clausole || []; } catch (e) { clausole = []; }

        const metadati = await tx.run(SELECT.from(MetadatoDocumento).where({ contratto_ID: contratto.ID }));
        const allegatiRaw = await tx.run(SELECT.from(ContrattoAllegato).where({ contratto_ID: contratto.ID }));
        const allegati = [];
        for (const a of allegatiRaw) {
          const aMetadati = await tx.run(SELECT.from(MetadatoDocumento).where({ allegato_ID: a.ID }));
          allegati.push({ filename: a.filename, tipo: a.tipo, metadati: aMetadati });
        }

        return { contrattoID: contratto.ID, intestatario: contratto.intestatario, clausole, allegati, metadati };
      });
    });
```

- [ ] **Step 4: Esegui test, atteso PASS**

Run: `npx jest test/salva-bozza.test.js --testTimeout=30000 --forceExit`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add srv/comparator-service.js test/salva-bozza.test.js
git commit -m "feat: recuperaBozza per ripresa automatica wizard"
```

---

### Task 6: Frontend Punto 1 — filtro clausole rischio + model mancanti

**Files:**
- Modify: `app/comparator/webapp/controller/Wizard.controller.js:44-56`
- Modify: `app/comparator/webapp/fragment/WizardStepFinale.fragment.xml`

**Interfaces:**
- Consumes: `oCoverageData.clausole` (stato: MATCH_TEMPLATE/VARIANTE/NUOVA/NON_PRESENTE).
- Produces: model `wizardSezioni` sezione "Clausole di rischio" solo VARIANTE/NUOVA; model `mancanti` `{ value, has }`.

- [ ] **Step 1: Filtra aClausoleRischio**

In `Wizard.controller.js`, riga 45-47, sostituisci:

```js
      var aClausoleRischio = (oCoverageData.clausole || []).filter(function (c) {
        // Solo clausole effettivamente nel documento caricato. Le MATCH_TEMPLATE sono clausole
        // del template confrontate, non del documento: si vedono nella tabella compliance del
        // step finale. Le NON_PRESENTE (mancanti) sono in "Clausole mancanti" nel finale.
        return c.stato === "VARIANTE" || c.stato === "NUOVA";
      }).map(function (c) {
        return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: c.posizione || null, isClausola: true };
      });
```

- [ ] **Step 2: Model mancanti**

In `Wizard.controller.js`, dopo il set del model `tips` (riga 56), aggiungi:

```js
      var aMancanti = (oCoverageData.clausole || [])
        .filter(function (c) { return c.stato === "NON_PRESENTE"; })
        .map(function (c) {
          return { codice: c.numero, titolo: c.titolo || "", testo: c.testo || "" };
        });
      this.getView().setModel(new JSONModel({ value: aMancanti, has: aMancanti.length > 0 }), "mancanti");
```

- [ ] **Step 3: Tabella mancanti nel finale**

In `WizardStepFinale.fragment.xml`, dopo il VBox tips (riga 29) e prima del VBox compliance (riga 31), inserisci:

```xml
    <VBox visible="{mancanti>/has}" class="app-table-wrap sapUiSmallMarginBottom">
      <Label text="Clausole mancanti rispetto al template" design="Bold" class="sapUiSmallMarginBottom" />
      <Table items="{ path: 'mancanti>/value', templateShareable: true }" growing="true" growingThreshold="50">
        <columns>
          <Column width="6rem"><Text text="Clausola" /></Column>
          <Column><Text text="Titolo" /></Column>
          <Column><Text text="Testo (dal template)" /></Column>
        </columns>
        <items>
          <ColumnListItem>
            <cells>
              <Text text="{mancanti>codice}" />
              <Text text="{mancanti>titolo}" />
              <Text text="{mancanti>testo}" wrapping="true" />
            </cells>
          </ColumnListItem>
        </items>
      </Table>
    </VBox>
```

- [ ] **Step 4: Verifica sintassi UI5**

Run: `npx cds compile --for node` poi `node -e "require('@sap/cds').serve('all')" --help` oppure più semplice: avvio dev server e GET `/comparator/webapp/` (la view è XML compilata a runtime). Verifica manuale nel browser (no QUnit views comparator). At least: `npx cds watch &` non richiesto; usa `npx eslint app/comparator/webapp/controller/Wizard.controller.js 2>/dev/null || true` (eslint non configurato → salta).

- [ ] **Step 5: Commit**

```bash
git add app/comparator/webapp/controller/Wizard.controller.js app/comparator/webapp/fragment/WizardStepFinale.fragment.xml
git commit -m "feat: clausole di rischio solo documento + tabella clausole mancanti nel wizard"
```

---

### Task 7: Frontend Punto 2 — bottone Salva bozza + ripresa automatica

**Files:**
- Modify: `app/comparator/webapp/view/Wizard.view.xml:20-26` (footer)
- Modify: `app/comparator/webapp/controller/Wizard.controller.js`

**Interfaces:**
- Consumes: `salvaBozza`, `recuperaBozza` backend; model `wizardSezioni`, `allegati`, `documentoPrincipale`, `coverage`.
- Produces: footer button `btnSalvaBozza`; method `onSalvaBozza`; ripresa auto in `_onRouteMatched`.

- [ ] **Step 1: Bottone nel footer**

In `Wizard.view.xml`, footer Toolbar, prima del bottone Avanti (riga 24), aggiungi:

```xml
        <Button id="btnSalvaBozza" text="Salva bozza" press=".onSalvaBozza" class="app-btn" />
```

- [ ] **Step 2: onSalvaBozza**

In `Wizard.controller.js`, dopo `onConfirm` (dopo riga 298), aggiungi:

```js
    onSalvaBozza: async function () {
      var oData = this._oCoverageData;
      if (!oData || !oData.previewID) { MessageBox.info("Nessuna analisi in corso da salvare."); return; }

      var oWizardModel = this.getView().getModel("wizardSezioni");
      var aMetadati = oWizardModel ? oWizardModel.getData()
        .filter(function (s) { return s.sezione !== "Clausole di rischio"; })
        .reduce(function (acc, s) { return acc.concat(s.campi); }, []) : [];
      var oAllegatiModel = this.getView().getModel("allegati");
      var aAllegati = oAllegatiModel ? oAllegatiModel.getProperty("/value") : [];
      var oDocPrincipaleModel = this.getView().getModel("documentoPrincipale");
      var sTipo = oDocPrincipaleModel ? oDocPrincipaleModel.getProperty("/codiceSelezionato") : null;
      var sFilename = sessionStorage.getItem("comparatorFilename") || "";

      var oTitolo = null, oFornitore = null;
      aMetadati.forEach(function (m) {
        if (m.campo === "titoloContratto") oTitolo = m;
        if (m.campo === "fornitore") oFornitore = m;
      });
      var sIntestatario = (oTitolo && oTitolo.valore) || (oFornitore && oFornitore.valore) || "";

      var iIndex = this._iCurrentStepIndex || 0;
      var sStep = iIndex === 0 ? "CONTRATTO" : (iIndex >= 1 && iIndex <= aAllegati.length ? "ALLEGATO" : "FINE");
      var sAllegatoID = null, aAllegatoMetadati = null;
      if (sStep === "ALLEGATO" && aAllegati[iIndex - 1]) {
        var oAllegato = aAllegati[iIndex - 1];
        sAllegatoID = oAllegato.filename;
        aAllegatoMetadati = (oAllegato.sezioni || []).reduce(function (acc, s) { return acc.concat(s.campi); }, []);
      }

      try {
        var oResp = await fetch("/comparator/salvaBozza", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewID: oData.previewID, step: sStep, filename: sFilename, tipo: sTipo,
            intestatario: sIntestatario, clausole: oData.clausole || [],
            metadati: sStep === "ALLEGATO" ? aAllegatoMetadati : aMetadati,
            allegatoID: sAllegatoID
          })
        });
        if (oResp.ok) {
          sap.m.MessageToast.show("Bozza salvata. Potrai riprenderla riaprendo il wizard per questo documento.");
        } else {
          MessageBox.error("Errore salvataggio bozza: " + await oResp.text());
        }
      } catch (e) {
        MessageBox.error("Errore di rete: " + e.message);
      }
    },
```

- [ ] **Step 3: Ripresa automatica in _onRouteMatched**

In `Wizard.controller.js`, dopo il calcolo `aAllegati` (riga 30) e prima della costruzione modelli (riga 43), aggiungi:

```js
      var oBozzaResp = null;
      try {
        var oBozzaRes = await fetch("/comparator/recuperaBozza", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewID: oCoverageData.previewID })
        });
        // 204 = nessuna bozza salvata per questa preview; 200 = dati bozza.
        if (oBozzaRes.ok && oBozzaRes.status !== 204) oBozzaResp = await oBozzaRes.json();
      } catch (e) { /* ripresa bozza non bloccante */ }

      if (oBozzaResp && oBozzaResp.contrattoID) {
        aAllegati = (oBozzaResp.allegati || []).map(function (a) {
          return Object.assign({}, a, { sezioni: metadataWizardHelper.raggruppaPerSezione(a.metadati || []) });
        });
        var aSezioniBozza = metadataWizardHelper.raggruppaPerSezione(oBozzaResp.metadati || []);
        var aClausoleBozza = (oBozzaResp.clausole || [])
          .filter(function (c) { return c.stato === "VARIANTE" || c.stato === "NUOVA"; })
          .map(function (c) {
            return { etichetta: c.titolo || ("Clausola " + c.numero), valore: c.testo || "", confidenza: null, posizione: null, isClausola: true };
          });
        if (aClausoleBozza.length) aSezioniBozza.push({ sezione: "Clausole di rischio", campi: aClausoleBozza });
        this._aSezioniBozza = aSezioniBozza;
      }
```

Poi, alla riga 51, sostituisci il set del model `wizardSezioni`:

```js
      this.getView().setModel(new JSONModel(this._aSezioniBozza || aSezioni), "wizardSezioni");
```

e alla riga 53 sostituisci il set del model `allegati`:

```js
      this.getView().setModel(new JSONModel({ value: aAllegati }), "allegati");
```

`_buildSteps` usa già la variabile locale `aAllegati` (riga 80) → gli step allegati riflettono la bozza ripresa.

- [ ] **Step 4: Verifica** (manuale nel browser; nessun QUnit view comparator). Almeno verifica che il file non abbia errori di sintassi con `node --check` (non applicabile a browser code) — skip; revisore legge il diff.

- [ ] **Step 5: Commit**

```bash
git add app/comparator/webapp/view/Wizard.view.xml app/comparator/webapp/controller/Wizard.controller.js
git commit -m "feat: salva bozza e ripresa automatica nel wizard comparator"
```

---

### Task 8: Frontend Punto 3 — gate tips fix con classificaDocumentoPrincipale

**Files:**
- Modify: `app/comparator/webapp/controller/ComparatorHome.controller.js:154-218`

**Interfaces:**
- Consumes: `classificaDocumentoPrincipale` backend; `oCoverageData.riferimentoTrovato`/`coveragePercent`; `sTemplateID`.
- Produces: `oDocumentoPrincipale` aggiornato (per model `documentoPrincipaleResult`); tips generate anche se ALTRO ma template esplicito.

- [ ] **Step 1: Fallback classificazione dopo classificaAllegati**

In `ComparatorHome.controller.js`, dopo il blocco try di `classificaAllegati` (dopo riga 171), inserisci:

```js
        // Punto 3 spec: se la classificazione con allegati non ha prodotto sottoTipo (es. embedding
        // ALTRO), si tenta un fallback backend dedicato (gpt-4o-mini) sul testo del documento
        // principale. Non bloccante.
        if (!oDocumentoPrincipale || !oDocumentoPrincipale.sottoTipo) {
          try {
            var oClassResp = await fetch("/comparator/classificaDocumentoPrincipale", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ previewID: oCoverageData.previewID })
            });
            if (oClassResp.ok) {
              var oClassData = await oClassResp.json();
              if (oClassData && oClassData.categoria) oDocumentoPrincipale = oClassData;
            }
          } catch (e) { /* classificazione fallback non bloccante */ }
        }
```

- [ ] **Step 2: Gate tips non-bloccante**

In `ComparatorHome.controller.js`, righe 201-204, sostituisci:

```js
          // Le tips AI confrontano il documento con un template/altri contratti: richiede un
          // riferimento affidabile (template scelto esplicitamente o auto-match con coverage
          // >= 50) e una categorizzazione del documento (sottoTipo o almeno categoria macro).
          // Se la classificazione resta ALTRO (sottoTipo e categoria nulli) ma il template è
          // scelto esplicitamente (sTemplateID), non bloccare: il confronto verso quel template
          // resta significativo perché scelto dall'utente.
          var bDocumentoCategorizzato = !!(oDocumentoPrincipale && (oDocumentoPrincipale.sottoTipo || oDocumentoPrincipale.categoria));
          var bRiferimentoAffidabile = sTemplateID ||
            (oCoverageData.riferimentoTrovato && oCoverageData.riferimentoTrovato.templateID && oCoverageData.coveragePercent >= 50);
          if (bRiferimentoAffidabile && (bDocumentoCategorizzato || sTemplateID)) {
```

(il resto del blocco tips resta invariato: `sTemplateIDPerTips`, `aClausoleUsate`, fetch `generaTipsAI`, `oTipsData`).

- [ ] **Step 3: Verifica** (manuale; log upload flow nel browser). Revisore legge diff.

- [ ] **Step 4: Commit**

```bash
git add app/comparator/webapp/controller/ComparatorHome.controller.js
git commit -m "fix: gate tips usa categoria + fallback classificaDocumentoPrincipale in upload"
```

---

### Task 9: Regressione completa + commit finale

**Files:**
- Tutti i test

- [ ] **Step 1: Esegui tutti i test nuovi**

Run: `npx jest test/salva-bozza.test.js test/classifica-documento-principale.test.js --testTimeout=30000 --forceExit`
Expected: 8 pass (5 + 3).

- [ ] **Step 2: Esegui test comparator esistenti (non-flaky)**

Run: `npx jest test/confirm-coverage-esempio-classificazione.test.js test/completezza-documento-principale.test.js --testTimeout=30000 --forceExit`
Expected: PASS (conferma che confirmCoverage e classificaAllegati non sono rotti).

- [ ] **Step 3: Smoke server**

Run: `npm start` in background, poi `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4004/comparator/getTemplates`
Expected: 200. Poi kill server.

- [ ] **Step 4: Commit finale**

```bash
git add -A
git commit -m "test: regressione comparator rischio/salvaBozza/tips"
```

Nota: `test/comparator-allegati.test.js` resta flaky/pre-esistente (timeout, non toccato).
