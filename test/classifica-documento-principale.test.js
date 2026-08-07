const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

jest.mock('../srv/lib/allegato-classifier', () => ({
  classificaAllegato: jest.fn(),
  rilevaTipiPresenti: jest.fn(() => Promise.resolve([]))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');
const { classificaAllegato } = require('../srv/lib/allegato-classifier');

describe('classificaDocumentoPrincipale', () => {
  beforeEach(() => {
    classificaAllegato.mockReset();
    classificaAllegato.mockResolvedValue({ tipo: 'CGC', confidenza: 0.9, metodoRiconoscimento: 'llm' });
  });

  it('ritorna sottoTipo CGC / categoria CONTRATTO quando classificaAllegato riconosce sotto-tipologia', async () => {
    const previewID = previewStore.put({ filename: 'contratto.pdf', testo: 'Condizioni Generali di Contratto per Servizi ICT.', clausole: [], coveragePercent: 100 });

    const res = await POST('/comparator/classificaDocumentoPrincipale', { previewID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.sottoTipo).toBe('CGC');
    expect(res.data.categoria).toBe('CONTRATTO');
    expect(res.data.confidenza).toBe(0.9);
  });

  it('ritorna sottoTipo null senza errore quando classificazione = ALTRO', async () => {
    classificaAllegato.mockResolvedValue({ tipo: 'ALTRO', confidenza: 0.3, metodoRiconoscimento: 'llm' });
    const previewID = previewStore.put({ filename: 'contratto.pdf', testo: 'Documento generico non riconoscibile.', clausole: [], coveragePercent: 100 });

    const res = await POST('/comparator/classificaDocumentoPrincipale', { previewID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.sottoTipo).toBeNull();
    expect(res.data.categoria).toBe('ALTRO');
  });

  it('reject 410 se preview inesistente', async () => {
    await expect(POST('/comparator/classificaDocumentoPrincipale', { previewID: 'inesistente' }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 410 } });
  });
});