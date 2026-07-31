# Design — Fase A: RF2 Classificazione + RF4 Completezza + RF6 Deroghe + RF5 Subfornitori

**Data**: 2026-07-31
**Precede**: `docs/superpowers/plans/2026-07-31-rf2-rf9-fase-a.md` (piano di implementazione)
**Dipende da**: `01-modello-dati-categorie-metadati.md`, `02-standard-cgc-deroghe.md`, `03-requisiti-evoluzione-gap-analysis.md`

## Obiettivo

Implementare i requisiti RF2, RF4, RF6, RF5 del documento `03-requisiti-evoluzione-gap-analysis.md` per l'app contratti-attivi, come prima fase dell'evoluzione documentale (use case 1/3/4 del contesto).

- **RF2** — Classificazione documentale a monte: documento in ingresso → una delle categorie Contratto/Mail/OdA/Offerta/Fattura/Altro, con sotto-tipologie Contratto (CGC, CPC, Allegato A–G, Albero decisionale) riconosciute come chiavi classificabili.
- **RF4** — Verifica completezza allegati: tabella associativa tipologia → allegati attesi (CGC, CPC, Allegati A–G) e controllo presenza/assenza.
- **RF6** — Individuazione deroghe puntuali focus Art. 17 e Art. 21 CGC.
- **RF5** — Elenco sub-fornitori come lista strutturata (campo del CONTRATTO + estrazione da Allegato E).

**Fuori scope Fase A**: RF8 dashboard KPI, RF9 workflow remediation, RF7 riconciliazione SAP, persistenza esiti deroghe su entità dedicata, UI wizard nuove (la UI esistente consuma `getTipologieAllegato` e si aggiorna da sola).

## Decisioni prese (con l'utente)

- RF2: estendere `classificaAllegati` esistente (niente action nuova per la classificazione del documento principale). Il documento principale in preview viene classificato con lo stesso classificatore.
- RF2: sotto-tipologie Contratto (CGC, CPC, Allegato A–G, Albero decisionale) come chiavi distinte in `TIPOLOGIE_ALLEGATO`, classificabili per embedding/LLM.
- RF4: tabella statica in codice (`srv/lib/allegati-attesi.js`), pattern `tipologie-allegato.js`. Niente entità CDS admin.
- RF6: motore dedicato `srv/lib/deroghe-engine.js`, pattern `compliance-engine.js` (LLM chatJSON, fallback non_determinabile).
- RF5: lista strutturata nel campo `subfornitori` del CONTRATTO (già presente in `campiChiave`), nessuna entità `Subfornitore` relazionale. Allegato E con `campiChiave` dedicati.

## Stato attuale (verificato nel codice)

- `srv/lib/tipologie-allegato.js`: 5 chiavi (APPENDICE_CONTRATTO, DURC, DURF, CAMERA_COMMERCIO, CONTRATTO), ognuna con `key/label/testoRiferimento/campiChiave`. Classificatore (`allegato-classifier.js`) è generico: embedding su `testoRiferimento` (soglia 0.75) + fallback LLM con lista chiavi. Aggiungere una chiave basta per renderla riconoscibile.
- `srv/lib/allegato-extractor.js`: `estraiCampiAllegato(tipo, testo)` legge `campiChiave` della tipologia, ritorna `{ metadati, dataScadenza }`.
- `srv/comparator-service.js`:
  - `calcolaCoverage` (righe 97-124): estrae `testo` e metadati CONTRATTO, salva in `previewStore`.
  - `classificaAllegati` (righe 126-159): per ogni allegato in input estrae testo, classifica, estrae campi, salva in preview e ritorna. **Non classifica il documento principale.**
  - `confirmCoverage` (righe 194-292): persiste contratto, metadati, allegati.
  - `getTipologieAllegato` (righe 161-166): ritorna chiavi + `ALTRO`.
- `srv/lib/template-recognizer.js`: riconoscimento Template Banca/Fornitore per similarity (campo `templateContrattuale`).
- `srv/lib/compliance-engine.js`: verifica generica requisiti→documento, pattern per il nuovo motore deroghe.

