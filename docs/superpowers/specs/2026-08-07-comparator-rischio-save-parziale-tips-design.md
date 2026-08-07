# Comparator — Clausole di rischio solo doc, salvataggio parziale bozza, fix tips AI — Design

> Data: 2026-08-07
> Area: `app/comparator` (SAPUI5) + `srv/comparator-service.js` + `srv/lib`

## Goal

Tre modifiche al flusso comparator di analisi/verifica documenti contrattuali:

1. **"Clausole di rischio"** mostrano solo le clausole ricavate dal documento (VARIANTE/NUOVA), non quelle del template (MATCH_TEMPLATE). Lo step finale del wizard aggiunge una tabella "Clausole mancanti rispetto al template" (NON_PRESENTE) + mantiene le tips AI già visibili.
2. **Salvataggio parziale per documento** tramite bottone "Salva bozza": persiste su `Contratto` esistente con `stato='BOZZA'`, riprendibile automaticamente all'apertura del wizard per lo stesso documento.
3. **Fix tips AI** nell'upload: il gate `bDocumentoCategorizzato` salta le tips quando la classificazione embedding-first ritorna `ALTRO` (→ `sottoTipo=null`). Si aggiunge fallback backend con `gpt-4o-mini` per determinare il sottoTipo, così le tips tornano a generarsi nell'upload flow.

## Vincoli globali

- Modello di progetto = `gpt-4o-mini` via `srv/modules/openai-module.js` (`chatJSON` / `chat`). Classificazione documento (allegato) già lo usa come fallback in `srv/lib/allegato-classifier.js#_classificaConLLM`.
- Riuso entità esistenti `Contratto` (`stato='BOZZA'`), `ContrattoClausola`, `ContrattoAllegato`, `MetadatoDocumento`. Nessuna nuova tabella.
- Non bloccante: fallimento classificazione gpt / salvataggio bozza non impedisce di proseguire l'analisi (pattern già usato in `_eseguiVerificheContratto`).
- Convenzioni UI5: `app-` prefissi CSS, `sap.ui.define` AMD, controller estendono BaseController, pattern raw fetch in `app/comparator/webapp/controller`.

---

## Punto 1 — "Clausole di rischio" solo documento + mancanti nel finale

### Stato attuale
- `Wizard.controller.js:44-51` costruisce `aSezioni.push({ sezione: "Clausole di rischio", campi: aClausoleRischio })` da **tutte** le `oCoverageData.clausole` (MATCH_TEMPLATE, VARIANTE, NUOVA). Le MATCH_TEMPLATE sono clausole del template.confrontate, non dal documento → da escludere per il requisito.
- `_buildComplianceModel` già salta `NON_PRESENTE` (mancanti) — mai mostrate nel wizard, solo le tips le accennano via testo.
- `WizardStepFinale.fragment.xml` mostra: riferimento, tips AI, compliance presenti, EsitiVerifica. Nulla per le mancanti.

### Modifica
- **`Wizard.controller.js`** (`_onRouteMatched`): filtro `aClausoleRischio` → solo clausole con `stato === 'VARIANTE' || stato === 'NUOVA'`. Commento spiega che MATCH_TEMPLATE = clausole del template, mostrate nello step finale.
- **`WizardStepFinale.fragment.xml`**: aggiungere tabella bind da nuovo model `mancanti` (array di `{ codice, titolo, testo }` derivato da `oCoverageData.clausole.filter(c => c.stato === 'NON_PRESENTE')`). Visibilità `{= ${mancanti>/has} }`. Colonne: "Clausola (codice)", "Titolo", "Testo (dal template)".
- **`Wizard.controller.js`**: costruire model `"mancanti"` `new JSONModel({ value, has })`.

---

## Punto 2 — Salvataggio parziale bozza su Contratto esistente

### Stato attuale
- Tutto persiste in un'unica transazione in `confirmCoverage` (`comparator-service.js:298-466`): crea Template, TemplateVersion, Contratto (`stato='BOZZA'`), Clausole, ClausolaVersione, ContrattoClausola, ContrattoAllegato, EsitoVerifica.
- Il wizard ha step: Contratto (step 0), N allegati (step 1..N), Riepilogo (finale). Nessun salvataggio intermedio.

### Modificazioni

