const path = require('path');
const cds = require('@sap/cds');

const mockEmbeddings = jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])));
jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(), chatJSON: jest.fn(),
  embeddings: (...args) => mockEmbeddings(...args)
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

describe('embeddingDocumento popolato ad ogni creazione di TemplateVersion', () => {
  beforeEach(() => { mockEmbeddings.mockClear(); });

  it('confirmCoverage popola embeddingDocumento sulla nuova TemplateVersion', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_embedding.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'MATCH_TEMPLATE', similarity: 0.9 }],
      coveragePercent: 100
    });
    const res = await POST('/comparator/confirmCoverage', { previewID, clausole: [], allegati: [], metadati: [] }, { auth: MOCK_USER });
    expect(res.status).toBe(200);

    const { TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const versione = await SELECT.one.from(TemplateVersion).where({ template_ID: res.data.template_ID });
    expect(versione.embeddingDocumento).not.toBeNull();
    expect(JSON.parse(versione.embeddingDocumento)).toEqual([1, 0, 0]);
  });

  it('confirmCoverage con embeddings API in errore lascia embeddingDocumento null senza fallire', async () => {
    mockEmbeddings.mockRejectedValueOnce(new Error('API down'));
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_embedding_ko.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'MATCH_TEMPLATE', similarity: 0.9 }],
      coveragePercent: 100
    });
    const res = await POST('/comparator/confirmCoverage', { previewID, clausole: [], allegati: [], metadati: [] }, { auth: MOCK_USER });
    expect(res.status).toBe(200);

    const { TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const versione = await SELECT.one.from(TemplateVersion).where({ template_ID: res.data.template_ID });
    expect(versione.embeddingDocumento).toBeNull();
  });
});

describe('backfill-template-embeddings', () => {
  it('popola embeddingDocumento solo sulle TemplateVersion che ne sono prive', async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template backfill' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo backfill.', dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    const { main } = require('../srv/lib/backfill-template-embeddings');
    await main();

    const versione = await SELECT.one.from(TemplateVersion, versionID);
    expect(versione.embeddingDocumento).not.toBeNull();
    expect(JSON.parse(versione.embeddingDocumento)).toEqual([1, 0, 0]);
  });
});