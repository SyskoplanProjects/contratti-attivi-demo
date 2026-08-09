const path = require('path');
const cds = require('@sap/cds');

cds.test(path.join(__dirname, '..'));

jest.mock('../srv/lib/ai-import', () => ({
  estraiClausoleConFallback: jest.fn()
}));

const { estraiClausoleConFallback } = require('../srv/lib/ai-import');
const { creaTemplateDaFileMultipli } = require('../srv/lib/import-commit');

describe('creaTemplateDaFileMultipli', () => {
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

    const result = await cds.tx(tx => creaTemplateDaFileMultipli(tx, 'Template Unito', fileList));

    expect(result.clausoleCreate).toBe(5);
    expect(result.templateID).toBeDefined();

    const { Clausola, TemplateVersionClausola, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const versions = await SELECT.from(TemplateVersion).where({ template_ID: result.templateID });
    expect(versions).toHaveLength(1);

    const righe = await SELECT.from(TemplateVersionClausola)
      .where({ templateVersion_ID: versions[0].ID }).orderBy('ordine');
    expect(righe).toHaveLength(5);

    const clausole = [];
    for (const r of righe) clausole.push(await SELECT.one.from(Clausola, r.clausola_ID));

    expect(clausole.map(c => c.codice)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(clausole.map(c => c.titolo)).toEqual(['Oggetto', 'Durata', 'Riservatezza', 'Foro competente', 'Recesso']);
  });

  it('salva il nome esattamente come passato', async () => {
    estraiClausoleConFallback.mockResolvedValueOnce([{ numero: 1, titolo: 'Oggetto', testo: 'Testo.' }]);

    const result = await cds.tx(tx => creaTemplateDaFileMultipli(tx, 'Il Mio Template Custom', [
      { buffer: Buffer.from('f'), filename: 'a.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ]));

    const { Template } = cds.entities('com.reply.contrattiattivi');
    const template = await SELECT.one.from(Template, result.templateID);
    expect(template.nome).toBe('Il Mio Template Custom');
  });

  it('è atomico: se un file fallisce l\'estrazione non scrive nulla nel DB', async () => {
    estraiClausoleConFallback
      .mockResolvedValueOnce([{ numero: 1, titolo: 'Oggetto', testo: 'Testo ok.' }])
      .mockRejectedValueOnce(new Error('formato non supportato'));

    const { Template } = cds.entities('com.reply.contrattiattivi');
    const templatesPrima = await SELECT.from(Template);

    const fileList = [
      { buffer: Buffer.from('f1'), filename: 'ok.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { buffer: Buffer.from('f2'), filename: 'rotto.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ];

    await expect(cds.tx(tx => creaTemplateDaFileMultipli(tx, 'Template Fallito', fileList)))
      .rejects.toMatchObject({ code: 'EXTRACTION_FAILED', message: expect.stringContaining('rotto.docx') });

    const templatesDopo = await SELECT.from(Template);
    expect(templatesDopo).toHaveLength(templatesPrima.length);
  });
});
