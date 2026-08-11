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
const cdsRuntime = require('@sap/cds');

describe('creaTemplateDaCoverage', () => {
  beforeEach(async () => {
    mockEmbeddings.mockReset();
    mockEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const { Template, Fornitore } = cdsRuntime.entities('com.reply.contrattiattivi');
    await DELETE.from(Template);
    await DELETE.from(Fornitore);
  });

  it('crea Template + TemplateVersion + Clausole dalle clausole presenti, escludendo NON_PRESENTE', async () => {
    const res = await POST('/comparator/creaTemplateDaCoverage', {
      nome: 'Template da wizard',
      clausole: [
        { numero: 1, titolo: 'Oggetto', testo: 'Testo oggetto.', stato: 'NUOVA' },
        { numero: 2, titolo: 'Durata', testo: 'Testo durata.', stato: 'VARIANTE' },
        { numero: 3, titolo: 'Foro', testo: 'Testo foro.', stato: 'NON_PRESENTE' }
      ]
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.templateID).toBeDefined();

    const { Template, Clausola } = cdsRuntime.entities('com.reply.contrattiattivi');
    const template = await SELECT.one.from(Template, res.data.templateID);
    expect(template.nome).toBe('Template da wizard');
    expect(template.isDefault).toBe(false);

    const clausole = await SELECT.from(Clausola).where({ template_ID: res.data.templateID });
    expect(clausole).toHaveLength(2);
  });

  it('con fornitoreID e isDefault, disattiva il default precedente dello stesso fornitore', async () => {
    const { Fornitore, Template } = cdsRuntime.entities('com.reply.contrattiattivi');
    const fornitoreID = cdsRuntime.utils.uuid();
    await INSERT.into(Fornitore).entries({ ID: fornitoreID, idSapFornitore: 'SAP1', nomeFornitore: 'ACME Srl' });
    const vecchioDefaultID = cdsRuntime.utils.uuid();
    await INSERT.into(Template).entries({ ID: vecchioDefaultID, nome: 'Vecchio default', fornitore_ID: fornitoreID, isDefault: true });

    const res = await POST('/comparator/creaTemplateDaCoverage', {
      nome: 'Nuovo default', fornitoreID, isDefault: true,
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo.', stato: 'NUOVA' }]
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    const nuovo = await SELECT.one.from(Template, res.data.templateID);
    expect(nuovo.isDefault).toBe(true);
    expect(nuovo.fornitore_ID).toBe(fornitoreID);
    const vecchio = await SELECT.one.from(Template, vecchioDefaultID);
    expect(vecchio.isDefault).toBe(false);
  });

  it('risponde 400 se non resta nessuna clausola dopo il filtro NON_PRESENTE', async () => {
    await expect(
      POST('/comparator/creaTemplateDaCoverage', {
        nome: 'Vuoto', clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo.', stato: 'NON_PRESENTE' }]
      }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});
