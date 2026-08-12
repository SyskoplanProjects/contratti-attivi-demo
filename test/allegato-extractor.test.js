const mockChatJSON = jest.fn();
const mockEmbeddings = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({
  chatJSON: (...args) => mockChatJSON(...args),
  embeddings: (...args) => mockEmbeddings(...args)
}));

const { estraiCampiAllegato, trovaPosizioneClausole } = require('../srv/lib/allegato-extractor');

describe('allegato-extractor — confidenza per campo', () => {
  beforeEach(() => {
    mockChatJSON.mockReset();
    mockEmbeddings.mockReset();
  });

  it('ritorna un array di metadati con valore e confidenza per campo richiesto al modello', async () => {
    mockChatJSON.mockResolvedValueOnce({
      numeroProtocollo: { valore: 'INAIL-123', confidenza: 0.95 },
      denominazione: { valore: 'Acme S.p.A.', confidenza: 0.88 },
      codiceFiscale: { valore: null, confidenza: 0 },
      sedeLegale: { valore: 'Via Roma 1', confidenza: 0.7 },
      dataRichiesta: { valore: '2026-01-10', confidenza: 0.9 },
      scadenzaValidita: { valore: '2026-05-10', confidenza: 0.85 },
      esito: { valore: 'REGOLARE', confidenza: 0.99 }
    });

    const { metadati, dataScadenza } = await estraiCampiAllegato('DURC', 'Testo del DURC di prova.');

    expect(metadati).toHaveLength(7);
    const denom = metadati.find(m => m.campo === 'denominazione');
    expect(denom.valore).toBe('Acme S.p.A.');
    expect(denom.confidenza).toBeCloseTo(0.88);
    expect(denom.etichetta).toBe('Denominazione');
    const cf = metadati.find(m => m.campo === 'codiceFiscale');
    expect(cf.valore).toBeNull();
    expect(dataScadenza).toBe('2026-05-10');
  });

  it('per il tipo CONTRATTO esclude i campi dynamic (es. templateContrattuale) dalla richiesta al modello', async () => {
    mockChatJSON.mockResolvedValueOnce(
      Object.fromEntries(['titoloContratto', 'fornitore'].map(c => [c, { valore: 'x', confidenza: 0.5 }]))
    );
    mockEmbeddings.mockResolvedValue([[1, 0, 0]]); // qualunque valore: il testo di prova è troppo corto (< 100 caratteri), riconosciTemplateContrattuale non arriva a chiamare le embeddings

    const { metadati } = await estraiCampiAllegato('CONTRATTO', 'Testo contratto di prova.');
    const template = metadati.find(m => m.campo === 'templateContrattuale');
    expect(template.valore).toBe('Non Determinabile');
    expect(template.confidenza).toBeNull();

    const promptInviato = mockChatJSON.mock.calls[0][0];
    expect(promptInviato).not.toContain('templateContrattuale:');
  });

  it('ritorna metadati vuoti se il testo è vuoto o il tipo non esiste', async () => {
    const r1 = await estraiCampiAllegato('CONTRATTO', '');
    expect(r1.metadati).toEqual([]);
    const r2 = await estraiCampiAllegato('TIPO_INESISTENTE', 'testo');
    expect(r2.metadati).toEqual([]);
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('gestisce una risposta del modello malformata senza lanciare eccezioni', async () => {
    mockChatJSON.mockResolvedValueOnce({ denominazione: 'stringa invece di oggetto' });
    const { metadati } = await estraiCampiAllegato('DURC', 'Testo.');
    const denom = metadati.find(m => m.campo === 'denominazione');
    expect(denom.valore).toBeNull();
    expect(denom.confidenza).toBe(0);
  });
});

describe('allegato-extractor — posizione (bbox) per campo', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('calcola la posizione per un campo il cui valore compare esattamente nel testo posizionato', async () => {
    mockChatJSON.mockResolvedValueOnce({
      numeroProtocollo: { valore: 'INAIL-123', confidenza: 0.95 },
      denominazione: { valore: 'Acme S.p.A.', confidenza: 0.88 },
      codiceFiscale: { valore: null, confidenza: 0 },
      sedeLegale: { valore: 'Via Roma 1', confidenza: 0.7 },
      dataRichiesta: { valore: '2026-01-10', confidenza: 0.9 },
      scadenzaValidita: { valore: '2026-05-10', confidenza: 0.85 },
      esito: { valore: 'REGOLARE', confidenza: 0.99 }
    });

    const testo = 'Documento DURC. Numero Protocollo INAIL-123. Denominazione: Acme S.p.A.';
    const testoPosizionato = {
      testo,
      items: [
        { testo: 'INAIL-123', pagina: 1, x: 100, y: 200, width: 60, height: 12, offsetInizio: testo.indexOf('INAIL-123'), offsetFine: testo.indexOf('INAIL-123') + 'INAIL-123'.length },
        { testo: 'Acme S.p.A.', pagina: 1, x: 100, y: 220, width: 80, height: 12, offsetInizio: testo.indexOf('Acme S.p.A.'), offsetFine: testo.indexOf('Acme S.p.A.') + 'Acme S.p.A.'.length }
      ]
    };

    const { metadati } = await estraiCampiAllegato('DURC', testo, testoPosizionato);

    const numProtocollo = metadati.find(m => m.campo === 'numeroProtocollo');
    expect(numProtocollo.posizione).toEqual({ pagina: 1, x: 100, y: 200, width: 60, height: 12 });

    const denom = metadati.find(m => m.campo === 'denominazione');
    expect(denom.posizione).toEqual({ pagina: 1, x: 100, y: 220, width: 80, height: 12 });

    const cf = metadati.find(m => m.campo === 'codiceFiscale');
    expect(cf.posizione).toBeNull();
  });

  it('ritorna posizione null per ogni campo quando testoPosizionato non è passato (retrocompatibilità)', async () => {
    mockChatJSON.mockResolvedValueOnce({
      numeroProtocollo: { valore: 'INAIL-123', confidenza: 0.95 },
      denominazione: { valore: 'Acme S.p.A.', confidenza: 0.88 },
      codiceFiscale: { valore: null, confidenza: 0 },
      sedeLegale: { valore: 'Via Roma 1', confidenza: 0.7 },
      dataRichiesta: { valore: '2026-01-10', confidenza: 0.9 },
      scadenzaValidita: { valore: '2026-05-10', confidenza: 0.85 },
      esito: { valore: 'REGOLARE', confidenza: 0.99 }
    });

    const { metadati } = await estraiCampiAllegato('DURC', 'Testo del DURC di prova.');
    metadati.forEach(m => expect(m.posizione).toBeNull());
  });

  it('ritorna posizione null (nessuna evidenziazione) se il valore non è trovato nel testo posizionato', async () => {
    mockChatJSON.mockResolvedValueOnce({
      numeroProtocollo: { valore: 'VALORE-NON-NEL-TESTO', confidenza: 0.95 },
      denominazione: { valore: null, confidenza: 0 },
      codiceFiscale: { valore: null, confidenza: 0 },
      sedeLegale: { valore: null, confidenza: 0 },
      dataRichiesta: { valore: null, confidenza: 0 },
      scadenzaValidita: { valore: null, confidenza: 0 },
      esito: { valore: null, confidenza: 0 }
    });

    const testo = 'Documento DURC senza il valore atteso.';
    const { metadati } = await estraiCampiAllegato('DURC', testo, { testo, items: [] });

    const numProtocollo = metadati.find(m => m.campo === 'numeroProtocollo');
    expect(numProtocollo.posizione).toBeNull();
  });
});

describe('trovaPosizioneClausole — evidenziazione clausole in anteprima PDF', () => {
  // items costruiti riga per riga: ogni riga del testo diventa un item pdf.js con la propria y,
  // così il box calcolato (min/max su x/y/width/height degli item coinvolti) riflette davvero
  // quali righe sono state incluse.
  function itemsPerRighe(testo) {
    const items = [];
    let y = 0;
    let offset = 0;
    testo.split('\n').forEach(riga => {
      if (riga.length) {
        items.push({ testo: riga, pagina: 1, x: 10, y, width: riga.length * 5, height: 12, offsetInizio: offset, offsetFine: offset + riga.length });
      }
      offset += riga.length + 1; // +1 per il \n
      y += 15;
    });
    return items;
  }

  it('bug reale: il corpo intero non combacia (rumore tra le due pipeline pdf.js) -> con il prefisso breve trova comunque il box', () => {
    // testoPosizionato contiene un numero di pagina a metà clausola (oltre i primi 120 caratteri,
    // fuori dalla finestra del prefisso) che la pipeline di estrazione clausole invece filtra via
    // (vedi ai-import.js#estraiTestoPdf): il corpo intero salvato in c.testo non esiste mai
    // letteralmente in questo testo, ma il solo INIZIO sì.
    const inizioComune = 'Corpo primo articolo con testo giuridico reale che si estende per diverse decine di parole prima di arrivare a un punto rilevante del documento.';
    const fineComune = 'Da qui il contenuto prosegue fino alla fine naturale della clausola qui.';
    expect(inizioComune.length).toBeGreaterThan(120); // garantisce che il rumore sotto sia fuori dal prefisso cercato

    const testo = inizioComune + '\n2\n' + fineComune;
    const testoPosizionato = { testo, items: itemsPerRighe(testo) };
    const clausole = [{ numero: 1, testo: inizioComune + '\n' + fineComune }]; // "2" (rumore) filtrato dalla pipeline clausole

    const posizioni = trovaPosizioneClausole(clausole, testoPosizionato);

    expect(posizioni[0]).not.toBeNull();
    expect(posizioni[0].pagina).toBe(1);
  });

  it('bug reale: c.testo include la riga di titolo dell\'articolo successivo (taglio ad ancora) -> il box non la include', () => {
    const testo = 'Corpo primo articolo qui.\nArticolo 2 - Corpo lungo\nCorpo secondo articolo qui.';
    const testoPosizionato = { testo, items: itemsPerRighe(testo) };
    // Come prodotto da estraiClausoleAI: il taglio si ferma all'inizio del CORPO dell'articolo 2,
    // quindi la clausola 1 include in coda la riga di titolo "Articolo 2 - Corpo lungo".
    const clausole = [
      { numero: 1, testo: 'Corpo primo articolo qui.\nArticolo 2 - Corpo lungo' },
      { numero: 2, testo: 'Corpo secondo articolo qui.' }
    ];

    const posizioni = trovaPosizioneClausole(clausole, testoPosizionato);

    const yTitoloArticolo2 = testoPosizionato.items.find(it => it.testo === 'Articolo 2 - Corpo lungo').y;
    // Il box della clausola 1 si ferma prima della riga di titolo dell'articolo 2, non la include
    // come faceva la ricerca sull'intero corpo (che conteneva quella riga in coda).
    expect(posizioni[0].y + posizioni[0].height).toBeLessThanOrEqual(yTitoloArticolo2);
  });

  it('nessun match per il prefisso -> null, non blocca le altre clausole', () => {
    const testo = 'Corpo primo articolo qui.\nCorpo secondo articolo qui.';
    const testoPosizionato = { testo, items: itemsPerRighe(testo) };
    const clausole = [
      { numero: 1, testo: 'Testo completamente diverso, mai presente nel documento.' },
      { numero: 2, testo: 'Corpo secondo articolo qui.' }
    ];

    const posizioni = trovaPosizioneClausole(clausole, testoPosizionato);

    expect(posizioni[0]).toBeNull();
    expect(posizioni[1]).not.toBeNull();
  });

  it('testoPosizionato assente -> null per tutte, non lancia eccezioni', () => {
    const posizioni = trovaPosizioneClausole([{ numero: 1, testo: 'Testo.' }], null);
    expect(posizioni).toEqual([null]);
  });
});