## Architettura

### 1. Tassonomia estesa — `srv/lib/tipologie-allegato.js`

Nuove chiavi con `testoRiferimento` descrittivo (dal foglio Categorie) e flag:

| chiave | label | flag |
|---|---|---|
| `CGC` | Condizioni Generali di Contratto | `sottoTipologia: true` |
| `CPC` | Condizioni Particolari di Contratto | `sottoTipologia: true` |
| `ALLEGATO_A` | Allegato A — Specifiche tecniche e modalità operative | `sottoTipologia: true` |
| `ALLEGATO_B` | Allegato B — Allegati Economici | `sottoTipologia: true` |
| `ALLEGATO_C` | Allegato C — Livelli di Servizio, KPI e penali | `sottoTipologia: true` |
| `ALLEGATO_D` | Allegato D — Nomina Responsabile/Sub-responsabile trattamento dati | `sottoTipologia: true` |
| `ALLEGATO_E` | Allegato E — Elenco Subfornitori e Sub-responsabili | `sottoTipologia: true`, `campiChiave`: `subfornitori`, `subresponsabili` |
| `ALLEGATO_F` | Allegato F — Continuità Operativa e Sicurezza ICT | `sottoTipologia: true` |
| `ALLEGATO_G` | Allegato G — Indirizzi delle Parti e PEC | `sottoTipologia: true` |
| `ALBERO_DECISIONALE` | Albero decisionale Qualifica DORA / Esternalizzazione | `sottoTipologia: true` |
| `MAIL` | Comunicazione email tra le parti | `macro: true` |
| `ODA` | Ordine di Acquisto (SAP Ciclo Passivo) | `macro: true` |
| `OFFERTA` | Proposta commerciale/tecnica/economica del fornitore | `macro: true` |
| `FATTURA` | Documento amministrativo/fiscale | `macro: true` |
| `ALTRO` | Tutte le tipologie non incluse | `macro: true` |

`CONTRATTO` resta chiave macro. `getTipologieAllegato` continua a ritornare tutte le chiavi + `ALTRO` (deduplicato).

### 2. RF2 — classificaAllegati esteso

In `srv/comparator-service.js`, handler `classificaAllegati`:
- Classifica anche il **documento principale** della preview: `preview.testo` (già in previewStore da `calcolaCoverage`). Usa lo stesso `classificaAllegato`.
- Mapping macro/sotto-tipologia: se il tipo riconosciuto è `sottoTipologia`, la categoria macro è `CONTRATTO`; se `macro` (MAIL/ODA/OFFERTA/FATTURA/ALTRO), categoria = tipo. Esito: `{ categoria, sottoTipo, confidenza }`.
- Ritorno arricchito: `{ documentoPrincipale: { categoria, sottoTipo, confidenza }, allegati: [...] }`.
- Nessuna modifica a `getTipologieAllegato` (già generico).

Estrazione metadati per sotto-tipologie: `estraiCampiAllegato` legge `campiChiave` della chiave — per CGC/CPC/Allegati con `campiChiave` definiti i metadati specifici (es. Allegato E → `subfornitori`) vengono estratti automaticamente per allegati classificati con quelle chiavi.

### 3. RF4 — verifica completezza allegati

Nuovo `srv/lib/allegati-attesi.js`:
- Tabella statica: `ALLEGATI_ATTESI = { CONTRATTO: [CGC, CPC, ALLEGATO_A, ALLEGATO_B, ALLEGATO_C, ALLEGATO_D, ALLEGATO_E, ALLEGATO_F, ALLEGATO_G] }` (standard Gruppo; vuota/non definita per altre categorie).
- Funzione `verificaCompletezza(allegatiClassificati)` → `[{ allegatoAtteso, etichetta, presente, filename }]` + `percentuale`.

