# Design — Comparator: riconoscimento automatico riferimento + wizard ingestione con preview PDF

**Data**: 2026-08-04
**Contesto**: oggi il Comparator (`ComparatorHome.view.xml`) richiede all'utente di scegliere manualmente un Template di riferimento (`Select templateSelect`) prima di caricare il documento (`onAvvia`, `calcolaCoverage`). La comparazione clausola-per-clausola (`comparator-engine.js`) e la classificazione/estrazione allegati (`allegato-classifier.js`, `allegato-extractor.js`) sono già solide e vanno riusate senza modifiche di logica. Il requisito (`modifiche.md`) chiede di eliminare la scelta manuale del template nel primo step, far riconoscere al sistema il riferimento più simile (tra template standard Iccrea e template/contratti clienti già censiti) dopo classificazione ed estrazione, e di far rivedere all'utente ogni documento caricato (contratto + ogni allegato) in un wizard passo-passo con anteprima PDF stile Document AI (evidenziazione della porzione di testo sorgente per ogni dato estratto).

## Scope

Copre: rimozione selezione manuale template, pipeline automatica di riconoscimento riferimento, wizard frontend passo-passo per la revisione documenti, preview PDF con evidenziazione bounding-box.

Non copre: modifiche alla logica di diff clausola-per-clausola già esistente (`confrontaClausoleConTemplate`), modifiche al modulo di verifica compliance/deroghe, modifiche al flusso RF8/RF9 (dashboard/anomalie).

## Modello dati

```cds
entity Template : cuid, managed {
  ...
  tipoRiferimento : String(20) enum { STANDARD; CLIENTE; } default 'CLIENTE';
}

entity TemplateVersion : cuid, managed {
  ...
  embeddingDocumento : LargeString; // JSON array, embedding dell'intero documento (concatenazione testo clausole versione corrente)
}
```

