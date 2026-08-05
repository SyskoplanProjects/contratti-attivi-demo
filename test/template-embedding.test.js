const mockEmbeddings = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({
  embeddings: (...args) => mockEmbeddings(...args)
}));

const { computeDocumentoEmbedding } = require('../srv/lib/template-embedding');

describe('template-embedding', () => {
  beforeEach(() => { mockEmbeddings.mockReset(); });

  it('concatena il testo di tutte le clausole e ritorna il JSON del vettore embedding', async () => {
    mockEmbeddings.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    const risultato = await computeDocumentoEmbedding([{ testo: 'Clausola 1' }, { testo: 'Clausola 2' }]);
    expect(mockEmbeddings).toHaveBeenCalledWith(['Clausola 1\nClausola 2']);
    expect(JSON.parse(risultato)).toEqual([0.1, 0.2, 0.3]);
  });

  it('ritorna null se non ci sono clausole', async () => {
    const risultato = await computeDocumentoEmbedding([]);
    expect(risultato).toBeNull();
    expect(mockEmbeddings).not.toHaveBeenCalled();
  });

  it('ritorna null (non bloccante) se le embeddings falliscono', async () => {
    mockEmbeddings.mockRejectedValueOnce(new Error('API down'));
    const risultato = await computeDocumentoEmbedding([{ testo: 'Clausola 1' }]);
    expect(risultato).toBeNull();
  });
});
