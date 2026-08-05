# Applicazione — Cartella `srv/`

> Progetto: **Contratti Attivi** (SAP CAP / Node.js)
> Stack: `@sap/cds` + Express + OpenAI

---

## Panoramica generale

La cartella `srv/` contiene tutto il **livello di servizio** del backend.
Il framework usato è **SAP CAP (Cloud Application Programming)**: ogni "service" è una classe che estende `cds.ApplicationService` e registra handler su azioni OData personalizzate (`this.on`, `this.before`, `this.after`).

Il server esegue automaticamente tutti i file `.js` in `srv/` che esportano una classe CAP, più `server.js` che aggiunge endpoint REST puri via Express.

---

## File principali

### 1. [`contratti-service.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/contratti-service.js) — il cuore del sistema

**Classe:** `ContrattiService`

È il servizio più grande (~888 righe). Gestisce l'intero **ciclo di vita del contratto** e della libreria clausole/template.

#### Controllo accessi (guard RBAC)
Prima di ogni scrittura su `Contratto` verifica che l'utente abbia il ruolo `Utente`. Helper privati usati ovunque:

| Helper | Cosa fa |
|---|---|
| `_requireBozza` | Il contratto deve essere in stato `BOZZA`; altrimenti 409 |
| `_requireApprovato` | Il contratto deve essere in stato `APPROVATO` |
| `_isOwner` | Solo il `responsabile` del contratto può agire |
| `_isRevisore` | Solo il `revisore` assegnato può agire |

#### Azioni principali (workflow contratto)

| Azione | Descrizione |
|---|---|
| `creaDaTemplate` | Crea un nuovo contratto (stato `BOZZA`) clonando la versione più recente di un template; copia tutte le clausole |
| `creaTemplateManuale` | Crea template + contratto bozza in un'unica operazione, partendo da clausole libere inserite a mano |
| `confirmImportAI` | Conferma un'analisi AI di un documento: salva le clausole riconosciute in un template importato |
| `aggiungiClausola` / `rimuoviClausola` | Aggiunge/toglie una clausola da un contratto in bozza |
| `modificaClausolaTesto` | Crea una nuova versione della clausola con il testo modificato, tracciando il delta rispetto alla versione precedente |
| `salvaBozza` | "Blocca" la bozza (flag `bozzaSalvata = true`): dopo questo punto le clausole non possono più essere cambiate |
| `aggiornaTestata` | Aggiorna i metadati del contratto (intestatario, importo, date, ecc.) — solo se non ancora salvata la bozza |
| `inviaARevisione` | Manda il contratto in stato `IN_REVISIONE`, crea il record `Revisione` e uno snapshot immutabile |
| `aggiungiCommento` | Il revisore aggiunge commenti sulle clausole (richiede revisione attiva) |
| `risolviCommento` | Il proprietario marca un commento come risolto |
| `riaprireBozza` | Riporta il contratto in `BOZZA` (da `IN_REVISIONE`) per correzioni |
| `approvaRevisione` | Il revisore approva → contratto passa a `APPROVATO` + snapshot |
| `rifiutaRevisione` | Il revisore rifiuta → contratto torna in `BOZZA` |
| `archiviaContratto` | Solo per contratti `APPROVATO`; li porta in `ARCHIVIATO` |
| `ripristinaContratto` | Riporta un contratto archiviato a `APPROVATO` |
| `duplicaContratto` | Crea una copia di un contratto esistente in stato `BOZZA` |

#### Azioni sulle clausole (libreria)

| Azione | Descrizione |
|---|---|
| `creaClausola` | Crea una nuova clausola standalone oppure aggiunge una versione a una clausola esistente |
| `cancellaClausola` | Elimina clausola e tutte le versioni (solo se non usata in nessun contratto attivo) |
| `cancellaTemplate` | Elimina template con tutte le sue versioni e clausole (solo se nessun contratto la usa) |
| `getStoricoClausola` | Ritorna tutte le versioni di una clausola con i contratti che la usano |
| `getContrattiClausola` | Lista i contratti che usano attualmente una data clausola |
| `confrontaVersioni` | Diff testuale tra due versioni di clausola (usa `diff-utils`) |
| `confrontaContrattoConTemplate` | Segnala quali clausole del contratto sono "fuori sync" rispetto al template di riferimento |
| `copiaVersioneClausola` | Porta una versione di clausola in un altro contratto bozza |

