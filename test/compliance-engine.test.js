const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  chatJSON: mockChatJSON
}));

const { verificaCompliance } = require('../srv/lib/compliance-engine');

describe('compliance-engine', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('exports verificaCompliance', () => {
    expect(typeof verificaCompliance).toBe('function');
  });

  it('chiama chatJSON con prompt system + documento, ritorna risultati', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { requisito: 'Requisito 1', esito: 'PRESENTE', dettaglio: 'Coperto alla sezione X', riferimento: 'Art. 3' }
      ]
    });

    const result = await verificaCompliance('testo documento', 'verifica requisiti DORA');

    expect(result.risultati).toHaveLength(1);
    expect(result.risultati[0].esito).toBe('PRESENTE');
    expect(mockChatJSON).toHaveBeenCalledWith(
      expect.stringContaining('verifica la conformità'),
      expect.stringContaining('testo documento')
    );
  });
});
