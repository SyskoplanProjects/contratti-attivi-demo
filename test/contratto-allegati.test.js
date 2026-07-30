const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(),
  // stesso embedding per qualunque testo -> similarity 1.0 con qualunque profilo di riferimento,
  // il codice sceglie il primo profilo (indice 0) essendo tutte le similarity uguali.
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');
const { Document, Packer, Paragraph } = require('docx');

async function seedContratto() {
  const { Template, TemplateVersion, Contratto } = cds.entities('com.reply.contrattiattivi');
  const templateID = cds.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome: 'Template allegati test' });
  const versionID = cds.utils.uuid();
  await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
  const contrattoID = cds.utils.uuid();
  await INSERT.into(Contratto).entries({ ID: contrattoID, intestatario: 'Cliente Allegati Test', stato: 'BOZZA', template_ID: templateID, templateVersion_ID: versionID, responsabile: MOCK_USER.username });
  return contrattoID;
}

describe('classificaAllegatoContratto / aggiungiAllegatoContratto', () => {
  it('classifica un file senza salvarlo, poi lo aggiunge al contratto con il tipo scelto', async () => {
    const contrattoID = await seedContratto();

    const doc = new Document({
      sections: [{ children: [new Paragraph('Documento Unico di Regolarità Contributiva rilasciato da INPS.')] }]
    });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const classifica = await POST('/contratti/classificaAllegatoContratto', {
      filename: 'durc.docx', file: fileBase64
    }, { auth: MOCK_USER });

    expect(classifica.status).toBe(200);
    expect(classifica.data.tipo).toBe(TIPOLOGIE_ALLEGATO[0].key);
    expect(classifica.data.metodoRiconoscimento).toBe('embedding');
    expect(classifica.data.testo).toContain('Documento Unico di Regolarità Contributiva');
    expect(Array.isArray(classifica.data.metadati)).toBe(true);

    const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const primaDelSalvataggio = await SELECT.from(ContrattoAllegato).where({ contratto_ID: contrattoID });
    expect(primaDelSalvataggio).toHaveLength(0);

    const aggiungi = await POST('/contratti/aggiungiAllegatoContratto', {
      contrattoID, filename: 'durc.docx', file: fileBase64,
      tipo: 'DURC', // scelta manuale, eventualmente diversa dal suggerimento
      confidenza: classifica.data.confidenza,
      metodoRiconoscimento: classifica.data.metodoRiconoscimento,
      testo: classifica.data.testo,
      metadati: classifica.data.metadati
    }, { auth: MOCK_USER });

    expect(aggiungi.status).toBe(200);

    const righe = await SELECT.from(ContrattoAllegato).where({ contratto_ID: contrattoID });
    expect(righe).toHaveLength(1);
    expect(righe[0].filename).toBe('durc.docx');
    expect(righe[0].tipo).toBe('DURC');
    expect(righe[0].contenuto).toBe(fileBase64);
    expect(righe[0].testo).toContain('Documento Unico di Regolarità Contributiva');

    const { MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const metadati = await SELECT.from(MetadatoDocumento).where({ allegato_ID: aggiungi.data.ID });
    expect(metadati.length).toBeGreaterThan(0);
  });

  it('rejects aggiungiAllegatoContratto for an unknown contratto', async () => {
    await expect(POST('/contratti/aggiungiAllegatoContratto', {
      contrattoID: cds.utils.uuid(), filename: 'x.docx', file: 'AAAA', tipo: 'ALTRO', metadati: []
    }, { auth: MOCK_USER })).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('rejects aggiungiAllegatoContratto from a user who is not the contract owner', async () => {
    const contrattoID = await seedContratto();
    const ALTRO_UTENTE = { username: 'altra.persona@contrattiattivi.it', password: 'test' };

    await expect(POST('/contratti/aggiungiAllegatoContratto', {
      contrattoID, filename: 'x.docx', file: 'AAAA', tipo: 'ALTRO', metadati: []
    }, { auth: ALTRO_UTENTE })).rejects.toMatchObject({ response: { status: 403 } });

    const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const righe = await SELECT.from(ContrattoAllegato).where({ contratto_ID: contrattoID });
    expect(righe).toHaveLength(0);
  });
});
