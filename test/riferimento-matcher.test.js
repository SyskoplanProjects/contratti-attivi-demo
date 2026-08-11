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
    expect(risultato.migliore.templateID).toBe(templateVicinoID);
    expect(risultato.migliore.tipo).toBe('CLIENTE');
    expect(risultato.migliore.coveragePercent).toBe(100);
    expect(risultato.candidati).toHaveLength(2);
    expect(risultato.candidati[0].templateID).toBe(templateVicinoID);
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
    expect(risultato.migliore.templateID).toBe(templateID);
    expect(risultato.migliore.coveragePercent).toBe(100);
  });

  it('doppia scrematura: con annoContratto noto, restringe la shortlist ai Template della stessa epoca prima del ranking per similarity', async () => {
    const { Template } = cdsRuntime.entities('com.reply.contrattiattivi');
    const template2024ID = await creaTemplateConEmbedding('Template 2024', 'CLIENTE', [0, 1, 0], [{ titolo: 'Oggetto', testo: 'Testo 2024.' }]);
    const template2026ID = await creaTemplateConEmbedding('Template 2026', 'CLIENTE', [1, 0, 0], [{ titolo: 'Oggetto', testo: 'Testo 2026.' }]);
    await UPDATE(Template, template2024ID).with({ annoRiferimento: 2024 });
    await UPDATE(Template, template2026ID).with({ annoRiferimento: 2026 });

    // Documento caricato più vicino (cosine) al template 2024, ma annoContratto=2026: la
    // scrematura per epoca deve restringere il pool al solo template 2026 prima ancora di
    // calcolare la similarity, quindi vince 2026 nonostante la similarity peggiore.
    mockEmbeddings
      .mockResolvedValueOnce([[0, 1, 0]])
      .mockResolvedValueOnce([[0, 1, 0], [1, 0, 0]]);

    const risultato = await cds.tx(async (tx) =>
      trovaRiferimento([{ numero: 1, titolo: 'Oggetto', testo: 'Testo caricato.' }], tx, 2026));

    expect(risultato).not.toBeNull();
    expect(risultato.candidati).toHaveLength(1);
    expect(risultato.migliore.templateID).toBe(template2026ID);
  });
});