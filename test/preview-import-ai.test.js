const path = require('path');
const cds = require('@sap/cds');
const FormData = require('form-data');
const { Document, Packer, Paragraph } = require('docx');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn().mockResolvedValue({
    clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo estratto dal documento di prova.' }]
  }),
  embeddings: jest.fn().mockResolvedValue([[1, 0, 0]])
}));

const { axios } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

async function buildDocxFixture() {
  const doc = new Document({
    sections: [{ children: [new Paragraph('Contenuto di prova per previewImportAI.')] }]
  });
  return Packer.toBuffer(doc);
}

describe('previewImportAI', () => {
  it('rejects unauthenticated requests', async () => {
    const form = new FormData();
    form.append('file', await buildDocxFixture(), {
      filename: 'contratto.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    await expect(axios.post('/contratti/previewImportAI', form, { headers: form.getHeaders() }))
      .rejects.toMatchObject({ response: { status: 401 } });
  });

  it('returns a previewID and proposed clausole without writing to the database', async () => {
    const before = await axios.get('/contratti/Template', { auth: MOCK_USER });

    const form = new FormData();
    form.append('file', await buildDocxFixture(), {
      filename: 'contratto.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const r = await axios.post('/contratti/previewImportAI', form, {
      auth: MOCK_USER,
      headers: form.getHeaders()
    });

    expect(r.status).toBe(200);
    expect(typeof r.data.previewID).toBe('string');
    expect(r.data.clausole).toHaveLength(1);
    expect(r.data.clausole[0].stato).toBe('NUOVA');

    const after = await axios.get('/contratti/Template', { auth: MOCK_USER });
    expect(after.data.value.length).toBe(before.data.value.length);
  });
});
