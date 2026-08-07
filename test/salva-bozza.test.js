const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

const CLAUSOLE = [
  { numero: 1, titolo: 'Oggetto', testo: 'Testo oggetto.', stato: 'MATCH_TEMPLATE' },
  { numero: 2, titolo: 'Penali', testo: 'Testo variante.', stato: 'VARIANTE' },
  { numero: 3, titolo: 'Dati di consegna', testo: 'Testo dal template.', stato: 'NON_PRESENTE' }
];
const METADATI = [{ campo: 'oggettoContratto', etichetta: 'Oggetto contratto', valore: 'Fornitura ICT' }];

async function creaPreview(allegati) {
  return previewStore.put({
    filename: 'contratto.pdf',
    testo: 'Testo del documento.',
    clausole: CLAUSOLE,
    coveragePercent: 80,
    allegati: allegati || []
  });
}

describe('salvaBozza', () => {
  beforeEach(async () => {
    const { Contratto, ContrattoAllegato, MetadatoDocumento, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    await DELETE.from(MetadatoDocumento);
    await DELETE.from(ContrattoAllegato);
    await DELETE.from(ContrattoClausola);
    await DELETE.from(Contratto);
  });

  it('crea Contratto stato BOZZA con previewID, intestatario, metadati e snapshot clausole (step CONTRATTO)', async () => {
    const previewID = await creaPreview();

    const res = await POST('/comparator/salvaBozza', {
      previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme S.p.A.',
      clausole: CLAUSOLE, metadati: METADATI, allegatoID: null
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('BOZZA');

    const { Contratto, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const bozze = await SELECT.from(Contratto).where({ previewID });
    expect(bozze).toHaveLength(1);
    expect(bozze[0].stato).toBe('BOZZA');
    expect(bozze[0].intestatario).toBe('Acme S.p.A.');
    expect(JSON.parse(bozze[0].snapshotBozza).clausole).toHaveLength(3);

    const metadati = await SELECT.from(MetadatoDocumento).where({ contratto_ID: bozze[0].ID });
    expect(metadati.map(m => m.campo)).toContain('oggettoContratto');
  });

  it('doppio salvataggio idempotente: una sola riga Contratto', async () => {
    const previewID = await creaPreview();
    const body = { previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme S.p.A.', clausole: CLAUSOLE, metadati: METADATI, allegatoID: null };

    await POST('/comparator/salvaBozza', body, { auth: MOCK_USER });
    await POST('/comparator/salvaBozza', body, { auth: MOCK_USER });

    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const bozze = await SELECT.from(Contratto).where({ previewID });
    expect(bozze).toHaveLength(1);
  });

  it('step ALLEGATO upsert ContrattoAllegato per filename con metadati', async () => {
    const previewID = await creaPreview([{ filename: 'dure.pdf', mimeType: 'application/pdf', contenuto: 'YQ==', tipo: 'DURC', confidenza: 0.9, metodoRiconoscimento: 'embedding', testo: 'DURC testo.', metadati: [] }]);
    await POST('/comparator/salvaBozza', { previewID, step: 'CONTRATTO', filename: 'contratto.pdf', tipo: 'CGC', intestatario: 'Acme', clausole: CLAUSOLE, metadati: [], allegatoID: null }, { auth: MOCK_USER });

    const res = await POST('/comparator/salvaBozza', {
      previewID, step: 'ALLEGATO', filename: 'contratto.pdf', tipo: 'DURC', intestatario: null,
      clausole: [], metadati: [{ campo: 'numeroProtocollo', etichetta: 'Numero protocollo', valore: '12345' }], allegatoID: 'dure.pdf'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);

    const { Contratto, ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const c = await SELECT.from(Contratto).where({ previewID });
    const allegati = await SELECT.from(ContrattoAllegato).where({ contratto_ID: c[0].ID });
    expect(allegati).toHaveLength(1);
    expect(allegati[0].filename).toBe('dure.pdf');
    const metadati = await SELECT.from(MetadatoDocumento).where({ allegato_ID: allegati[0].ID });
    expect(metadati.map(m => m.campo)).toContain('numeroProtocollo');
  });
});