# Focus AI — Contratti Attivi

> Stack AI: **OpenAI Assistants API** + **gpt-4o-mini** + **text-embedding-3-small**

---

## Mappa dei moduli AI

```
openai-module.js          ← gateway unico verso OpenAI (client singleton, API key da env o SAP destination)
│
├── Assistants API        ← usata dal chatbot (agente-service.js)
│   └── db-operation.js   ← tool dispatcher (function calling)
│
├── chatJSON / chat       ← usata da tutti gli altri moduli per estrazioni/classificazioni
│   ├── ai-import.js      ← segmentazione clausole da documento
│   ├── allegato-classifier.js  ← classifica tipo allegato
│   └── allegato-extractor.js   ← estrae campi strutturati da un allegato
│
└── embeddings            ← text-embedding-3-small
    ├── embedding-utils.js        ← salva embedding per clausola versione
    ├── allegato-classifier.js    ← pool di embedding per classificazione
    ├── riferimento-matcher.js    ← trova template più simile a un documento
    └── ai-import.js              ← confronto clausole estratte vs candidati template
```

---

## 1. Il chatbot — OpenAI Assistants con Function Calling

### Come funziona il loop

Il chatbot usa le **OpenAI Assistants** (beta API), che gestiscono autonomamente la memoria del thread e il ciclo di tool use. Il flusso in [`openai-module.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/modules/openai-module.js) è:

```
utente invia messaggio
        │
        ▼
openai.beta.threads.messages.create(threadId, { role: 'user', content: message })
        │
        ▼
openai.beta.threads.runs.create(threadId, { assistant_id })
        │
        ▼
_pollRun(openai, threadId, runId)   ← polling ogni 500 ms
        │
        ├── status = 'queued' / 'in_progress'  → continua a pollare
        │
        ├── status = 'requires_action'  ← il modello ha deciso di chiamare un tool
        │       │
        │       ▼
        │   { tool_calls } = run.required_action.submit_tool_outputs
        │       │
        │       ▼
        │   manageFunction(tc.function.name, tc.function.arguments)   ← db-operation.js
        │       │
        │       ▼
        │   openai.beta.threads.runs.submitToolOutputs(...)   ← risultato restituito al modello
        │       │
        │       └── torna a pollare (il modello può fare più chiamate in sequenza)
        │
        └── status = 'completed'
                │
                ▼
            messages.list(threadId) → ritorna i messaggi del run corrente
```

> **Nota chiave**: il loop `requires_action → submitToolOutputs` può ripetersi più volte nello stesso run. Il modello può concatenare più chiamate a tool prima di rispondere all'utente (es. prima `getInfoContratto`, poi `getClausolaContratto`).

Un'accortezza importante: prima di ogni `runs.create`, viene chiamato `_cancelActiveRuns` che cancella eventuali run `queued`/`in_progress`/`requires_action` già aperti sul thread — evita di impallarsi su run orfani.

---

## 2. I Tool (Function Calling)

I tool sono definiti in [`setup-assistant.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/setup-assistant.js) e **registrati sull'assistente OpenAI una volta sola** tramite script `node srv/lib/setup-assistant.js`. L'ID prodotto va in `.env` come `ASSISTANT_ID`.

