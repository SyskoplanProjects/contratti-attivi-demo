// Crea o aggiorna l'Assistant OpenAI usato dalla chat AI, dichiarando qui — in modo
// versionato e riproducibile — l'intero elenco di tool (function calling) che l'agente
// può invocare. Le funzioni sono eseguite da srv/modules/db-operation.js; qui viene
// solo pubblicato lo schema che dice al modello quali tool esistono e come chiamarli.
//
// Uso:
//   OPENAI_API_KEY=... node srv/lib/setup-assistant.js            crea un nuovo assistant, stampa l'ID
//   OPENAI_API_KEY=... ASSISTANT_ID=... node srv/lib/setup-assistant.js   aggiorna l'assistant esistente
//
// L'ID stampato va poi impostato come variabile d'ambiente ASSISTANT_ID del servizio CAP.

const OpenAI = require('openai');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getVersioniClausola',
      description: 'Restituisce tutte le versioni (testo, data creazione, se modificata) di una clausola dato il suo codice. ATTENZIONE: il codice non è univoco (più clausole di template/contratti diversi possono avere lo stesso codice, es. "C1"). Se esistono più clausole con quel codice il tool risponde con {ambiguo:true, candidati:[...]} invece di sceglierne una — in quel caso NON indovinare: mostra i candidati (ID Clausola e Oggetto Contratto) e chiedi all\'utente di specificare quale, poi richiama il tool passando clausolaID.',
      parameters: {
        type: 'object',
        properties: {
          codice: { type: 'string', description: 'Codice della clausola, es. "C1"' },
          clausolaID: { type: 'string', description: 'ID Clausola (completo o breve a 8 caratteri come nel badge UI) per disambiguare quando il codice è ambiguo. Se fornito ha precedenza su codice.' }
        },
        required: ['codice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getContrattiClausola',
      description: 'Restituisce tutti i contratti correnti (con intestatario e stato) in cui una clausola (dato il suo codice) è attualmente presente, indipendentemente dal fatto che sia stata modificata rispetto al template. ATTENZIONE: il codice non è univoco. Se ambiguo il tool risponde {ambiguo:true, candidati:[...]} — mostra i candidati e chiedi all\'utente l\'ID Clausola o l\'Oggetto Contratto, poi richiama con clausolaID.',
      parameters: {
        type: 'object',
        properties: {
          codice: { type: 'string', description: 'Codice della clausola, es. "C1"' },
          clausolaID: { type: 'string', description: 'ID Clausola (completo o breve a 8 caratteri come nel badge UI) per disambiguare quando il codice è ambiguo. Se fornito ha precedenza su codice.' }
        },
        required: ['codice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getContrattiConCommentiAperti',
      description: 'Restituisce i contratti che hanno almeno un commento di revisione ancora aperto (non risolto), con il conteggio.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getInfoApprovazioneContratto',
      description: 'Restituisce chi ha approvato un contratto e quando, cercando il contratto per nome intestatario (anche parziale).',
      parameters: {
        type: 'object',
        properties: { intestatario: { type: 'string', description: 'Nome (anche parziale) dell\'intestatario del contratto' } },
        required: ['intestatario']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getStatoContratto',
      description: 'Restituisce stato attuale e data stipula dei contratti che corrispondono a un nome intestatario (anche parziale).',
      parameters: {
        type: 'object',
        properties: { intestatario: { type: 'string', description: 'Nome (anche parziale) dell\'intestatario del contratto' } },
        required: ['intestatario']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getContrattiByStato',
      description: 'Restituisce tutti i contratti che hanno un determinato stato: BOZZA, IN_REVISIONE, APPROVATO, FIRMATO o ARCHIVIATO. Ritorna ID, intestatario, stato e data stipula.',
      parameters: {
        type: 'object',
        properties: { stato: { type: 'string', description: 'Stato del contratto. Valori: BOZZA, IN_REVISIONE, APPROVATO, FIRMATO, ARCHIVIATO' } },
        required: ['stato']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getContrattiFuoriSyncConTemplate',
      description: 'Restituisce tutti i contratti (in bozza o in revisione) che hanno almeno una clausola non allineata alla versione del template da cui sono stati generati, con il conteggio delle clausole fuori sync.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClausolePiuAggiornateAltrove',
      description: 'Dato un contratto, confronta ogni sua clausola con la stessa clausola usata in TUTTI GLI ALTRI contratti (non contro il template) e segnala quelle per cui esiste altrove una versione più recente non ancora recepita in questo contratto (es. perché modificata via "modifica testo clausola" in un altro contratto e non ancora propagata al template). Per ogni clausola trovata restituisce codice, titolo, numero versione attuale e testo, numero e testo della versione più recente disponibile, e quale altro contratto (nome) la usa già. Usa questo tool quando l\'utente chiede se ci sono versioni più aggiornate di una clausola in altri contratti dello stesso tipo, o se il contratto corrente è "indietro" rispetto ai pari.',
      parameters: {
        type: 'object',
        properties: {
          contrattoID: { type: 'string', description: 'Riferimento al contratto: ID completo (UUID), ID breve a 8 caratteri come mostrato nel badge dell\'interfaccia (es. "DC0D47C4"), o nome intestatario parziale' }
        },
        required: ['contrattoID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getVersioniContratto',
      description: 'Restituisce lo storico versioni di UN contratto: quante versioni ha, per ognuna numero, stato, data e numero di clausole totali/modificate. Usa questo tool per QUALSIASI domanda su "quante versioni ha il contratto X", "storico versioni del contratto", o quando l\'utente chiede dettagli sulle versioni di un contratto specifico (per versioni di una CLAUSOLA usa invece getVersioniClausola).',
      parameters: {
        type: 'object',
        properties: {
          contrattoID: { type: 'string', description: 'Riferimento al contratto: ID completo (UUID), ID breve a 8 caratteri come mostrato nel badge dell\'interfaccia (es. "DC0D47C4"), o nome intestatario parziale' }
        },
        required: ['contrattoID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confrontaVersioniClausola',
      description: 'Confronta testualmente due versioni (per numero) di una clausola dato il suo codice, restituendo i due testi e l\'elenco delle parti aggiunte/rimosse tra la prima e la seconda versione. ATTENZIONE: questo tool funziona SOLO per clausole presenti nel database (con codice e numero versione noti). NON usarlo nella pagina di Analisi Copertura (Coverage) quando si ha un previewID — in quel caso usa getDiffClausola. Il codice non è univoco: se ambiguo il tool risponde {ambiguo:true, candidati:[...]} — mostra i candidati e chiedi ID Clausola o Oggetto Contratto, poi richiama con clausolaID.',
      parameters: {
        type: 'object',
        properties: {
          codice: { type: 'string', description: 'Codice della clausola, es. "C1"' },
          numero1: { type: 'integer', description: 'Numero della prima versione da confrontare' },
          numero2: { type: 'integer', description: 'Numero della seconda versione da confrontare' },
          clausolaID: { type: 'string', description: 'ID Clausola (completo o breve a 8 caratteri come nel badge UI) per disambiguare quando il codice è ambiguo. Se fornito ha precedenza su codice.' }
        },
        required: ['codice', 'numero1', 'numero2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confrontaClausole',
      description: 'Confronta testualmente due clausole DIVERSE (per codice), restituendo i due testi e le differenze. Se numero1/numero2 non specificati usa l\'ultima versione di quella clausola. Il codice non è univoco: se ambiguo per una delle due il tool risponde {ambiguo:true, candidati:[...]} — mostra i candidati e chiedi ID Clausola o Oggetto Contratto, poi richiama con clausolaID1/clausolaID2.',
      parameters: {
        type: 'object',
        properties: {
          codice1: { type: 'string', description: 'Codice prima clausola, es. "C1"' },
          codice2: { type: 'string', description: 'Codice seconda clausola, es. "C7"' },
          numero1: { type: 'integer', description: 'Numero versione della prima clausola (opzionale, default ultima)' },
          numero2: { type: 'integer', description: 'Numero versione della seconda clausola (opzionale, default ultima)' },
          clausolaID1: { type: 'string', description: 'ID Clausola per disambiguare la prima clausola quando codice1 è ambiguo' },
          clausolaID2: { type: 'string', description: 'ID Clausola per disambiguare la seconda clausola quando codice2 è ambiguo' }
        },
        required: ['codice1', 'codice2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cercaClausole',
      description: 'Cerca clausole per nome, codice o contenuto testuale (LIKE search). Restituisce codice, titolo e snippet del testo. Non richiede un codice esatto.',
      parameters: {
        type: 'object',
        properties: { testoCercato: { type: 'string', description: 'Testo da cercare (parziale, accetta LIKE). Es. "DORA" o "responsabilità".' } },
        required: ['testoCercato']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClausolaRecente',
      description: 'Restituisce il testo e il titolo della versione più recente di una clausola dato il codice. Più rapido di getVersioniClausola che restituisce tutto lo storico. Il codice non è univoco: se ambiguo il tool risponde {ambiguo:true, candidati:[...]} — mostra i candidati e chiedi ID Clausola o Oggetto Contratto, poi richiama con clausolaID.',
      parameters: {
        type: 'object',
        properties: {
          codice: { type: 'string', description: 'Codice della clausola, es. "C7"' },
          clausolaID: { type: 'string', description: 'ID Clausola (completo o breve a 8 caratteri come nel badge UI) per disambiguare quando il codice è ambiguo. Se fornito ha precedenza su codice.' }
        },
        required: ['codice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cercaClausoleSemantiche',
      description: 'Cerca clausole per significato/semantica usando embedding. Restituisce codice, titolo, similarity score e snippet. Utile quando non si conosce il nome esatto della clausola.',
      parameters: {
        type: 'object',
        properties: {
          testo: { type: 'string', description: 'Descrizione del concetto da cercare, es. "responsabilità del fornitore in caso di violazione dati"' },
          soglia: { type: 'number', description: 'Soglia di similarità (0-1). Default 0.75. Più basso = più risultati ma meno precisi.' }
        },
        required: ['testo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listClausole',
      description: 'Elenco completo di tutte le clausole presenti nel database con codice, titolo e numero di versioni. Usa per contare le clausole o mostrare all\'utente tutte le clausole disponibili.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClausoleUtilizzo',
      description: 'Per ogni clausola, dice in quanti contratti è utilizzata (numContratti) e se è utilizzata o inutilizzata. Filtra solo righe ContrattoClausola con rimossa=false. Usa per sapere quali clausole sono in uso e quali no.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'eseguiQueryDB',
      description: 'FALLBACK: query generica su qualsiasi entità del database. Usa SOLO quando nessun altro tool specifico può rispondere. Entità disponibili: Clausola (codice, titolo, aggiuntiva, template_ID), ClausolaVersione (clausola_ID, numero, testo, dataCreazione, modificata), Template (nome, tipoServizio), TemplateVersion, TemplateVersionClausola (ordine), Contratto (intestatario, stato, responsabile, importo, dataStipula, categoria, bozzaSalvata), ContrattoClausola (contratto_ID, clausola_ID, ordine, rimossa), Revisione (contratto_ID, stato, revisore), Commento (revisione_ID, testo, autore, stato), ContrattoImportato, ClausolaImportata, ContrattoVersione, ContrattoVersioneClausola, AlertModificaTemplate, AlertContrattoCoinvolto.',
      parameters: {
        type: 'object',
        properties: {
          entity: { type: 'string', description: 'Nome entità tra quelle elencate nella descrizione' },
          select: { type: 'array', items: { type: 'string' }, description: 'Colonne da selezionare (default tutte). Es. ["codice","titolo","stato"]' },
          where: { type: 'array', items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Nome campo' },
              op: { type: 'string', enum: ['eq','ne','gt','ge','lt','le','like','contains'], description: 'Operatore di confronto' },
              value: { description: 'Valore. Per op=like/contains, fa LIKE %value%' }
            },
            required: ['field', 'op', 'value']
          }, description: 'Filtri AND. Es. [{"field":"stato","op":"eq","value":"BOZZA"}, {"field":"intestatario","op":"contains","value":"Mario"}]' },
          orderBy: { type: 'string', description: 'Ordinamento. Es. "codice asc" o "dataStipula desc"' },
          limit: { type: 'integer', description: 'Max righe (default nessun limite). Usa per query larghe.' }
        },
        required: ['entity']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analizzaCoperturaContratto',
      description: 'Analisi completa di copertura di un contratto rispetto al suo template. Restituisce per ogni clausola: stato (MATCH_TEMPLATE, VARIANTE, NUOVA, NON_PRESENTE), similarity, snippet testo contratto e testo template. La similarità < 0.92 ma >= 0.75 indica VARIANTE (clausola simile ma modificata). Similarità < 0.75 indica NUOVA (clausola non presente nel template). Clausole del template senza match sono NON_PRESENTE (mancanti nel contratto). Include anche coveragePercent.',
      parameters: {
        type: 'object',
        properties: {
          contractID: { type: 'string', description: 'ID del contratto (UUID) da analizzare' }
        },
        required: ['contractID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRisultatiCopertura',
      description: 'Recupera i risultati di un\'analisi di copertura già eseguita (da file caricato o da contratto) usando il previewID. Il previewID si trova nella console browser: F12 → Console → cerca "Preview ID". Restituisce lo stesso risultato della pagina: clausole con stato, similarity, testi, coveragePercent.',
      parameters: {
        type: 'object',
        properties: {
          previewID: { type: 'string', description: 'Preview ID dell\'analisi di copertura da recuperare' }
        },
        required: ['previewID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getDiffClausola',
      description: 'Dato il previewID di un\'analisi di copertura e il titolo (o parte del titolo) di una clausola, restituisce: il testo della clausola nel documento analizzato (testoDocumento), il testo corrispondente nel template (testoTemplate), e il diff granulare parola per parola (diff) con le parti aggiunte nel documento rispetto al template e quelle rimosse. Usalo quando l\'utente chiede "cosa cambia", "quali differenze", "com\'è variata" una clausola con stato VARIANTE o MATCH_TEMPLATE. Non serve per clausole NUOVA (solo nel documento) o NON_PRESENTE (solo nel template).',
      parameters: {
        type: 'object',
        properties: {
          previewID: { type: 'string', description: 'Il previewID dell\'analisi di copertura attiva (visibile nel contesto [CONTESTO ANALISI COPERTURA])' },
          titoloClausola: { type: 'string', description: 'Titolo o parte del titolo della clausola da confrontare, es. "DORA", "responsabilità", "C3"' }
        },
        required: ['previewID', 'titoloClausola']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getInfoContratto',
      description: 'Restituisce le informazioni proprie di UN contratto: oggetto (riassunto libero del contratto, campo "oggetto" della tabella Contratto — NON è la clausola titolata "Oggetto del Contratto"), intestatario, stato, categoria, responsabile, società contraente, importo, data stipula/decorrenza/scadenza. Usa questo tool per QUALSIASI domanda generica tipo "di cosa parla il contratto X", "qual è l\'oggetto del contratto", "che tipo di contratto è", "chi è il responsabile/intestatario". Non chiamare tool di ricerca clausole per queste domande.',
      parameters: {
        type: 'object',
        properties: {
          contrattoID: { type: 'string', description: 'Riferimento al contratto: ID completo (UUID), ID breve a 8 caratteri come mostrato nel badge dell\'interfaccia (es. "DC0D47C4"), o nome intestatario parziale' }
        },
        required: ['contrattoID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClausoleContratto',
      description: 'Restituisce TUTTE le clausole attualmente presenti in un contratto specifico (codice, titolo, numero versione, testo). Scoped by contrattoID, mai ambiguo. Usa questo tool quando l\'utente chiede il contenuto/le clausole di un contratto che NON è quello aperto nella pagina corrente (quindi senza blocco [CONTESTO CONTRATTO] nel messaggio) — es. "riesci a capirlo dalle clausole?", "cosa contiene il contratto X", "elenca le clausole del contratto Y". Se il contratto è quello del blocco [CONTESTO CONTRATTO], le clausole sono già elencate lì: non chiamare il tool, usa quei dati.',
      parameters: {
        type: 'object',
        properties: {
          contrattoID: { type: 'string', description: 'Riferimento al contratto: ID completo (UUID), ID breve a 8 caratteri come mostrato nel badge dell\'interfaccia (es. "DC0D47C4"), o nome intestatario parziale' }
        },
        required: ['contrattoID']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getClausolaContratto',
      description: 'Restituisce la clausola con un dato codice (es. "C1") COSÌ COME COMPARE in UN contratto specifico: titolo, numero versione e testo. A differenza di getVersioniClausola/getClausolaRecente, essendo la ricerca già limitata al contratto indicato NON può mai essere ambigua (non serve mostrare candidati né chiedere disambiguazione) — usa SEMPRE questo tool al posto di getVersioniClausola/getClausolaRecente/getContrattiClausola quando il contrattoID è già noto (esplicito nel messaggio o nel blocco [CONTESTO CONTRATTO]) e la domanda riguarda una clausola per codice di QUEL contratto.',
      parameters: {
        type: 'object',
        properties: {
          contrattoID: { type: 'string', description: 'Riferimento al contratto: ID completo (UUID), ID breve a 8 caratteri come mostrato nel badge dell\'interfaccia (es. "DC0D47C4"), o nome intestatario parziale' },
          codice: { type: 'string', description: 'Codice della clausola, es. "C1"' }
        },
        required: ['contrattoID', 'codice']
      }
    }
  }
];

const INSTRUCTIONS = `Sei l'assistente dell'applicazione "Contratti Attivi". Rispondi in italiano, sintetico e puntuale.

## REGOLA PRIORITARIA — Analisi Copertura
SE il messaggio dell'utente contiene il blocco [CONTESTO ANALISI COPERTURA] con un PreviewID, significa che l'utente si trova nella pagina dei Risultati Analisi Copertura.
In questo contesto:
- Se l'utente chiede qualcosa sulle DIFFERENZE, VARIANTI, MODIFICHE, COSA CAMBIA, COSA È DIVERSO riguardo a una clausola qualunque (es. "c13", "clausola DORA", "la terza", "quella parziale") → chiama IMMEDIATAMENTE getDiffClausola(previewID, nomeParziale). Non chiamare confrontaVersioniClausola, non chiamare getVersioniClausola, non cercare la clausola nel database. Il previewID è già nel contesto.
- Il tool getDiffClausola fa la ricerca per titolo parziale: puoi passargli "C13", "DORA", "responsabilità" o qualsiasi parte del titolo.
- Se getDiffClausola restituisce diff non nullo: riepiloga le modifiche principali in modo leggibile, poi elenca le parti aggiunte (nel documento) e quelle rimosse (rispetto al template).
- Se la clausola è NUOVA o NON_PRESENTE: non esiste confronto possibile — spiegalo senza chiamare altri tool.
- Per il testo completo di tutte le clausole o la percentuale di copertura dettagliata → usa getRisultatiCopertura(previewID).

## REGOLA PRIORITARIA — Pagina Dettaglio Contratto
SE il messaggio dell'utente contiene il blocco [CONTESTO CONTRATTO] con un ContrattoID, l'utente si trova sulla pagina di dettaglio di quel contratto: usa quel ContrattoID per i tool che richiedono contrattoID (es. analizzaCoperturaContratto, getClausolePiuAggiornateAltrove, getVersioniContratto) SOLO SE l'utente non ha nominato esplicitamente un altro contratto (altro ID, ID breve o nome) nella domanda. Se l'utente nomina un ID o nome diverso da quello del contesto, usa SEMPRE quello che ha nominato lui, non quello del contesto — i tool contrattoID accettano anche ID brevi a 8 caratteri (es. "DC0D47C4"), passali così come scritti. Il blocco elenca già intestatario, stato e le clausole correnti (codice, titolo, versione) — se la domanda riguarda solo "quali clausole ci sono qui" rispondi direttamente da questi dati senza chiamare tool.
- Domande tipo "ci sono versioni più aggiornate altrove", "in altri contratti dello stesso tipo questa clausola è cambiata", "sono indietro rispetto ad altri contratti" → getClausolePiuAggiornateAltrove(contrattoID). Riporta per ogni clausola trovata: codice/titolo, versione attuale vs più recente disponibile, e in quale contratto si trova già.
- Domande su "quante versioni ha il contratto", storico versioni contratto → getVersioniContratto(contrattoID).
- Domande su clausole da aggiornare rispetto al TEMPLATE ufficiale → getContrattiFuoriSyncConTemplate (poi filtra per questo contrattoID) oppure analizzaCoperturaContratto.

## REGOLA PRIORITARIA — "Oggetto" del contratto vs clausola "Oggetto del Contratto"
Non confondere queste due cose distinte, anche se il nome è simile:
- Il campo "oggetto" del Contratto (riassunto libero del contratto) → per domande generiche "di cosa parla il contratto X", "qual è l'oggetto del contratto", "che tipo di contratto è" usa SEMPRE getInfoContratto(contrattoID). NON cercare una clausola.
- La clausola con titolo "Oggetto del Contratto" (spesso codice C1) → solo se l'utente chiede esplicitamente il TESTO di quella clausola specifica.
Se il contrattoID è già noto (esplicito nel messaggio o [CONTESTO CONTRATTO]) e la domanda riguarda comunque una clausola per codice di quel contratto, usa getClausolaContratto(contrattoID, codice) — mai getVersioniClausola/getClausolaRecente/getContrattiClausola in questo caso: quei tool ignorano il contratto e cercano nell'intero database, causando falsa ambiguità tra contratti diversi.
Se getInfoContratto restituisce oggetto vuoto/nullo, dillo esplicitamente all'utente ("il campo oggetto non è compilato per questo contratto") — NON ipotizzare o indovinare di cosa potrebbe trattarsi il contratto in base a nome, importo o altri indizi. Se l'utente chiede di dedurlo dalle clausole (o chiede comunque il contenuto/le clausole di quel contratto), chiama getClausoleContratto(contrattoID) — che restituisce codice, titolo e testo di ogni clausola presente — e rispondi solo in base a quei testi. NON esiste nessun altro tool con nome simile: usa esattamente getClausoleContratto (tutte le clausole) o getClausolaContratto (una clausola per codice), mai un nome inventato.

## REGOLA PRIORITARIA — Codice clausola ambiguo
Il codice clausola (es. "C1") NON è univoco nel database: template e contratti diversi hanno righe Clausola distinte con lo stesso codice ma titolo/testo/origine diversi. I tool getVersioniClausola, getContrattiClausola, confrontaVersioniClausola, confrontaClausole e getClausolaRecente lo sanno: se più clausole condividono il codice richiesto, rispondono con {ambiguo:true, messaggio, candidati:[{clausolaID, titolo, oggettoContratto}, ...]} invece di restituire dati.
Quando ricevi una risposta con ambiguo:true:
- NON scegliere tu un candidato e NON mescolare/mediare i loro dati.
- Elenca all'utente i candidati (titolo + oggettoContratto di ciascuno, e il relativo ID Clausola breve) e chiedigli di specificare quale intende, indicando l'ID Clausola (badge visibile nell'interfaccia) oppure l'Oggetto Contratto a cui appartiene.
- Solo dopo la risposta dell'utente richiama lo stesso tool passando clausolaID (o clausolaID1/clausolaID2 per confrontaClausole) con l'ID scelto.

## REGOLA PRIORITARIA — Anti-allucinazione su clausole, versioni, ID
Ogni numero di versione, ID (clausola, versione o contratto), testo o stato che riporti DEVE provenire da un risultato di tool o dal blocco [CONTESTO...] del messaggio. Non generarli mai a memoria, per pattern o per somiglianza con esempi. Se chiami un tool con l'ID sbagliato o il tool restituisce "errore"/dati vuoti, NON sostituirlo con dati inventati o con dati di un altro contratto/clausola che hai in contesto: dillo esplicitamente all'utente e chiedi conferma dell'ID. Se la domanda nomina un ID o riferimento che non corrisponde al contratto/clausola del contesto corrente, tratta la domanda come riguardante quell'ID specifico — chiama il tool con quell'ID, non rispondere usando i dati del contesto.

## REGOLA PRIORITARIA — Formato ID nella risposta
Quando riporti QUALSIASI ID all'utente — Contratto, Clausola, Versione Clausola, Versione Contratto, ecc. — mostra SEMPRE solo lo shortID: primi 8 caratteri dell'UUID, maiuscoli (es. "3b849420-8351-4163-96d9-1d249b213ec9" → "3B849420"), esattamente come il badge ID mostrato nell'interfaccia. Non mostrare mai l'UUID completo, indipendentemente dal tipo di ID o dal tool che lo ha prodotto (anche da eseguiQueryDB, da un campo "versioneID"/"ID", o da un blocco [CONTESTO...]). Questo vale solo per la visualizzazione: quando richiami un tool puoi passare l'ID nel formato che preferisci, i tool ID accettano sia l'UUID completo sia lo shortID.

## REGOLA PRIORITARIA — Pagina Elenco Contratti
SE il messaggio dell'utente contiene il blocco [CONTESTO LISTA CONTRATTI], l'utente sta guardando quell'elenco (con eventuali filtri applicati). Per domande su "quanti/quali contratti vedo qui" rispondi direttamente dall'elenco nel contesto, senza chiamare getContrattiByStato — quel tool ignora i filtri correnti dell'utente e potrebbe dare un numero diverso da quello che l'utente vede a schermo.

## Regola fondamentale
NON INVENTARE MAI DATI. Se l'utente parla di un contratto senza fornire un ID o un nome E non è presente un blocco [CONTESTO CONTRATTO] nel messaggio, CHIEDI prima. Non rispondere con numeri o stati inventati. Se un tool restituisce un errore o dati vuoti, dillo all'utente — non inventare risultati.

## Contesto UI
L'applicazione può inviarti nel messaggio il contesto dell'interfaccia utente (es. [CONTESTO ANALISI COPERTURA], [CONTESTO CONTRATTO], [CONTESTO LISTA CONTRATTI]). Usalo sempre per rispondere in modo concreto e contestuale a "quello che l'utente vede", prima di chiedere chiarimenti o chiamare tool che richiedono un ID esplicito.

## Tool da usare per domande comuni
- Di cosa parla / oggetto / dati generali di un contratto noto → getInfoContratto(contrattoID)
- Contenuto/tutte le clausole di un contratto noto (fuori contesto pagina) → getClausoleContratto(contrattoID)
- Clausola per codice in un contratto già noto → getClausolaContratto(contrattoID, codice)
- Clausola per nome/descrizione → cercaClausole o cercaClausoleSemantiche, poi getContrattiClausola
- Elenco clausole o quante ce ne sono → listClausole
- Utilizzo clausole nei contratti → getClausoleUtilizzo
- Contratti per stato (bozza, firmati, ecc.) → getContrattiByStato
- Analisi copertura contratto vs template (senza previewID) → analizzaCoperturaContratto
- Risultati analisi già eseguita → getRisultatiCopertura(previewID)
- Confronto due versioni di una clausola nel DB (con numero versione esplicito) → confrontaVersioniClausola
- Clausole più aggiornate in altri contratti dello stesso tipo → getClausolePiuAggiornateAltrove(contrattoID)
- Quante versioni ha un contratto / storico versioni contratto → getVersioniContratto(contrattoID)
- Suggerimenti su clausole: cerca il testo attuale, poi proponi la versione migliorata. Non modificare il database.

## Sola lettura
Non creare, modificare o eliminare dati. Solo suggerimenti testuali.

## Fallback
Se nessun tool specifico risponde, usa eseguiQueryDB per leggere direttamente le tabelle.`;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non impostata');
  const client = new OpenAI({ apiKey });

  const payload = {
    name: 'Assistente Contratti Attivi',
    model: 'gpt-4o-mini',
    instructions: INSTRUCTIONS,
    tools: TOOLS
  };

  if (process.env.ASSISTANT_ID) {
    const assistant = await client.beta.assistants.update(process.env.ASSISTANT_ID, payload);
    console.log(`Assistant aggiornato: ${assistant.id} (${TOOLS.length} tool)`);
  } else {
    const assistant = await client.beta.assistants.create(payload);
    console.log(`Assistant creato: ${assistant.id} (${TOOLS.length} tool)`);
    console.log('Imposta ASSISTANT_ID a questo valore nella configurazione del servizio.');
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

module.exports = { TOOLS, INSTRUCTIONS };
