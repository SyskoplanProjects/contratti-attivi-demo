const path = require('path');
const cds = require('@sap/cds');

const mockEmbeddings = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(), chatJSON: jest.fn(),
  embeddings: (...args) => mockEmbeddings(...args)
}));

const { GET } = cds.test(path.join(__dirname, '..'));
const { trovaRiferimento } = require('../srv/lib/riferimento-matcher');
const cdsRuntime = require('@sap/cds');

async function creaTemplateConEmbedding(nome, tipoRiferimento, embeddingDocumento, clausole) {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cdsRuntime.entities('com.reply.contrattiattivi');
  const templateID = cdsRuntime.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome, tipoRiferimento });
  const versionID = cdsRuntime.utils.uuid();
  await INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString(),
    embeddingDocumento: JSON.stringify(embeddingDocumento)
  });
  let ordine = 1;
  for (const c of clausole) {
    const clausolaID = cdsRuntime.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: `C${ordine}`, titolo: c.titolo, template_ID: templateID });
    const clausolaVersioneID = cdsRuntime.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: c.testo, dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cdsRuntime.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: ordine++ });
  }
  return templateID;
}

describe('riferimento-matcher — trovaRiferimento', () => {
  beforeEach(async () => {
    mockEmbeddings.mockReset();
    const { TemplateVersionClausola, ClausolaVersione, Clausola, TemplateVersion, Template } =
      cdsRuntime.entities('com.reply.contrattiattivi');
    await DELETE.from(TemplateVersionClausola);
    await DELETE.from(ClausolaVersione);
    await DELETE.from(Clausola);
    await DELETE.from(TemplateVersion);
    await DELETE.from(Template);
  });

  it('sceglie, tra la shortlist ordinata per cosine similarity, il candidato con coveragePercent più alto in rifinitura', async () => {
    const templateVicinoID = await creaTemplateConEmbedding('Template vicino', 'CLIENTE', [1, 0, 0], [{ titolo: 'Oggetto', testo: 'Testo A.' }]);
    const templateLontanoID = await creaTemplateConEmbedding('Template lontano', 'STANDARD', [0, 1, 0], [{ titolo: 'Oggetto', testo: 'Testo B.' }]);

    mockEmbeddings
      .mockResolvedValueOnce([[1, 0, 0]])
      .mockResolvedValueOnce([[1, 0, 0], [1, 0, 0]])
      .mockResolvedValueOnce([[1, 0, 0], [0, 1, 0]]);

    const risultato = await cds.tx(async (tx) => trovaRiferimento([{ numero: 1, titolo: 'Oggetto', testo: 'Testo caricato.' }], tx));

    expect(risultato).not.toBeNull();
    expect(risultato.templateID).toBe(templateVicinoID);
    expect(risultato.tipo).toBe('CLIENTE');
    expect(risultato.coveragePercent).toBe(100);
    expect(templateLontanoID).toBeDefined();
  });

  it('ritorna null se non ci sono Template in archivio', async () => {
    const risultato = await cds.tx(async (tx) => trovaRiferimento([{ numero: 1, titolo: 'Oggetto', testo: 'Testo.' }], tx));
    expect(risultato).toBeNull();
    expect(mockEmbeddings).not.toHaveBeenCalled();
  });

  it('con un solo Template privo di embeddingDocumento, fa fallback al confronto diretto (non lo esclude)', async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cdsRuntime.entities('com.reply.contrattiattivi');
    const templateID = cdsRuntime.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Unico template senza embedding' });
    const versionID = cdsRuntime.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cdsRuntime.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cdsRuntime.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo unico.', dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cdsRuntime.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    mockEmbeddings
      .mockResolvedValueOnce([[1, 0, 0]])
      .mockResolvedValueOnce([[1, 0, 0], [1, 0, 0]]);

    const risultato = await cds.tx(async (tx) => trovaRiferimento([{ numero: 1, titolo: 'Oggetto', testo: 'Testo caricato.' }], tx));

    expect(risultato).not.toBeNull();
    expect(risultato.templateID).toBe(templateID);
    expect(risultato.coveragePercent).toBe(100);
  });
});