Il dispatcher che li esegue è [`db-operation.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/modules/db-operation.js) → funzione `manageFunction(name, argsJson)`.

### Elenco completo dei tool disponibili

| Tool | Cosa fa |
|---|---|
| `getVersioniClausola` | Tutte le versioni di una clausola per codice (con gestione ambiguità) |
| `getContrattiClausola` | Contratti che usano una clausola |
| `getContrattiConCommentiAperti` | Contratti con commenti di revisione aperti |
| `getInfoApprovazioneContratto` | Chi ha approvato un contratto e quando |
| `getStatoContratto` | Stato attuale di contratti per intestatario |
| `getContrattiByStato` | Tutti i contratti in un dato stato |
| `getContrattiFuoriSyncConTemplate` | Contratti con clausole non allineate al template |
| `getClausolePiuAggiornateAltrove` | Clausole di un contratto per cui esiste versione più recente altrove |
| `getVersioniContratto` | Storico versioni snapshot di un contratto |
| `confrontaVersioniClausola` | Diff testuale tra due versioni di una clausola (per numero) |
| `confrontaClausole` | Diff testuale tra due clausole diverse |
| `cercaClausole` | Ricerca LIKE su codice/titolo/testo clausole |
| `getClausolaRecente` | Versione più recente di una clausola per codice |
| `cercaClausoleSemantiche` | Ricerca per significato via embedding (cosine similarity) |
| `listClausole` | Elenco completo clausole |
| `getClausoleUtilizzo` | Quante volte ogni clausola è usata nei contratti |
| `eseguiQueryDB` | Query generica fallback su qualsiasi entità del DB |
| `analizzaCoperturaContratto` | Coverage clausole contratto vs template con similarity |
| `getRisultatiCopertura` | Risultati di un'analisi coverage da previewID |
| `getDiffClausola` | Diff parola-per-parola di una clausola VARIANTE in un'analisi coverage |
| `getInfoContratto` | Dati generali di un contratto (testata) |
| `getClausolaContratto` | Clausola per codice scoped su un contratto specifico (senza ambiguità) |
| `getClausoleContratto` | Tutte le clausole di un contratto specifico |

### Gestione ambiguità dei codici clausola

I codici clausola (es. `C1`) **non sono univoci** nel DB: più template/contratti possono avere una clausola `C1` con testi diversi. I tool che lavorano sul codice gestiscono questo caso restituendo:

```json
{
  "ambiguo": true,
  "messaggio": "Esistono 3 clausole con codice C1...",
  "candidati": [
    { "clausolaID": "3B849420", "titolo": "Oggetto", "oggettoContratto": "Contratto ACME" },
    ...
  ]
}
```

Il system prompt istruisce esplicitamente il modello: **non scegliere tu, mostra i candidati e chiedi all'utente di specificare l'ID clausola**, poi richiama il tool con `clausolaID`.

---

## 3. Il System Prompt (Instructions)

Il system prompt è definito nella costante `INSTRUCTIONS` in [`setup-assistant.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/setup-assistant.js#L333-L398). È strutturato in **regole prioritarie** numerate:

### Regole prioritarie (in ordine)

1. **Analisi Copertura** — Se il messaggio contiene `[CONTESTO ANALISI COPERTURA]` con un `previewID`, le domande su differenze/varianti vanno sempre risolte con `getDiffClausola(previewID, titoloParziale)`. Non toccare il DB, non chiamare altri tool.

2. **Pagina Dettaglio Contratto** — Se il messaggio contiene `[CONTESTO CONTRATTO]`, il `contrattoID` è già noto. Le clausole elencate nel blocco non richiedono chiamate a tool.

3. **"Oggetto" del contratto vs clausola "Oggetto del Contratto"** — Disambiguazione esplicita: domande generiche → `getInfoContratto`, domande sul testo specifico della clausola C1 → `getClausolaContratto`. Il modello non deve indovinare dal nome/importo.

4. **Codice clausola ambiguo** — Quando `ambiguo:true`: non scegliere, mostrare candidati, aspettare risposta utente, poi richiamare con `clausolaID`.

5. **Anti-allucinazione** — Ogni numero di versione, ID, testo, stato deve provenire da un tool o dal blocco `[CONTESTO...]`. Mai inventare dati. Se tool ritorna errore → dirlo all'utente.

6. **Formato ID** — Mostrare sempre solo i primi 8 caratteri dell'UUID in maiuscolo (es. `3B849420`). Nei tool si può passare l'UUID completo.

7. **Pagina Elenco Contratti** — Se `[CONTESTO LISTA CONTRATTI]` è presente, rispondere dall'elenco nel contesto senza chiamare `getContrattiByStato` (che ignorerebbe i filtri correnti).

8. **Sola lettura** — Il modello non può creare/modificare/eliminare dati, solo suggerire testi.

---

## 4. Embeddings — `text-embedding-3-small`

Il progetto usa un solo modello di embedding: **`text-embedding-3-small`** di OpenAI. Viene chiamato sempre tramite [`openai-module.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/modules/openai-module.js#L120-L127):

```js
async function embeddings(testi) {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: testi  // array di stringhe → batch
  });
  return response.data.map(d => d.embedding);  // array di vettori float[]
}
```

### Dove vengono usati gli embedding

#### a) Embedding per clausola versione — [`embedding-utils.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/embedding-utils.js)
Ogni volta che viene creata una nuova `ClausolaVersione` (hook `after CREATE`), l'embedding del testo viene calcolato in background e salvato come JSON nella colonna `ClausolaVersione.embedding`:

```js
computeAndSaveEmbedding(v.ID, v.testo)  // fire-and-forget, non blocca la risposta
```

Questo abilita la ricerca semantica tramite il tool `cercaClausoleSemantiche`.

