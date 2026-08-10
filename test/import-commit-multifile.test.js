const path = require('path');
const cds = require('@sap/cds');

cds.test(path.join(__dirname, '..'));

jest.mock('../srv/lib/ai-import', () => ({
  estraiClausoleConFallback: jest.fn()
}));

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(),
  embeddings: jest.fn().mockResolvedValue([[0.1, 0.2]])
}));

const { estraiClausoleConFallback } = require('../srv/lib/ai-import');
const { estraiClausoleMultiFile, creaTemplateDaClausole } = require('../srv/lib/import-commit');

describe('estraiClausoleMultiFile + creaTemplateDaClausole', () => {
  beforeEach(() => { estraiClausoleConFallback.mockReset(); });

  it('unisce le clausole di più file in un template nuovo, con codice sequenziale senza collisioni', async () => {
    estraiClausoleConFallback
      .mockResolvedValueOnce([
        { numero: 1, titolo: 'Oggetto', testo: 'Testo oggetto file 1.' },
        { numero: 2, titolo: 'Durata', testo: 'Testo durata file 1.' }
      ])
      .mockResolvedValueOnce([
        { numero: 1, titolo: 'Riservatezza', testo: 'Testo riservatezza file 2.' },
        { numero: 2, titolo: 'Foro competente', testo: 'Testo foro file 2.' },
        { numero: 3, titolo: 'Recesso', testo: 'Testo recesso file 2.' }
      ]);

    const fileList = [
      { buffer: Buffer.from('file1'), filename: 'cgc.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { buffer: Buffer.from('file2'), filename: 'cpc.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ];

    const clausoleUnite = await estraiClausoleMultiFile(fileList);
    const result = await cds.tx(tx => creaTemplateDaClausole(tx, 'Template Unito', clausoleUnite));

    expect(result.clausoleCreate).toBe(5);
    expect(result.templateID).toBeDefined();

    const { Clausola, TemplateVersionClausola, TemplateVersion, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const versions = await SELECT.from(TemplateVersion).where({ template_ID: result.templateID });
    expect(versions).toHaveLength(1);

    const righe = await SELECT.from(TemplateVersionClausola)
      .where({ templateVersion_ID: versions[0].ID }).orderBy('ordine');
    expect(righe).toHaveLength(5);

    const clausole = [];
    for (const r of righe) clausole.push(await SELECT.one.from(Clausola, r.clausola_ID));

    expect(clausole.map(c => c.codice)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(clausole.map(c => c.titolo)).toEqual(['Oggetto', 'Durata', 'Riservatezza', 'Foro competente', 'Recesso']);

    // Verify templateVersionOrigine_ID is set for all created clause versions
    for (const r of righe) {
      const clausolaVersione = await SELECT.one.from(ClausolaVersione, r.clausolaVersione_ID);
      expect(clausolaVersione.templateVersionOrigine_ID).toBe(versions[0].ID);
    }
  });

  it('salva il nome esattamente come passato', async () => {
    estraiClausoleConFallback.mockResolvedValueOnce([{ numero: 1, titolo: 'Oggetto', testo: 'Testo.' }]);

    const fileList = [
      { buffer: Buffer.from('f'), filename: 'a.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ];
    const clausoleUnite = await estraiClausoleMultiFile(fileList);
    const result = await cds.tx(tx => creaTemplateDaClausole(tx, 'Il Mio Template Custom', clausoleUnite));

    const { Template } = cds.entities('com.reply.contrattiattivi');
    const template = await SELECT.one.from(Template, result.templateID);
    expect(template.nome).toBe('Il Mio Template Custom');
  });

  it('è atomico: se un file fallisce l\'estrazione non scrive nulla nel DB (l\'estrazione fallisce prima di raggiungere il DB)', async () => {
    estraiClausoleConFallback
      .mockResolvedValueOnce([{ numero: 1, titolo: 'Oggetto', testo: 'Testo ok.' }])
      .mockRejectedValueOnce(new Error('formato non supportato'));

    const { Template } = cds.entities('com.reply.contrattiattivi');
    const templatesPrima = await SELECT.from(Template);

    const fileList = [
      { buffer: Buffer.from('f1'), filename: 'ok.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { buffer: Buffer.from('f2'), filename: 'rotto.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ];

    // estraiClausoleMultiFile non tocca mai il DB: l'estrazione fallisce prima che
    // creaTemplateDaClausole venga anche solo invocata.
    await expect(estraiClausoleMultiFile(fileList))
      .rejects.toMatchObject({ code: 'EXTRACTION_FAILED', message: expect.stringContaining('rotto.docx') });

    const templatesDopo = await SELECT.from(Template);
    expect(templatesDopo).toHaveLength(templatesPrima.length);
  });
});
