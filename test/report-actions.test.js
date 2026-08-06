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

function previewBase(overrides) {
  return Object.assign({
    filename: 'contratto.pdf',
    clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
    coveragePercent: 100
  }, overrides);
}

describe('report actions (Risultati Attesi — reportistica sistematica)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('getContrattiIncompleti elenca i contratti sotto il 100% con referente se assegnato', async () => {
    const previewID = previewStore.put(previewBase({
      allegati: [{ filename: 'cgc.pdf', mimeType: 'application/pdf', contenuto: 'AA==',
        tipo: 'CGC', confidenza: 0.95, metodoRiconoscimento: 'embedding', testo: 'x', metadati: [] }]
    }));
    const resp = await POST('/comparator/confirmCoverage', {
      previewID, clausole: previewStore.get(previewID).clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });
    const contrattoID = resp.data.ID;

    const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
    const esito = (await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: contrattoID }))[0];
    const anomaliaCompletezza = (await SELECT.from(Anomalia).where({ esitoVerifica_ID: esito.ID, tipo: 'COMPLETEZZA' }))[0];
    await POST('/comparator/assegnaAnomalia', { anomaliaID: anomaliaCompletezza.ID, assegnatario: 'mario.rossi@iccrea.it' }, { auth: MOCK_USER });

    const report = await POST('/comparator/getContrattiIncompleti', {}, { auth: MOCK_USER });
    const riga = report.data.value.find(r => r.contrattoID === contrattoID);
    expect(riga).toBeDefined();
    expect(Number(riga.completezzaPercent)).toBeLessThan(100);
    expect(riga.referente).toBe('mario.rossi@iccrea.it');
    expect(riga.standardApplicato).toContain('Iccrea');
  });

  it('getDerogheContrattuali elenca gli articoli derogati per contratto', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [{ articolo: '21', esito: 'derogato', dettaglio: 'Subappalto libero', riferimentoComma: '21.4', segnali: '' }]
    });
    const previewID = previewStore.put(previewBase({ testo: 'Art. 21 — Il subappalto è libero.', allegati: [] }));
    const resp = await POST('/comparator/confirmCoverage', {
      previewID, clausole: previewStore.get(previewID).clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    const report = await POST('/comparator/getDerogheContrattuali', {}, { auth: MOCK_USER });
    const riga = report.data.value.find(r => r.contrattoID === resp.data.ID);
    expect(riga).toBeDefined();
    expect(riga.articolo).toBe('21');
  });
});