- Seed DORA (`srv/lib/demo-data.js` / seed script) → `tipoRiferimento: 'STANDARD'` esplicito.
- Ogni Template creato da `confirmCoverage` o `import-commit.js` → default `'CLIENTE'` (nessuna modifica al codice di insert necessaria oltre al default schema, salvo dove serve sovrascrivere esplicitamente STANDARD).
- `embeddingDocumento` calcolato in ognuno dei 3 punti che oggi creano una `TemplateVersion`: `import-commit.js` (`eseguiImport`, `eseguiImportConfermato`) e il blocco di creazione Template dentro `confirmCoverage` (`comparator-service.js`). Se il calcolo fallisce (embedding API non disponibile) → `embeddingDocumento` resta `null`, non bloccante (stesso pattern try/catch del resto del codice); un Template con `embeddingDocumento` nullo viene trattato come similarity 0 in Stadio 2 (esclusa dalla shortlist, mai dalla comparazione se è l'unico Template disponibile — in quel caso fallback a confronto diretto).
- Nessuna modifica a `MetadatoDocumento` o `ContrattoAllegato`: le posizioni bounding-box e i PDF convertiti restano transienti in `previewStore` (TTL 30 min), mai persistiti — non richiesto rivedere la preview PDF di un contratto già confermato.

## Architettura — pipeline a 3 stadi

**Stadio 1 — Ingestione e analisi (nessun template)**
Per il contratto e ogni allegato caricato, indipendentemente:
1. Se il file non è PDF (`.docx`, `.xlsx`) → conversione a PDF (vedi "Conversione non-PDF" sotto).
2. Estrazione testo posizionato dal PDF (nativo o convertito) — vedi `pdf-position.js`.
3. Classificazione (`classificaAllegato`, esistente, invariata).
4. Estrazione campi (`estraiCampiAllegato`, esteso per popolare `posizione` per campo — vedi sotto).

Nessuna comparazione con template in questo stadio.

**Stadio 2 — Riconoscimento riferimento** (nuovo modulo `srv/lib/riferimento-matcher.js`, lanciato in parallelo allo Stadio 1 del contratto non appena le clausole sono estratte, cosi il risultato è pronto quando l'utente arriva all'ultimo step del wizard)
1. *Shortlist*: embedding documento del contratto caricato (media embedding clausole estratte) confrontato via cosine similarity con `TemplateVersion.embeddingDocumento` di ogni Template attivo (pool unico STANDARD+CLIENTE, nessun bonus/tie-break) → top 3.
2. *Rifinitura*: sui top 3, match clausola-per-clausola completo riusando `confrontaClausoleConTemplate`/logica di `calcolaCoverage` esistente → vince il Template con `coveragePercent` più alto (a parità, similarity media più alta).

**Stadio 3 — Comparazione**
Riuso invariato della logica esistente (MATCH_TEMPLATE/VARIANTE/NUOVA/NON_PRESENTE) contro il Template vincitore dello Stadio 2. Nessuna modifica.

### Conversione non-PDF → PDF

Nuovo modulo `srv/lib/docx-to-pdf.js`:
- `.docx` → HTML (mammoth, già dipendenza) → PDF (Puppeteer headless, nuova dipendenza `puppeteer` in `package.json`, solo npm, nessun binario esterno richiesto sull'ambiente BTP).
- `.xlsx` (contratto): fuori scope la conversione a PDF fedele (layout tabellare, non un "documento" nel senso Document AI) — resta il fallback attuale (estrazione testo via `xlsx` lib, nessuna preview con evidenziazione per questo formato). Limitazione nota, non bloccante.

Un solo file convertito (o nativo) PDF alimenta sempre la stessa pipeline di posizionamento testo — un solo percorso di codice, non uno per formato.

### Estrazione posizionale (`srv/lib/pdf-position.js`)

- Usa `pdfjs-dist` (già dipendenza server, stesso pattern di `ai-import.js`) `getTextContent()` per pagina → lista di item testo con bbox (derivato da `transform`/`width`/`height`) e testo concatenato con mappa offset→item.
- `estraiCampiAllegato` esteso: dopo aver ottenuto `valore` per un campo dal LLM, cerca lo span corrispondente nel testo posizionato (match esatto case-insensitive, poi fallback fuzzy su normalizzazione whitespace) → se trovato, calcola bbox (unione item coinvolti) + numero pagina → `{ pagina, x, y, width, height }`; se non trovato, `posizione: null` (nessuna evidenziazione per quel campo, non blocca nulla).

## Wizard frontend (installer-style)

- Upload resta un unico step iniziale in `ComparatorHome` (contratto + N allegati insieme). **Rimosso** il blocco `Select templateSelect` e relativa label — nessuna selezione template richiesta.
- Caso allegati in unico PDF: il contratto può arrivare con tutti gli allegati concatenati in un solo file PDF (nessun upload separato per allegato). Nessuna logica di split automatico in questo design — l'intero PDF viene trattato come "contratto" nello Stadio 1/2/3; la separazione contratto/allegati resta compito dell'utente in fase di upload (file multipli) come oggi. Limitazione nota, non bloccante — fuori scope split automatico di un PDF multi-documento.
- Dopo "Avvia analisi": chiamata Stadio 1 (per tutti i documenti) + Stadio 2/3 in parallelo (contratto). Risultato completo (inclusi PDF convertiti base64 e posizioni) salvato in `previewStore` come oggi, referenziato da `previewID`.
- Nuova vista `Wizard.view.xml` / `Wizard.controller.js`, basata su `sap.m.Wizard`:
  - Step 0 = contratto: riusa il fragment `MetadataWizard` esistente (Input editabili + confidenza), sostituendo la `TextArea` di testo grezzo con il nuovo `PdfPreview`.
  - Step 1..N = un allegato ciascuno: riusa `MetadataWizardAllegato`, stessa sostituzione TextArea → `PdfPreview`.
  - Step finale: riferimento trovato (nome Template, tipo STANDARD/CLIENTE, similarity, coveragePercent) + tabella comparazione esistente (invariata) + bottone "Conferma" → `confirmCoverage` (invariato).
  - Navigazione "Avanti"/"Indietro" nativa di `sap.m.Wizard`.

### `PdfPreview` (nuovo fragment/custom control)

- Rendering PDF lato browser via build front-end di `pdfjs-dist` (canvas per pagina), overlay `<div>` posizionati/scalati sulle bbox dei campi.
- Click su una riga campo nel pannello metadati → evidenzia (scroll + highlight) il riquadro corrispondente nel PDF. Campi con `posizione: null` → nessuna evidenziazione possibile, badge "posizione non determinata".
- Asset `pdfjs-dist` browser (`pdf.min.js` + `pdf.worker.min.js`) copiati come risorse statiche in `app/comparator/webapp/lib/pdfjs/` (dettaglio di build, non richiede nuova dipendenza: `pdfjs-dist` è già in `package.json`).

## Flusso dati (riassunto end-to-end)

1. Utente carica contratto (1 file) + allegati (N file, opzionale) → "Avvia".
2. Backend: Stadio 1 per ognuno (conversione se serve, estrazione posizionale, classificazione, estrazione campi con posizione) + Stadio 2/3 per il contratto in parallelo. Tutto salvato in `previewStore`.
3. Frontend naviga alla vista Wizard, popolata da `previewStore` via `previewID`.
4. Utente scorre gli step, verifica/corregge i campi con supporto della preview PDF evidenziata.
5. Ultimo step: riferimento auto-riconosciuto + comparazione, "Conferma" crea il contratto (`confirmCoverage`, invariato — nessuna posizione/PDF persistita).

## API

- `calcolaCoverage`: `templateID` diventa **opzionale**. Assente → esegue Stadio 1+2+3 automaticamente. Risposta arricchita con `riferimentoTrovato: { templateID, nome, tipo, similarity, coveragePercent }`. Se presente (retrocompatibilità/debug) → comportamento identico a oggi.
- `calcolaCoverageDaContratto`: `templateID` opzionale, se assente derivato da `Contratto.template_ID` (elimina il bisogno del selector anche nel flusso "verifica contratto esistente").
- `classificaAllegati`: risposta arricchita con `pdfBase64` (documento convertito/nativo) e `posizione` per campo — solo in `previewStore`, non persistito.

## Gestione errori

- Pool Template vuoto (caso limite, seed sempre presente) → errore esplicito "Nessun template di riferimento disponibile in archivio".
- Testo illeggibile/zero clausole estratte → messaggio "Documento non analizzabile" (oggi generico "Template has no clauses", da rendere più chiaro).
- Conversione docx→PDF fallita (Puppeteer crash/timeout) → fallback: quello step del wizard mostra solo testo estratto senza evidenziazione, warning non bloccante (stesso pattern try/catch già usato ovunque nel codice per step non critici).
- Match valore→posizione non trovato → campo senza evidenziazione, non blocca il flusso.
- Embedding API non disponibile → comportamento invariato rispetto a oggi (propagato come errore leggibile sullo step corrente).

## Testing

- `test/riferimento-matcher.test.js`: shortlist ordinata per cosine similarity (embeddings mockati), scelta finale per `coveragePercent` più alto tra i candidati in shortlist.
- `test/pdf-position.test.js`: mapping bbox corretto per un PDF di prova con testo noto (item → pagina/coordinate).
- `test/docx-to-pdf.test.js`: conversione produce un buffer PDF valido (magic bytes `%PDF`).
- Test integrazione `calcolaCoverage` senza `templateID`: verifica risposta con `riferimentoTrovato` popolato e clausole comparate come oggi.
- Test backfill `embeddingDocumento` sui Template esistenti (stesso pattern di `seed-embeddings.js`).
- Wizard UI5 (navigazione step, evidenziazione PDF): validazione manuale in browser, non coperta da jest.

## Fuori scope (YAGNI)

- Nessuna persistenza di PDF convertito o posizioni bounding-box dopo `confirmCoverage` — non richiesta la ri-apertura della preview Document AI da un contratto già salvato.
- Nessuna conversione PDF fedele per `.xlsx` — resta il fallback testuale esistente.
- Nessuno split automatico di un PDF contenente contratto + allegati concatenati — l'utente carica i documenti già separati (file multipli).
- Nessun tie-break a favore di STANDARD nel matching (deciso: vince sempre lo score più alto).
- Nessun flusso di caricamento/gestione dedicato per template cliente — il pool si popola solo tramite lo storico clausolario/contratti confermati, come già avviene oggi.
- Nessuna modifica alla UI/flusso di "verifica contratto esistente" oltre alla rimozione del selector (la logica di confronto contro il proprio template resta invariata).
