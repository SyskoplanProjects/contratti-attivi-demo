const path = require('path');
const cds = require('@sap/cds');

const mockEmbeddings = jest.fn();
const mockChatJSON = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: (...args) => mockChatJSON(...args),
  embeddings: (...args) => mockEmbeddings(...args)
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');
const fs = require('fs');

describe('calcolaCoverage / classificaAllegati — pdfBase64 e posizione end-to-end', () => {
  beforeEach(() => { mockEmbeddings.mockReset(); mockChatJSON.mockReset(); });

  it('calcolaCoverage con templateID e file PDF nativo ritorna pdfBase64 valorizzato', async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template PDF test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Contratto di prova ACME S.p.A.', dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    mockChatJSON.mockResolvedValue({ clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Contratto di prova ACME S.p.A.' }] });
    mockEmbeddings.mockResolvedValue([[1, 0, 0], [1, 0, 0]]);

    const pdfFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'testo-noto.pdf'));
    const res = await POST('/comparator/calcolaCoverage', {
      file: pdfFixture.toString('base64'), filename: 'contratto.pdf', templateID
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.pdfBase64).not.toBeNull();
    expect(Buffer.from(res.data.pdfBase64, 'base64').subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('calcolaCoverage con file .xlsx ritorna pdfBase64 null (fuori scope, nessun crash)', async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template xlsx test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo.', dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    mockChatJSON.mockResolvedValue({ clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo.' }] });
    mockEmbeddings.mockResolvedValue([[1, 0, 0], [1, 0, 0]]);

    const res = await POST('/comparator/calcolaCoverage', {
      file: Buffer.from('finto xlsx').toString('base64'), filename: 'documento.xlsx', templateID
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.pdfBase64).toBeNull();
  });

  it('classificaAllegati valorizza pdfBase64 per allegato PDF nativo', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(), filename: 'contratto.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo.', stato: 'MATCH_TEMPLATE', similarity: 0.9 }],
      coveragePercent: 100
    });
    mockChatJSON.mockResolvedValue({});
    mockEmbeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => [1, 0, 0])));

    const pdfFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'testo-noto.pdf'));
    const res = await POST('/comparator/classificaAllegati', {
      previewID, allegati: [{ filename: 'appendice.pdf', file: pdfFixture.toString('base64') }]
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.allegati[0].pdfBase64).not.toBeNull();
  });
});