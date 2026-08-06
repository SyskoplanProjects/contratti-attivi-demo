const path = require('path');
const cds = require('@sap/cds');

const mockEmbeddings = jest.fn();
const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  embeddings: (...args) => mockEmbeddings(...args),
  chatJSON: (...args) => mockChatJSON(...args)
}));

const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');

function vettoreOneHot(indice, lunghezza) {
  const v = new Array(lunghezza).fill(0);
  v[indice] = 1;
  return v;
}

describe('allegato-classifier', () => {
  let classificaAllegato;

  beforeEach(() => {
    mockEmbeddings.mockReset();
    mockChatJSON.mockReset();
    // cache interna dei profili di riferimento è a livello di modulo:
    // reset per avere, ad ogni test, la prima chiamata a embeddings() dedicata ai profili.
    jest.resetModules();
    // allegato-classifier ora dipende da classificazione-esempi che usa cds.entities:
    // ri-registrare l'istanza bootstrappata da cds.test() dopo il reset.
    jest.doMock('@sap/cds', () => cds);
    ({ classificaAllegato } = require('../srv/lib/allegato-classifier'));
  });

  it('classifica sopra soglia usando la similarity con i profili di riferimento', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    // prima chiamata: embedding dei testi di riferimento (una per categoria)
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    // seconda chiamata: embedding del testo del documento, identico al profilo indice 1 (DURC)
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(1, n)]);

    const result = await classificaAllegato('Documento Unico di Regolarità Contributiva rilasciato da INPS.');

    expect(result.tipo).toBe(TIPOLOGIE_ALLEGATO[1].key);
    expect(result.metodoRiconoscimento).toBe('embedding');
    expect(result.confidenza).toBeGreaterThanOrEqual(0.75);
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('usa il fallback LLM quando nessun profilo supera la soglia', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]); // ortogonale a tutti i profili
    mockChatJSON.mockResolvedValueOnce({ tipo: 'CAMERA_COMMERCIO', confidenza: 0.6 });

    const result = await classificaAllegato('Testo generico non riconducibile a nessun profilo noto.');

    expect(mockChatJSON).toHaveBeenCalledTimes(1);
    expect(result.tipo).toBe('CAMERA_COMMERCIO');
    expect(result.metodoRiconoscimento).toBe('llm');
  });

  it('ripiega su ALTRO se anche il fallback LLM non riconosce nulla', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]);
    mockChatJSON.mockResolvedValueOnce({ tipo: 'ALTRO', confidenza: 0.2 });

    const result = await classificaAllegato('Documento non identificabile.');

    expect(result.tipo).toBe('ALTRO');
    expect(result.metodoRiconoscimento).toBe('llm');
  });

  it('ritorna ALTRO senza chiamare le API per testo vuoto', async () => {
    const result = await classificaAllegato('   ');
    expect(result.tipo).toBe('ALTRO');
    expect(mockEmbeddings).not.toHaveBeenCalled();
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('non invia testoRiferimento null/undefined a openai.embeddings', async () => {
    // Verifica che CONTRATTO abbia testoRiferimento: null
    const contratto = TIPOLOGIE_ALLEGATO.find(t => t.key === 'CONTRATTO');
    expect(contratto?.testoRiferimento).toBe(null);

    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const nConRiferimento = conRiferimento.length;

    // Prima chiamata: embedding solo delle tipologie con testoRiferimento
    mockEmbeddings.mockResolvedValueOnce(conRiferimento.map((_, i) => vettoreOneHot(i, nConRiferimento)));
    // Seconda chiamata: embedding del documento
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(0, nConRiferimento)]);
    mockChatJSON.mockResolvedValueOnce({ tipo: 'DURC', confidenza: 0.85 });

    await classificaAllegato('Documento di regolarità contributiva');

    // Verifica che il primo embeddings abbia ricevuto solo i testi che esistono
    const firstCall = mockEmbeddings.mock.calls[0];
    expect(firstCall[0]).toHaveLength(nConRiferimento);
    expect(firstCall[0]).not.toContain(null);
    expect(firstCall[0]).not.toContain(undefined);
  });
});

