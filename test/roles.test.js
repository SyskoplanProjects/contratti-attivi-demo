const path = require('path');
const cds = require('@sap/cds');
const FormData = require('form-data');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn().mockResolvedValue('thread_test_123'),
  sendMessage: jest.fn().mockResolvedValue([]),
  deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn()
}));

const { GET, POST, axios } = cds.test(path.join(__dirname, '..'));

const UTENTE = { username: 'mario.rossi@contrattiattivi.it', password: 'test' };
const REVISORE = { username: 'revisore@contrattiattivi.it', password: 'test' };

describe('ContrattiService role gating', () => {
  let templateID, contrattoID, revisioneID;

  beforeAll(async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola, Contratto, ContrattoClausola, Revisione } =
      cds.entities('com.reply.contrattiattivi');

    templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template Test', tipoServizio: 'ICT' });

    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });

    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto del contratto', template_ID: templateID });

    const versioneClausolaID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: versioneClausolaID, clausola_ID: clausolaID, numero: 0, testo: 'Testo originale', dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID });

    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: versioneClausolaID, ordine: 1 });

    contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, template_ID: templateID, templateVersion_ID: versionID, stato: 'BOZZA', nome: 'Contratto Test', tipoServizio: 'ICT', versione: 1, intestatario: 'Test Intestatario' });

    await INSERT.into(ContrattoClausola).entries({ ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID, clausolaVersione_ID: versioneClausolaID, ordine: 1, testoCorrente: 'Testo originale' });

    revisioneID = cds.utils.uuid();
    await INSERT.into(Revisione).entries({ ID: revisioneID, contratto_ID: contrattoID, dataInvio: new Date().toISOString(), stato: 'IN_REVISIONE' });
  });

  it('Revisore cannot call creaDaTemplate (Utente-only action)', async () => {
    await expect(
      POST('/contratti/creaDaTemplate', { templateID }, { auth: REVISORE })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('Utente cannot call approvaRevisione (Revisore-only action)', async () => {
    await expect(
      POST('/contratti/approvaRevisione', { revisioneID }, { auth: UTENTE })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('Revisore cannot PATCH a Contratto directly (generic CRUD write restricted to Utente)', async () => {
    await expect(
      axios.patch(`/contratti/Contratto(${contrattoID})`, { oggetto: 'x' }, { auth: REVISORE })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('Both roles can read Contratto', async () => {
    const resUtente = await GET('/contratti/Contratto', { auth: UTENTE });
    const resRevisore = await GET('/contratti/Contratto', { auth: REVISORE });
    expect(resUtente.status).toBe(200);
    expect(resRevisore.status).toBe(200);
  });
});

describe('ComparatorService and agenteService role gating', () => {
  it('Revisore cannot call ComparatorService (Utente-only service)', async () => {
    await expect(
      POST('/comparator/getTipologieAllegato', {}, { auth: REVISORE })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });
  it('Utente can call ComparatorService', async () => {
    const res = await POST('/comparator/getTipologieAllegato', {}, { auth: UTENTE });
    expect(res.status).toBe(200);
  });
  it('Revisore can call agenteService (shared with contratti app)', async () => {
    const res = await POST('/agente/openThread', { forceNew: true }, { auth: REVISORE });
    expect(res.status).toBe(200);
  });
});

describe('server.js hand-rolled routes role gating', () => {
  it('Revisore cannot POST /contratti/importTemplate (Utente-only)', async () => {
    await expect(
      axios.post('/contratti/importTemplate', Buffer.from('test'), {
        auth: REVISORE,
        headers: { 'Content-Type': 'application/octet-stream', 'x-filename': 'x.txt' }
      })
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
  it('Revisore can GET /contratti/scaricaAllegato/:id (read, both roles)', async () => {
    const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const allegato = await SELECT.one.from(ContrattoAllegato);
    if (!allegato) return;
    const res = await axios.get(`/contratti/scaricaAllegato/${allegato.ID}`, { auth: REVISORE });
    expect(res.status).toBe(200);
  });

  it('Revisore cannot POST /contratti/creaTemplateMultiFile (Utente-only)', async () => {
    await expect(
      axios.post('/contratti/creaTemplateMultiFile', Buffer.from('test'), {
        auth: REVISORE,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('POST /contratti/creaTemplateMultiFile with nome but no files returns 400 NO_FILE', async () => {
    const form = new FormData();
    form.append('nome', 'Template Senza File');

    await expect(
      axios.post('/contratti/creaTemplateMultiFile', form, { auth: UTENTE, headers: form.getHeaders() })
    ).rejects.toMatchObject({ response: { status: 400, data: { code: 'NO_FILE' } } });
  });

  it('POST /contratti/creaTemplateMultiFile with files but no nome returns 400 NOME_MANCANTE', async () => {
    const form = new FormData();
    form.append('file', Buffer.from('dummy'), {
      filename: 'a.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    await expect(
      axios.post('/contratti/creaTemplateMultiFile', form, { auth: UTENTE, headers: form.getHeaders() })
    ).rejects.toMatchObject({ response: { status: 400, data: { code: 'NOME_MANCANTE' } } });
  });
});
