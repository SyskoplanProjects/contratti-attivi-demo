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
});