#### Gestione allegati

| Azione | Descrizione |
|---|---|
| `classificaAllegatoContratto` | Estrae il testo da PDF/DOCX e chiama l'AI per classificare il tipo di allegato (es. "Polizza", "DURC"…) |
| `aggiungiAllegatoContratto` | Salva il file allegato su DB assieme ai metadati estratti dall'AI |
| `eliminaAllegatoContratto` | Elimina un allegato (solo il proprietario del contratto) |

#### Versioning del contratto

`_creaSnapshotContratto` (funzione privata) viene chiamata automaticamente nei momenti chiave (creazione, invio revisione, approvazione): salva una foto immutabile della testata + clausole in `ContrattoVersione` / `ContrattoVersioneClausola`.

| Azione pubblica | Descrizione |
|---|---|
| `getVersioniContratto` | Lista le versioni snapshot di un contratto |
| `confrontaVersioniContratto` | Confronta due snapshot: diff sulla testata + clausole aggiunte/rimosse/modificate |

#### Hook automatici

- **`before READ Clausola`** — riordina i risultati aggiustando l'ordinamento alfanumerico sul codice (es. `C1 < C2 < C10`, non `C1 < C10 < C2`)
- **`after READ Clausola`** — arricchisce ogni clausola con `numContratti`, `origineTipo` e `origineNome` (da quale template o contratto proviene)
- **`after CREATE ClausolaVersione`** — calcola e salva l'embedding vettoriale (per ricerca semantica) in background, senza bloccare la risposta

---

### 2. [`comparator-service.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/comparator-service.js) — analisi AI di documenti esterni

**Classe:** `ComparatorService`