const { POST } = cds.test(path.join(__dirname, '..'));

describe('classificaAllegato — pool esteso con esempi reali', () => {
  beforeEach(() => {
    mockEmbeddings.mockReset();
    jest.resetModules();
    // jest.resetModules() svuota anche @sap/cds dal registry: lo ri-registriamo
    // con doMock così classificazione-esempi.js riusa l'istanza bootstrappata da
    // cds.test() (entity EsempioClassificazione + DB in-memory già deployati).
    jest.doMock('@sap/cds', () => cds);
  });

  it('un esempio reale salvato per MAIL vince sul best-match statico quando più simile', async () => {
    // Baseline statica: ogni testoRiferimento riceve un embedding "neutro" [0,0,1]
    // (nessuno supera la soglia 0.75 da solo). L'esempio reale per MAIL riceve [1,0,0],
    // identico al documento da classificare: deve vincere lui.
    mockEmbeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => [0, 0, 1])));

    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);

    const { salvaEsempio } = require('../srv/lib/classificazione-esempi');
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve([[1, 0, 0]])); // embedding esempio salvato
    await salvaEsempio({
      categoria: 'MAIL', sottoTipo: null, testo: 'Da: mario@acme.it Oggetto: rinnovo',
      fonte: 'correzione', categoriaProposta: 'ODA', confidenzaProposta: 0.5
    });

    const { classificaAllegato } = require('../srv/lib/allegato-classifier');
    // Ordine chiamate dentro classificaAllegato: prima i testiRiferimento statici (pool),
    // poi il documento. Quindi: once per i riferimenti statici, poi once per il documento.
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve(conRiferimento.map(() => [0, 0, 1]))); // embedding riferimenti statici
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve([[1, 0, 0]])); // embedding documento da classificare
    const risultato = await classificaAllegato('Da: luigi@fornitore.it Oggetto: proroga contratto');

    expect(risultato.tipo).toBe('MAIL');
    expect(risultato.metodoRiconoscimento).toBe('embedding');
  });
});

describe('rilevaTipiPresenti — fascicolo con più tipologie concatenate in un unico file', () => {
  let rilevaTipiPresenti;

  beforeEach(() => {
    mockEmbeddings.mockReset();
    mockChatJSON.mockReset();
    jest.resetModules();
    jest.doMock('@sap/cds', () => cds);
    ({ rilevaTipiPresenti } = require('../srv/lib/allegato-classifier'));
  });

  it('ritorna tutte le tipologie riconosciute (caso reale: OdA+CGC+CPC+Allegati in un solo PDF)', async () => {
    mockChatJSON.mockResolvedValueOnce({ tipiPresenti: ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_F'] });

    const risultato = await rilevaTipiPresenti('Testo lungo del fascicolo completo...');

    expect(risultato).toEqual(['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_F']);
    expect(mockEmbeddings).not.toHaveBeenCalled();
  });

  it('scarta chiavi non valide e deduplica', async () => {
    mockChatJSON.mockResolvedValueOnce({ tipiPresenti: ['CGC', 'CGC', 'CHIAVE_INESISTENTE', 'MAIL'] });

    const risultato = await rilevaTipiPresenti('Testo.');

    // MAIL è una macro-categoria, non una sottoTipologia: non deve comparire tra i risultati.
    expect(risultato).toEqual(['CGC']);
  });

  it('testo vuoto -> nessuna chiamata, array vuoto', async () => {
    const risultato = await rilevaTipiPresenti('');
    expect(risultato).toEqual([]);
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('fallback ad array vuoto se la chiamata LLM fallisce', async () => {
    mockChatJSON.mockRejectedValueOnce(new Error('LLM down'));
    const risultato = await rilevaTipiPresenti('Testo.');
    expect(risultato).toEqual([]);
  });
});
