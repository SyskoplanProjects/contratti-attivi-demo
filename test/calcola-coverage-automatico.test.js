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
const { Document, Packer, Paragraph } = require('docx');

async function bufferDocx(testo) {
  const doc = new Document({ sections: [{ children: [new Paragraph(testo)] }] });
  return (await Packer.toBuffer(doc)).toString('base64');
}

async function creaTemplateConEmbedding(nome, embeddingDocumento, clausoleTemplate) {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cdsRuntime.entities('com.reply.contrattiattivi');
  const templateID = cdsRuntime.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome });
  const versionID = cdsRuntime.utils.uuid();
  await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString(), embeddingDocumento: JSON.stringify(embeddingDocumento) });
  let ordine = 1;
  for (const testo of clausoleTemplate) {
    const clausolaID = cdsRuntime.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: `C${ordine}`, titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cdsRuntime.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo, dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cdsRuntime.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: ordine++ });
  }
  return templateID;
}

describe('calcolaCoverage senza templateID (pipeline automatica)', () => {
  beforeEach(async () => {
    mockEmbeddings.mockReset();
    mockChatJSON.mockReset();
    const { TemplateVersionClausola, ClausolaVersione, Clausola, TemplateVersion, Template } =
      cdsRuntime.entities('com.reply.contrattiattivi');
    await DELETE.from(TemplateVersionClausola);
    await DELETE.from(ClausolaVersione);
    await DELETE.from(Clausola);
    await DELETE.from(TemplateVersion);
    await DELETE.from(Template);
  });

  it('riconosce il riferimento più simile e popola riferimentoTrovato', async () => {
    const templateID = await creaTemplateConEmbedding('Template auto', [1, 0, 0], ['Testo A.']);

    mockChatJSON.mockResolvedValue({ clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo A.' }] });
    mockEmbeddings
      .mockResolvedValueOnce([[1, 0, 0]])
      .mockResolvedValueOnce([[1, 0, 0], [1, 0, 0]]);

    const res = await POST('/comparator/calcolaCoverage', {
      file: await bufferDocx('Testo A.'), filename: 'contratto.docx'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.riferimentoTrovato).not.toBeNull();
    expect(res.data.riferimentoTrovato.templateID).toBe(templateID);
    expect(res.data.coveragePercent).toBe(100);
  });

  it('risponde 400 "Nessun template di riferimento disponibile in archivio" se il pool è vuoto', async () => {
    mockChatJSON.mockResolvedValue({ clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo A.' }] });

    await expect(
      POST('/comparator/calcolaCoverage', { file: await bufferDocx('Testo A.'), filename: 'contratto.docx' }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 400, data: { error: { message: 'Nessun template di riferimento disponibile in archivio' } } } });
  });

  it('con templateID esplicito il comportamento resta quello di oggi (nessuna auto-detection)', async () => {
    const templateID = await creaTemplateConEmbedding('Template manuale', [1, 0, 0], ['Testo A.']);
    mockChatJSON.mockResolvedValue({ clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo A.' }] });
    mockEmbeddings.mockResolvedValueOnce([[1, 0, 0], [1, 0, 0]]);

    const res = await POST('/comparator/calcolaCoverage', {
      file: await bufferDocx('Testo A.'), filename: 'contratto.docx', templateID
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.riferimentoTrovato).toBeNull();
  });
});

describe('calcolaCoverageDaContratto senza templateID (derivato da Contratto.template_ID)', () => {
  it('deriva il template dal contratto quando templateID non è passato', async () => {
    const { Contratto, Clausola, ClausolaVersione, ContrattoClausola } = cdsRuntime.entities('com.reply.contrattiattivi');
    const templateID = await creaTemplateConEmbedding('Template contratto', [1, 0, 0], ['Testo A.']);
    const contrattoID = cdsRuntime.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, stato: 'BOZZA', intestatario: 'Acme', template_ID: templateID, templateVersion_ID: cdsRuntime.utils.uuid(), responsabile: MOCK_USER.username });
    const clausolaID = cdsRuntime.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cdsRuntime.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo A.', dataCreazione: new Date().toISOString() });
    await INSERT.into(ContrattoClausola).entries({ ID: cdsRuntime.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1, rimossa: false });

    mockEmbeddings.mockResolvedValueOnce([[1, 0, 0], [1, 0, 0]]);

    const res = await POST('/comparator/calcolaCoverageDaContratto', { contractID: contrattoID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.coveragePercent).toBe(100);
  });
});