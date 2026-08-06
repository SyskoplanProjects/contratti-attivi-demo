const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn()
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const cdsRuntime = require('@sap/cds');

async function creaTemplate(nome, tipoRiferimento) {
  const { Template } = cdsRuntime.entities('com.reply.contrattiattivi');
  const templateID = cdsRuntime.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome, tipoRiferimento });
  return templateID;
}

describe('getTemplates', () => {
  beforeEach(async () => {
    const { Template } = cdsRuntime.entities('com.reply.contrattiattivi');
    await DELETE.from(Template);
  });

  it('ritorna tutti i template ordinati per nome con ID, nome e tipoRiferimento', async () => {
    await creaTemplate('Beta Template', 'CLIENTE');
    await creaTemplate('Alfa Template', 'STANDARD');

    const res = await POST('/comparator/getTemplates', {}, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.value).toHaveLength(2);
    expect(res.data.value[0].nome).toBe('Alfa Template');
    expect(res.data.value[1].nome).toBe('Beta Template');
    expect(res.data.value[0].tipoRiferimento).toBe('STANDARD');
    expect(res.data.value[0].ID).toBeTruthy();
  });

  it('ritorna lista vuota se nessun template', async () => {
    const res = await POST('/comparator/getTemplates', {}, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value).toEqual([]);
  });
});
