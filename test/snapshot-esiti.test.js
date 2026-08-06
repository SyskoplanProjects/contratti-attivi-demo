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

const TUTTI_ATTESI = ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G'];

describe('confirmCoverage — snapshot EsitoVerificaContratto e anomalie (RF8/RF9)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('crea snapshot completo (completezza 100, deroghe, confidenzaMedia, fonte AVVIO_VERIFICA)', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '17', esito: 'conforme', dettaglio: '', riferimentoComma: '', segnali: '' },
        { articolo: '21', esito: 'derogato', dettaglio: 'Subappalto libero', riferimentoComma: '21.4', segnali: '' }
      ]
    });

    const previewID = previewStore.put(previewBase({
      testo: 'Art. 21 — Il subappalto è libero.',
      allegati: TUTTI_ATTESI.map((tipo, i) => ({
        filename: tipo + '.pdf', mimeType: 'application/pdf', contenuto: 'AA==',
        tipo, confidenza: 0.95, metodoRiconoscimento: 'embedding', testo: 'x', metadati: []
      }))
    }));

    const resp = await POST('/comparator/confirmCoverage', {
      previewID, clausole: previewStore.get(previewID).clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const contrattoID = resp.data.ID;

    const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
    const esiti = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: contrattoID });
    expect(esiti).toHaveLength(1);
    expect(esiti[0].completezzaPercent).toBe(100);
    expect(esiti[0].allegatiAttesi).toHaveLength(9);
    expect(esiti[0].totaleAllegati).toBe(9);
    expect(esiti[0].allegatiPresenti).toBe(9);
    expect(esiti[0].confidenzaMedia).toBe(0.95);
    expect(esiti[0].fonte).toBe('AVVIO_VERIFICA');
    const deroga21 = esiti[0].deroghe.find(d => d.articolo === '21');
    expect(deroga21.esito).toBe('derogato');

    const anomalie = await SELECT.from(Anomalia).where({ esitoVerifica_ID: esiti[0].ID });
    expect(anomalie.map(a => a.tipo)).toContain('DEROGHE');
  });

  it('genera anomalie COMPLETEZZA e CONFIDENZA senza duplicati', async () => {
    const previewID = previewStore.put(previewBase({
      allegati: [
        { filename: 'cgc.pdf', mimeType: 'application/pdf', contenuto: 'AA==',
          tipo: 'CGC', confidenza: 0.95, metodoRiconoscimento: 'embedding', testo: 'x', metadati: [] },
        { filename: 'allegato_b.pdf', mimeType: 'application/pdf', contenuto: 'AA==',
          tipo: 'ALLEGATO_B', confidenza: 0.60, metodoRiconoscimento: 'embedding', testo: 'x', metadati: [] }
      ]
    }));

    const resp = await POST('/comparator/confirmCoverage', {
      previewID, clausole: previewStore.get(previewID).clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
    const esiti = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: resp.data.ID });
    const anomalie = await SELECT.from(Anomalia).where({ esitoVerifica_ID: esiti[0].ID });

    const tipi = new Set(anomalie.map(a => a.tipo));
    expect(tipi).toEqual(new Set(['COMPLETEZZA', 'CONFIDENZA']));
    const completezza = anomalie.filter(a => a.tipo === 'COMPLETEZZA');
    expect(completezza.map(a => a.riferimento)).not.toContain('CGC');
    expect(completezza).toHaveLength(7); // 9 attesi - CGC e ALLEGATO_B presenti
    const confidenza = anomalie.find(a => a.tipo === 'CONFIDENZA');
    expect(confidenza.riferimento).toBe('allegato_b.pdf');
  });

  it('fonte CONTRATTO quando la preview ha contractID', async () => {
    const previewID = previewStore.put(previewBase({
      contractID: cds.utils.uuid(),
      allegati: []
    }));

    const resp = await POST('/comparator/confirmCoverage', {
      previewID, clausole: previewStore.get(previewID).clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    const { EsitoVerificaContratto } = cds.entities('com.reply.contrattiattivi');
    const esiti = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: resp.data.ID });
    expect(esiti[0].fonte).toBe('CONTRATTO');
  });

  it('ogni conferma crea un nuovo snapshot (nessuna UPDATE su righe esistenti)', async () => {
    const { EsitoVerificaContratto } = cds.entities('com.reply.contrattiattivi');

    const previewID1 = previewStore.put(previewBase({ allegati: [] }));
    const clausole1 = previewStore.get(previewID1).clausole;
    const resp1 = await POST('/comparator/confirmCoverage', {
      previewID: previewID1, clausole: clausole1, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    const esiti1 = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: resp1.data.ID });
    expect(esiti1).toHaveLength(1);
    const primoID = esiti1[0].ID;
    expect(esiti1[0].completezzaPercent).toBe(0);

    const previewID2 = previewStore.put(previewBase({ allegati: [] }));
    const clausole2 = previewStore.get(previewID2).clausole;
    const resp2 = await POST('/comparator/confirmCoverage', {
      previewID: previewID2, clausole: clausole2, allegati: [], metadati: []
    }, { auth: MOCK_USER });

    const esiti2 = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: resp2.data.ID });
    expect(esiti2).toHaveLength(1);
    expect(esiti2[0].ID).not.toBe(primoID);
    const primoRilettura = await SELECT.one.from(EsitoVerificaContratto, primoID);
    expect(primoRilettura.completezzaPercent).toBe(0);
  });
});
