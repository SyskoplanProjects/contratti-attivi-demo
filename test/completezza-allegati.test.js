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

describe('verificaCompletezza — allegati attesi per CONTRATTO (RF4)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('ritorna tutti gli allegati attesi con presente:true se classificati', async () => {
    const attesi = ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G'];
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      allegati: attesi.map((tipo, i) => ({ filename: tipo + '.pdf', tipo }))
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.attesi).toHaveLength(9);
    expect(resp.data.attesi.every(a => a.presente)).toBe(true);
    expect(resp.data.percentuale).toBe(100);
  });

  it('segna come assenti gli allegati non classificati', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto2.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      allegati: [{ filename: 'cgc.pdf', tipo: 'CGC' }]
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const cgc = resp.data.attesi.find(a => a.allegatoAtteso === 'CGC');
    const b = resp.data.attesi.find(a => a.allegatoAtteso === 'ALLEGATO_B');
    expect(cgc.presente).toBe(true);
    expect(cgc.filename).toBe('cgc.pdf');
    expect(b.presente).toBe(false);
    expect(resp.data.percentuale).toBeGreaterThan(0);
    expect(resp.data.percentuale).toBeLessThan(100);
  });

  it('senza allegati ritorna tutti assenti e percentuale 0', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto3.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100
    });

    const resp = await POST('/comparator/verificaCompletezza', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.attesi.every(a => !a.presente)).toBe(true);
    expect(resp.data.percentuale).toBe(0);
  });

  it('reject 410 se la preview non esiste', async () => {
    await expect(POST('/comparator/verificaCompletezza', { previewID: cds.utils.uuid() }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 410 } });
  });
});