#### b) Embedding medio del documento — [`riferimento-matcher.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/riferimento-matcher.js)
Per trovare automaticamente il template più simile a un contratto caricato:
1. Si calcolano gli embedding di tutte le clausole estratte dal documento
2. Si fa la **media aritmetica** dei vettori → "embedding medio del documento"
3. Si confronta per cosine similarity con `TemplateVersion.embeddingDocumento` di ogni template
4. Si prende una shortlist dei top-3 per similarity
5. Su questi 3 si fa un'analisi clausola-per-clausola (coverage reale)
6. Vince il template con coverage maggiore; a parità, similarity più alta

#### c) Matching clausole durante import — [`ai-import.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/ai-import.js)
Quando si importa un file e si confrontano le clausole estratte con quelle del template:
1. Si calcolano gli embedding di tutte le clausole estratte + dei candidati template in un **unico batch**
2. Si calcola la cosine similarity clausola-per-clausola
3. Soglie decisionali:

| Similarity | Stato assegnato |
|---|---|
| ≥ 0.92 | `RIUSATA` (testo identico) o `MODIFICATA` (testo diverso ma semanticamente uguale) |
| 0.75 – 0.92 | `MODIFICATA` (variante) |
| < 0.75 | `NUOVA` (clausola non presente nel template) |

---

## 5. Classificazione Allegati — [`allegato-classifier.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/allegato-classifier.js)

La classificazione usa una **pipeline a due stadi**: prima embedding, poi LLM come fallback.

### Pipeline

```
testo allegato
      │
      ▼
[Stadio 1] Embedding + cosine similarity
      │
      ├─ calcola embedding del testo corrente
      │
      ├─ confronta con pool di riferimento:
      │     • embedding statici (uno per tipo, da testoRiferimento in tipologie-allegato.js)
      │     └── embedding da esempi salvati nel DB (EsempioClassificazione)  ← feedback umano
      │
      ├─ bestSim >= SOGLIA_TIPO_ALLEGATO?
      │         YES → ritorna { tipo, confidenza: bestSim, metodoRiconoscimento: 'embedding' }
      │
      └─ NO
            │
            ▼
      [Stadio 2] Fallback LLM — _classificaConLLM(testo)
            │
            ▼
      chatJSON(systemPrompt, testo.slice(0, 6000))
            │  → { "tipo": "DURC", "confidenza": 0.85 }
            └─ ritorna { tipo, confidenza, metodoRiconoscimento: 'llm' }
```

### Pool di embedding per la classificazione

Il pool è costruito al volo e **memorizzato in cache in memoria** (`_embeddingsRiferimentoCache`):

- **Embedding statici**: ogni tipo in `TIPOLOGIE_ALLEGATO` ha un `testoRiferimento` (stringa descrittiva del documento tipo). Al primo utilizzo vengono embeddati tutti in batch.
- **Esempi dal DB**: tabella `EsempioClassificazione` — gli utenti possono correggere classificazioni errate; il feedback viene embeddato e aggiunto al pool, migliorando la classificazione nel tempo.

### Prompt del classificatore LLM

```
System: Sei un classificatore di documenti amministrativi/contrattuali. 
        Data una delle seguenti categorie, oppure "ALTRO" se nessuna è pertinente, 
        rispondi in JSON con { "tipo": "<CHIAVE>", "confidenza": <0-1> }.
        Categorie:
        DURC: DURC (Documento Unico di Regolarità Contributiva)
        DURF: DURF (Documento Unico Regolarità Fiscale)
        CAMERA_COMMERCIO: Visura Camera di Commercio
        ... (tutte le tipologie)
        ALTRO: nessuna delle precedenti

User: <testo allegato, troncato a 6000 char>
```

---

## 6. Estrazione Campi Strutturati — [`allegato-extractor.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/allegato-extractor.js)

Dopo la classificazione, per ogni tipo di allegato si estraggono i campi strutturati definiti in `TIPOLOGIE_ALLEGATO.campiChiave` (es. per un DURC: `numeroProtocollo`, `denominazione`, `scadenzaValidita`, ecc.).

### Tipologie di campi

| Tipo campo | Come viene valorizzato |
|---|---|
| Campo normale | Chiesto al LLM nel batch |
| `staticValue` | Valore fisso definito in configurazione (mai chiesto al modello) |
| `dynamic: 'riconosciTemplateContrattuale'` | Motore dedicato, non LLM generico |

### Prompt per estrazione campi

