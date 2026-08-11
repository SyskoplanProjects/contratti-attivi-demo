const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn()
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const cdsRuntime = require('@sap/cds');

describe('commenti su Template (RF-4.1/4.2)', () => {
  let templateID;

  beforeEach(async () => {
    const { Template, TemplateCommento } = cdsRuntime.entities('com.reply.contrattiattivi');
    await DELETE.from(TemplateCommento);
    await DELETE.from(Template);
    templateID = cdsRuntime.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template con commenti' });
  });

  it('aggiungiCommentoTemplate crea un commento APERTO con autore = utente corrente', async () => {
    const res = await POST('/contratti/aggiungiCommentoTemplate', { templateID, testo: 'Attenzione a questa clausola.' }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.testo).toBe('Attenzione a questa clausola.');
    expect(res.data.stato).toBe('APERTO');
    expect(res.data.autore).toBe(MOCK_USER.username);
  });

  it('risponde 400 se testo vuoto', async () => {
    await expect(POST('/contratti/aggiungiCommentoTemplate', { templateID, testo: '  ' }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 400 } });
  });

  it('risolviCommentoTemplate porta lo stato a RISOLTO', async () => {
    const creato = await POST('/contratti/aggiungiCommentoTemplate', { templateID, testo: 'Da chiudere.' }, { auth: MOCK_USER });
    const res = await POST('/contratti/risolviCommentoTemplate', { commentoID: creato.data.ID }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('RISOLTO');
  });

  it('cancellaTemplate elimina anche i commenti collegati', async () => {
    await POST('/contratti/aggiungiCommentoTemplate', { templateID, testo: 'Da cancellare col template.' }, { auth: MOCK_USER });
    const res = await POST('/contratti/cancellaTemplate', { templateID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);

    const { TemplateCommento } = cdsRuntime.entities('com.reply.contrattiattivi');
    const rimasti = await SELECT.from(TemplateCommento).where({ template_ID: templateID });
    expect(rimasti).toHaveLength(0);
  });
});