#### Backend — `comparator-service.cds` + `comparator-service.js`
Nuova action CORS/azioni esposit da `ComparatorService`:
```
action salvaBozza(previewID: String, step: String, filename: String, tipo: String, intestatario: String, clausole: [...], metadati: [...], allegatoID: String)
```
- `step`: `'CONTRATTO'` | `'ALLEGATO'` | `'FINE'`.
- Idempotente: cerca `Contratto` con `stato='BOZZA'` per `previewID` (nuova colonna opzionale `previewID` su `Contratto`, gestita in backfill via update, no migrazione esplicita). Se assente, crea bozza nuova con `intestatario = filename` (così riuso risposta navigazione senza Template dedicato? scegliamo: creato Contratto bozza minimale → `intestatario`, `responsabile=req.user.id`, `stato='BOZZA'`).
- Step CONTRATTO: aggiorna intestatario + scrive clausole (`ContrattoClausola`, riusa Clausola/Versione esistenti o ne crea di nuove in `template_ID` dello stesso boilerplate) + `salvaMetadati` su `MetadatoDocumento`.
- Step ALLEGATO: upsert `ContrattoAllegato` (per `filename`), con `tipo`, `mimeType`, `contenuto`, `metadati`.
- Ritorna `{ contrattoID, stato: 'BOZZA' }`.

Nuova action `recuperaBozza(previewID)`:
- Ritorna `{ contrattoID, intestatario, clausole, allegati, metadati }` se esiste bozza per previewID, altrimenti `null`.

#### Frontend — `Wizard.controller.js` + `Wizard.view.xml`
- Footer: bottone **"Salva bozza"** (`showBozzaBtn`) accanto ad "Avanti"/"Conferma". Disabilitato durante analisi.
- `onSalvaBozza`: raccoglie dati step corrente (contratto o allegato) e POST `/comparator/salvaBozza`. Mostra `MessageToast`.
- `_onRouteMatched`: dopo build, chiama `recuperaBozza(previewID)`. Se presente, precompila model `wizardSezioni` e `allegati` con i dati salvati, e marca step con flag `salvato=true` (badge).

---

## Punto 3 — Fix tips AI con fallback gpt backend

### Root cause
`ComparatorHome.controller.js:201-218` (upload) richiede:
```
bDocumentoCategorizzato = !!oDocumentoPrincipale && oDocumentoPrincipale.sottoTipo
```
`documentoPrincipale.sottoTipo` viene da `classificaAllegato(preview.testo)` in `classificaAllegati` (comparator-service.js:127). Se il classificatore da` `ALTRO` (embedding basso e LLM incerto) → `tipologia` nullo → `sottoTipo=null` → tips mai generate anche se c'è riferimento affidabile.

### Modificazioni

#### Backend — nuova azione `classificaDocumentoPrincipale`
```
action classificaDocumentoPrincipale(previewID: String) returns ...
```
- Legge preview da `previewStore`.
- Chiama `classificaAllegato(preview.testo)` (embedding + fallback gpt via `_classificaConLLM`).
- Costruisce `{ categoria, sottoTipo, confidenza, metodoRiconoscimento }` (stessa logica comparator-service:129-133).
- Ritorna; mai errore, sempre oggetto (fallback `ALTRO`).

#### Frontend — `ComparatorHome.controller.js` (`onAvvia`)
- Dopo `calcolaCoverage`, prima del gate tips: se `!bDocumentoCategorizzato`, chiama fetch `classificaDocumentoPrincipale` → aggiorna `documentoPrincipale` (da usare anche per model `documentoPrincipaleResult`).
- Gate tips: `bDocumentoCategorizzato` = `!!under(sottoTipo || categoria)` con il valore ricalcolato dal backend gpt. Se restituisce comunque `ALTRO` (categoria null, sottoTipo null) ma c'è riferimento affidabile (template scelto esplicito `sTemplateID`), **non bloccare**: genera tips comunque (comparazione vs altri contratti dello stesso tipo rimane significativa se template scelto dall'utente).
- `tipsAIResult` salvato come oggi.

---

## Test

- `test/salva-bozza.test.js`: POST `salvaBozza` (step CONTRATTO), verifica `Contratto` stato BOZZA + clausole + metadati; `salvaBozza` ALLEGATO aggiunge/upsert `ContrattoAllegato`; `recuperaBozza` ritorna dati; doppio save idempotente (no duplicati fila).
- `test/classifica-documento-principale.test.js`: `classificaDocumentoPrincipale` mocks `classificaAllegato` → ritorna `{sottoTipo}`; caso `ALTRO` → sottoTipo null ma OK (no throw).
- Adeguare esistenti: flusso upload di `comparator-allegati`? (il doc principale e già mockato). Verificare che gate non blocchi.
- Frontend: solo verifica manuale (nessuna QUnit view comparator).

## Note tempo/rischio

- Bozza: SSl persistenza bozza richiede colonna `previewID` su Contratto → alter schema. Valutare `cds.deploy` incremental. In dev sqlite auto.
- Punto 3: non modificare `getTipsAI` (data-driven). Focus solo sul non-skipping in upload.

## Non incluso (YAGNI)

- Seed dati demo per far apparire tips su contratti identici DORA (flusso verifica-contratto resta data-driven).
- Filtro su rendicontazione tips in result view (non richiesto).