```
System: Sei un estrattore di dati da documenti amministrativi/contrattuali italiani (<tipo>).
        Dal testo fornito estrai ESATTAMENTE questi campi.
        Per ciascun campo rispondi con un oggetto:
        { "valore": <stringa o numero o null>, "confidenza": <0-1>, 
          "testoOriginale": <porzione di testo letterale da cui è ricavato il valore> }.
        Usa valore null e confidenza 0 se il campo non è presente nel testo, 
        non inventare mai valori. Rispondi in JSON con un oggetto che ha come chiavi:
        - numeroProtocollo: Numero Protocollo INAIL/INPS del documento
        - scadenzaValidita: Scadenza validità del documento, formato ISO YYYY-MM-DD
        - ...

User: <testo allegato, troncato a 8000 char>
```

Il campo `testoOriginale` è una scelta progettuale importante: per date riformattate in ISO o importi normalizzati, il valore normalizzato non compare letteralmente nel PDF. Il `testoOriginale` permette di localizzare la posizione nel documento (bounding box nel PDF) cercando la stringa verbatim anziché il valore normalizzato.

---

## 7. Segmentazione Clausole — [`ai-import.js`](file:///Users/emiliocasella/Desktop/contratti-attivi/srv/lib/ai-import.js)

Quando si importa un documento (PDF/DOCX), il testo viene estratto e inviato all'LLM per la segmentazione in clausole numerate:

```
System: Sei un assistente che segmenta un documento contrattuale italiano in clausole numerate.
        Rispondi SOLO con un oggetto JSON nella forma:
        { "clausole": [ { "numero": <intero progressivo>, "titolo": <stringa breve>, 
                          "testo": <testo completo della clausola> } ] }.
        Se il documento non contiene clausole riconoscibili, rispondi con { "clausole": [] }.

User: <testo grezzo del documento>
```

Se l'LLM fallisce o non produce clausole, c'è un fallback a un parser regex (`import-handler.js`) che fa pattern matching su numerazioni testuali.

### Estrazione testo — filtri sul PDF

L'estrazione da PDF (`estraiTestoPdf`) usa `pdfjs-dist` e include filtri non banali:
- **Testo ruotato** (`_eRuotato`): scartato (timbri, filigrane diagonali tipo "Click to BUY NOW!")
- **Righe indice** (`_eRigaIndice`): linee di puntini `........... 2` scartate
- **Righe link** (`_eRigaLink`): URL isolati, watermark di PDF editor
- **Intestazioni ripetute** (`_rimuoviRigheRipetute`): righe identiche su più pagine (es. header/footer) mantenute solo alla prima occorrenza
- **Spaziatura tra item** (`_serveSpazioTra`): usa la posizione X del testo (dalle matrici di trasformazione PDF) per decidere se inserire uno spazio tra due item adiacenti

---

## 8. Ricerca Semantica Clausole (tool chatbot)

Il tool `cercaClausoleSemantiche` in `db-operation.js`:
1. Calcola l'embedding della query dell'utente
2. Carica tutti i record `ClausolaVersione` che hanno `embedding != null`
3. Calcola cosine similarity tra la query e ogni versione
4. Ritorna le clausole sopra la soglia (default 0.75) ordinate per similarity

```js
const [embeddingQuery] = await openai.embeddings([testo]);
// ...per ogni ClausolaVersione con embedding salvato:
const sim = cosineSimilarity(embeddingQuery, JSON.parse(v.embedding));
```

---

## Schema riassuntivo dei modelli usati

| Modello | Dove | Scopo |
|---|---|---|
| `gpt-4o-mini` (Assistants) | `agente-service.js` | Chatbot con function calling |
| `gpt-4o-mini` (chat) | `ai-import.js` | Segmentazione clausole da documento |
| `gpt-4o-mini` (chatJSON) | `allegato-classifier.js` | Classificazione allegato (fallback LLM) |
| `gpt-4o-mini` (chatJSON) | `allegato-extractor.js` | Estrazione campi strutturati |
| `text-embedding-3-small` | `embedding-utils.js` | Embedding per clausola versione (ricerca semantica) |
| `text-embedding-3-small` | `allegato-classifier.js` | Pool per classificazione allegati |
| `text-embedding-3-small` | `riferimento-matcher.js` | Template matching automatico |
| `text-embedding-3-small` | `ai-import.js` | Matching clausole estratte vs template (import) |
| `text-embedding-3-small` | `classificazione-esempi.js` | Feedback utente → embedding → pool classificazione |
