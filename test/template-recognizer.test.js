const mockEmbeddings = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({ embeddings: (...args) => mockEmbeddings(...args) }));

function vettoreOneHot(indice, lunghezza) {
  const v = new Array(lunghezza).fill(0);
  v[indice] = 1;
  return v;
}

describe('template-recognizer', () => {
  let riconosciTemplateContrattuale;

  beforeEach(() => {
    mockEmbeddings.mockReset();
    jest.resetModules();
    ({ riconosciTemplateContrattuale } = require('../srv/lib/template-recognizer'));
  });

  it('ritorna "Template Banca" quando il testo è molto simile al riferimento CGC/CPC', async () => {
    mockEmbeddings.mockResolvedValueOnce([[1, 0, 0]]); // embedding riferimento
    mockEmbeddings.mockResolvedValueOnce([[1, 0, 0]]); // embedding testo, identico -> similarity 1.0

    const testoLungo = 'Contratto di appalto per servizi ICT conforme alle Condizioni Generali di Contratto del Gruppo Bancario Cooperativo Iccrea. '.repeat(5);
    const { valore, confidenza } = await riconosciTemplateContrattuale(testoLungo);

    expect(valore).toBe('Template Banca');
    expect(confidenza).toBeCloseTo(1.0);
  });

  it('ritorna "Template Fornitore" quando il testo è sostanzioso ma poco simile al riferimento', async () => {
    mockEmbeddings.mockResolvedValueOnce([[1, 0, 0]]);
    mockEmbeddings.mockResolvedValueOnce([[0, 1, 0]]); // ortogonale -> similarity 0

    const testoLungo = 'Master Service Agreement between Supplier and Customer governing the provision of cloud services. '.repeat(5);
    const { valore, confidenza } = await riconosciTemplateContrattuale(testoLungo);

    expect(valore).toBe('Template Fornitore');
    expect(confidenza).toBeCloseTo(0);
  });

  it('ritorna "Non Determinabile" per testo troppo corto, senza chiamare le embeddings', async () => {
    const { valore, confidenza } = await riconosciTemplateContrattuale('Testo breve.');
    expect(valore).toBe('Non Determinabile');
    expect(confidenza).toBeNull();
    expect(mockEmbeddings).not.toHaveBeenCalled();
  });

  it('ritorna "Non Determinabile" se le embeddings falliscono', async () => {
    mockEmbeddings.mockRejectedValueOnce(new Error('rete non disponibile'));
    const testoLungo = 'Testo di prova sufficientemente lungo per superare la soglia minima di caratteri richiesta. '.repeat(3);
    const { valore, confidenza } = await riconosciTemplateContrattuale(testoLungo);
    expect(valore).toBe('Non Determinabile');
    expect(confidenza).toBeNull();
  });
});