Nuova action CDS `verificaCompletezza(previewID)` in ComparatorService:
- Legge preview, usa gli allegati già classificati (da `preview.allegati`), ritorna l'elenco attesi vs presenti.
- Se nessun allegato caricato: tutti `presente: false`.
- Serve il flusso "Avvia analisi" (documento principale + allegati) — non il flusso verifica-contratto-esistente.

### 4. RF6 — deroghe Art. 17/21

Nuovo `srv/lib/deroghe-engine.js`:
- `ARTICOLI_CRITICI` = `[{ articolo: 17, titolo, segnaliDeroga, testoRiferimento }, { articolo: 21, ... }]` (contenuto da `02-standard-cgc-deroghe.md`).
- `verificaDeroghe(testo)` → LLM chatJSON (pattern `compliance-engine.js`), prompt con articoli e segnali di deroga; output per articolo:
  `{ articolo, esito: 'conforme'|'derogato'|'non_determinabile', dettaglio, riferimentoComma, segnali }`.
- Fallback su errore LLM: `esito: 'non_determinabile'`.

Nuova action CDS `verificaDeroghe(previewID)`:
- Legge `preview.testo`, chiama `verificaDeroghe`, ritorna array esiti.
- Persistenza: **nessuna** in Fase A (RF8 la introdurrà).

### 5. RF5 — subfornitori

- `CONTRATTO.campiChiave` già contiene `subfornitori` (descrizione: elenco denominazioni separate da virgola). Nessuna modifica.
- `ALLEGATO_E` con `campiChiave`: `subfornitori` (elenco nominativi, virgola-separati) e `subresponsabili`. Quando un allegato è classificato `ALLEGATO_E`, i nominativi estratti alimentano il campo del contratto in fase di conferma (stesso meccanismo già usato per gli altri campi in `confirmCoverage`).

## Modifiche a schema/servizi — riepilogo file impattati

- `srv/lib/tipologie-allegato.js` (modifica): nuove chiavi tassonomia.
- `srv/lib/allegati-attesi.js` (nuovo): tabella attesi + verifica completezza.
- `srv/lib/deroghe-engine.js` (nuovo): motore deroghe Art. 17/21.
- `srv/comparator-service.cds` (modifica): nuove action `verificaCompletezza`, `verificaDeroghe`.
- `srv/comparator-service.js` (modifica): `classificaAllegati` classifica documento principale; handler per le 2 nuove action.
- Nessuna modifica a `db/schema.cds` (nessuna nuova entità).

## Testing

Jest backend, pattern `test/comparator-allegati.test.js` (mock `openai-module`):
- **tipologie**: nuove chiavi presenti, flag macro/sottoTipologia coerenti (il file è dati, test leggero di integrità).
- **RF2**: `classificaAllegati` ritorna `documentoPrincipale.categoria`/`sottoTipo` coerenti col mock del classificatore; allegati classificati con sotto-tipologie.
- **RF4**: `verificaCompletezza` — caso tutti presenti, caso mancanti, caso nessun allegato.
- **RF6**: `verificaDeroghe` — esito conforme, derogato, fallback non_determinabile su errore LLM.
- Nessun test automatico per UI (nessuna UI nuova in Fase A).
- Verifica manuale via browser: flusso "Avvia analisi" con documento + allegati (CGC/CPC/Allegato A–G) e controllo Select tipologie arricchito.

## Rischi/Note

- Le nuove chiavi possono spostare classificazioni esistenti: embedding su `testoRiferimento` nuovi compete con i vecchi. Soglia 0.75 resta; il fallback LLM lista tutte le chiavi. Atteso: allegati DURC/DURF/Visura restano stabili (testi di riferimento molto specifici).
- `classificaAllegati` che classifica il documento principale aggiunge un costo LLM in più solo se l'embedding non supera soglia (fallback LLM). Embedding già usato comunque.
- `verificaCompletezza` si basa su allegati classificati: un allegato non riconosciuto come Allegato A–G risulta "assente". L'utente può correggere il tipo nella UI esistente prima di confermare; la verifica si rifà sulla preview aggiornata (`previewStore.update` già usato da `classificaAllegati`).
