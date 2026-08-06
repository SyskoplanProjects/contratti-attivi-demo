const path = require('path');
const cds = require('@sap/cds');

const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: (...args) => mockChatJSON(...args),
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

describe('verificaCompletezza — il documento principale caricato conta per il proprio tipo (bug reale)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('documento principale = CPC da solo (nessun allegato separato): CPC deve risultare presente', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'cpc.docx',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 0,
      documentoPrincipale: { categoria: 'CONTRATTO', sottoTipo: 'CPC', confidenza: 0.95 },
      tipiRilevati: [],
      allegati: []
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const cpc = resp.data.attesi.find(a => a.allegatoAtteso === 'CPC');
    expect(cpc.presente).toBe(true);
    expect(cpc.filename).toBe('cpc.docx');
  });

  it('fascicolo composito (un unico file con più sezioni, es. caso reale NOMIOS): tutte le tipologie rilevate contano', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'fascicolo-completo.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 0,
      documentoPrincipale: { categoria: 'CONTRATTO', sottoTipo: 'CGC', confidenza: 0.9 },
      tipiRilevati: ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_F'],
      allegati: []
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_F'].forEach(codice => {
      const esito = resp.data.attesi.find(a => a.allegatoAtteso === codice);
      expect(esito.presente).toBe(true);
    });
    ['ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_G'].forEach(codice => {
      const esito = resp.data.attesi.find(a => a.allegatoAtteso === codice);
      expect(esito.presente).toBe(false);
    });
  });

  it('un allegato separato con lo stesso tipo del documento principale non viene duplicato', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'cpc.docx',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 0,
      documentoPrincipale: { categoria: 'CONTRATTO', sottoTipo: 'CPC', confidenza: 0.95 },
      tipiRilevati: ['CPC'],
      allegati: [{ tipo: 'CPC', filename: 'cpc-allegato-separato.pdf' }]
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const righeCpc = resp.data.attesi.filter(a => a.allegatoAtteso === 'CPC');
    expect(righeCpc).toHaveLength(1);
    expect(righeCpc[0].filename).toBe('cpc-allegato-separato.pdf');
  });
});
