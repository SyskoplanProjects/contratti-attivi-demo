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

const { ARTICOLI_CRITICI } = require('../srv/lib/deroghe-engine');
const NUM_ARTICOLI = ARTICOLI_CRITICI.length; // 19 articoli vessatori (Art. 3,4,7,9,10,11,12,13,15,16,17,18,19,20,21,25,26,28,29)

describe('verificaDeroghe — articoli vessatori CGC (RF6 / obiettivo Analisi Deroghe)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('copre tutti gli articoli vessatori dello standard di Gruppo', () => {
    expect(NUM_ARTICOLI).toBe(19);
    expect(ARTICOLI_CRITICI.map(a => a.articolo)).toEqual(
      ['3', '4', '7', '9', '10', '11', '12', '13', '15', '16', '17', '18', '19', '20', '21', '25', '26', '28', '29']
    );
  });

  it('ritorna esiti per articolo quando il LLM risponde', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '17', esito: 'conforme', dettaglio: 'Accessi senza riserve previsti', riferimentoComma: '17.1', segnali: [] },
        { articolo: '21', esito: 'derogato', dettaglio: 'Subappalto consentito senza autorizzazione scritta', riferimentoComma: '21.4', segnali: ['cessione/subappalto consentiti senza autorizzazione scritta'] }
      ]
    });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Art. 17 — Il fornitore consente accesso senza riserve a locali e sistemi. Art. 21 — Il subappalto è libero.'
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe).toHaveLength(NUM_ARTICOLI);
    expect(resp.data.deroghe.find(r => r.articolo === '17').esito).toBe('conforme');
    expect(resp.data.deroghe.find(r => r.articolo === '21').esito).toBe('derogato');
    expect(resp.data.esitoComplessivo).toBe('ANOMALIA');
  });

  it('fallback a non_determinabile se la preview non ha testo', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'no-text.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe).toHaveLength(NUM_ARTICOLI);
    expect(resp.data.deroghe.every(d => d.esito === 'non_determinabile')).toBe(true);
  });

  it('fallback a non_determinabile se il LLM fallisce', async () => {
    mockChatJSON.mockRejectedValue(new Error('LLM down'));

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Testo qualsiasi.'
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe).toHaveLength(NUM_ARTICOLI);
    expect(resp.data.deroghe.every(d => d.esito === 'non_determinabile')).toBe(true);
  });

  it('reject 410 se la preview non esiste', async () => {
    await expect(POST('/comparator/verificaDeroghe', { previewID: cds.utils.uuid() }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 410 } });
  });

  it('normalizza: completa a un esito per ogni articolo critico se il LLM ritorna un set parziale', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [{ articolo: '17', esito: 'conforme', dettaglio: 'Accessi senza riserve', riferimentoComma: '17.1', segnali: [] }]
    });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Art. 17 — Il fornitore consente accesso senza riserve.'
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe).toHaveLength(NUM_ARTICOLI);
    expect(resp.data.deroghe.find(r => r.articolo === '17').esito).toBe('conforme');
    expect(resp.data.deroghe.find(r => r.articolo === '21').esito).toBe('non_determinabile');
    expect(resp.data.deroghe.find(r => r.articolo === '3').esito).toBe('non_determinabile');
  });

  it('normalizza: filtra gli articoli non critici restituiti dal LLM', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '17', esito: 'derogato', dettaglio: 'x', riferimentoComma: '17.1', segnali: [] },
        { articolo: '99', esito: 'conforme', dettaglio: 'articolo fantasma', riferimentoComma: '', segnali: [] }
      ]
    });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Art. 17 — Il subappalto è libero.'
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe).toHaveLength(NUM_ARTICOLI);
    expect(resp.data.deroghe.map(r => r.articolo)).not.toContain('99');
    expect(resp.data.deroghe.find(r => r.articolo === '17').esito).toBe('derogato');
  });

  it('normalizza: esito fuori enum coercizzato a non_determinabile', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '17', esito: 'parziale', dettaglio: 'x', riferimentoComma: '17.1', segnali: [] },
        { articolo: '21', esito: 'conforme', dettaglio: 'y', riferimentoComma: '21.1', segnali: [] }
      ]
    });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Art. 17 e Art. 21 citati.'
    });

    const resp = await POST('/comparator/verificaDeroghe', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.deroghe.find(r => r.articolo === '17').esito).toBe('non_determinabile');
    expect(resp.data.deroghe.find(r => r.articolo === '21').esito).toBe('conforme');
  });
});
