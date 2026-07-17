const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(),
  // stesso embedding per qualunque testo -> similarity 1.0 con qualunque profilo di riferimento,
  // il codice sceglie il primo profilo (indice 0) essendo tutte le similarity uguali.
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST, GET, axios } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');
const previewStore = require('../srv/lib/preview-store');
const { Document, Packer, Paragraph } = require('docx');

describe('classificaAllegati / confirmCoverage allegati', () => {
  it('classifica un allegato e lo persiste su ContrattoAllegato alla conferma', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100
    });

    const doc = new Document({
      sections: [{ children: [new Paragraph('Documento Unico di Regolarità Contributiva rilasciato da INPS.')] }]
    });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const classifica = await POST('/comparator/classificaAllegati', {
      previewID,
      allegati: [{ filename: 'durc.docx', file: fileBase64 }]
    }, { auth: MOCK_USER });

    expect(classifica.status).toBe(200);
    expect(classifica.data.value).toHaveLength(1);
    expect(classifica.data.value[0].filename).toBe('durc.docx');
    expect(classifica.data.value[0].tipo).toBe(TIPOLOGIE_ALLEGATO[0].key);
    expect(classifica.data.value[0].metodoRiconoscimento).toBe('embedding');

    const conferma = await POST('/comparator/confirmCoverage', {
      previewID,
      clausole: [],
      allegati: [{ filename: 'durc.docx', tipo: 'DURC' }] // correzione manuale rispetto al suggerimento
    }, { auth: MOCK_USER });

    expect(conferma.status).toBe(200);

    const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const righe = await SELECT.from(ContrattoAllegato).where({ contratto_ID: conferma.data.ID });
    expect(righe).toHaveLength(1);
    expect(righe[0].filename).toBe('durc.docx');
    expect(righe[0].tipo).toBe('DURC');
    expect(righe[0].contenuto).toBe(fileBase64);
    expect(righe[0].testo.trim()).toBe('Documento Unico di Regolarità Contributiva rilasciato da INPS.');

    const viaOData = await GET(
      `/contratti/ContrattoAllegato?$filter=contratto_ID eq ${conferma.data.ID}`,
      { auth: MOCK_USER }
    );
    expect(viaOData.data.value).toHaveLength(1);
    expect(viaOData.data.value[0].filename).toBe('durc.docx');

    const download = await axios.get(`/contratti/scaricaAllegato/${righe[0].ID}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    });
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('durc.docx');
    expect(Buffer.from(download.data).toString('base64')).toBe(fileBase64);

    await expect(axios.get(`/contratti/scaricaAllegato/${righe[0].ID}`))
      .rejects.toMatchObject({ response: { status: 401 } });
  });

  it('sanitizes a malicious filename before writing response headers', async () => {
    const { Contratto, TemplateVersion, Template, ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template header-test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, intestatario: 'Header Test', stato: 'BOZZA', template_ID: templateID, templateVersion_ID: versionID });

    const allegatoID = cds.utils.uuid();
    const filenameMalevolo = 'evil.docx"\r\nX-Injected: yes\r\n';
    await INSERT.into(ContrattoAllegato).entries({
      ID: allegatoID, contratto_ID: contrattoID, filename: filenameMalevolo,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contenuto: Buffer.from('x').toString('base64'), tipo: 'ALTRO'
    });

    const download = await axios.get(`/contratti/scaricaAllegato/${allegatoID}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    });

    expect(download.status).toBe(200);
    expect(download.headers['x-injected']).toBeUndefined();
    expect(download.headers['content-disposition']).not.toMatch(/[\r\n]/);
  });
});