Serve il flusso di **upload e analisi di contratti già firmati** (documenti reali in ingresso, non creati nell'app). Estrae clausole con AI e le confronta con i template in archivio.

| Azione | Descrizione |
|---|---|
| `calcolaCoverage` | Carica un file PDF/DOCX, estrae le clausole via AI, identifica automaticamente il template più simile (o usa quello specificato), calcola la "copertura" (% di clausole template trovate nel documento), estrae anche i metadati del contratto e le posizioni nel PDF |
| `classificaAllegati` | Per un set di allegati caricati assieme al contratto principale: estrae il testo, classifica il tipo di allegato (polizza, DURC, ecc.) e ne estrae i metadati chiave |
| `getTipologieAllegato` | Restituisce la lista statica dei tipi di allegato supportati |
| `verificaCompletezza` | Controlla se tutti gli allegati obbligatori per il tipo di contratto sono presenti |
| `verificaDeroghe` | Analizza il testo del contratto per cercare clausole in deroga rispetto allo standard |
| `calcolaCoverageDaContratto` | Come `calcolaCoverage` ma a partire da un contratto già salvato nel DB (invece di un file uploadato) |
| `generaAnomalie` | Rileva anomalie nel contratto (date scadute, importi anomali, ecc.) |
| `confermaImportComparator` | Salva sul DB il contratto analizzato (clausole + allegati + metadati) dopo la conferma dell'utente |
| `salvaEsempioClassificazione` | Salva un feedback di classificazione (utilizzato per migliorare il modello nel tempo) |
| `getStatisticheTemplate` | Statistiche di utilizzo di un template (quanti contratti, coverage medio, ecc.) |
| `getProfiloContratto` | Profilo sintetico di un contratto con anomalie, deroghe e completezza allegati |

> **Nota:** questo servizio usa un `previewStore` in memoria (non persistente): se il server si riavvia, le preview in corso vanno perse e l'utente deve ripetere l'upload.

---

### 3. [`agente-service.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/agente-service.js) — chatbot AI

**Classe:** `agenteService`

Interfaccia con **OpenAI Assistants API** per il chatbot integrato nell'app.

| Azione | Descrizione |
|---|---|
| `openThread` | Apre un thread di conversazione per l'utente corrente (o lo riutilizza se già esiste). Con `forceNew = true` elimina il vecchio e ne crea uno nuovo |
| `sendMessage` | Invia un messaggio al thread e restituisce la risposta dell'assistente |
| `deleteThread` | Chiude e cancella il thread (lato OpenAI e lato DB) |

Richiede la variabile d'ambiente `ASSISTANT_ID` (l'ID dell'assistente OpenAI configurato per il progetto).

---

### 4. [`server.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/server.js) — endpoint REST Express

Non è una classe CAP ma si aggancia al bootstrap di CDS (`cds.on('bootstrap', ...)`).
Espone endpoint HTTP "grezzi" per operazioni che richiedono upload di file (multipart):

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `GET /` | GET | Redirect all'app UI (`/cockpit/webapp/index.html`) |
| `GET /user-info` | GET | Restituisce email e ruoli dell'utente autenticato |
| `POST /contratti/importTemplate` | POST | Upload di un file (PDF/DOCX) per importare un template con estrazione clausole |
| `GET /contratti/esportaContratto/:id` | GET | Genera ed esporta il contratto in formato DOCX |
| `GET /contratti/scaricaAllegato/:id` | GET | Scarica un allegato salvato su DB |
| `POST /contratti/previewImportAI` | POST | Upload file → anteprima delle clausole riconosciute (prima di confermare l'import) |
| `POST /comparator/uploadCoverage` | POST | Upload file → analisi coverage rispetto a un template specifico (vecchio endpoint, mantenuto per retrocompatibilità) |

Tutti gli endpoint protetti richiedono autenticazione con ruolo `Utente` o `Revisore` tramite il middleware `requireAuth`.

---

## Libreria `lib/` — moduli di supporto (i più importanti)

| Modulo | Cosa fa |
|---|---|
| `ai-import.js` | Chiama l'LLM per estrarre clausole da un documento |
| `comparator-engine.js` | Algoritmo di confronto clausole documento vs template |
| `allegato-classifier.js` | Classifica il tipo di allegato tramite AI (o keyword matching) |
| `allegato-extractor.js` | Estrae i metadati chiave da un allegato (date, importi, ecc.) |
| `import-commit.js` | Salva in DB il risultato confermato di un'importazione AI |
| `diff-utils.js` | Calcola il delta testuale tra due versioni di clausola |
| `embedding-utils.js` | Crea e salva vettori embedding per la ricerca semantica |
| `riferimento-matcher.js` | Trova il template più simile a un documento dato un set di clausole estratte |
| `deroghe-engine.js` | Analizza il testo del contratto per cercare clausole in deroga |
| `anomalie-utils.js` | Rileva anomalie (date scadute, importi, ecc.) |
| `tipologie-allegato.js` | Configurazione statica dei tipi di allegato e dei loro campi chiave |
| `setup-assistant.js` | Script per configurare l'assistente OpenAI |
| `export-docx.js` | Genera un file DOCX dal contratto |

---

## Stati del contratto (state machine)

```
BOZZA ──► IN_REVISIONE ──► APPROVATO ──► ARCHIVIATO
  ▲               │                          │
  └───────────────┘ (rifiuta/riapri)         │ (ripristina)
                                        APPROVATO ◄─┘
```

- Solo l'**owner** (`responsabile`) può inviare in revisione, risolvere commenti, archiviare.
- Solo il **revisore** può approvare o rifiutare.
- Le modifiche alle clausole sono bloccate dopo `salvaBozza`.

---

## Variabili d'ambiente necessarie

Vedi `.env` nella root del progetto. Le principali:
- `ASSISTANT_ID` — ID dell'assistente OpenAI (per `agente-service.js`)
- Credenziali OpenAI (usate da `modules/openai-module.js`)
