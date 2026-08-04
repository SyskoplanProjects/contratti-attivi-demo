const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

describe('schema Template.tipoRiferimento / TemplateVersion.embeddingDocumento', () => {
  it('Template.tipoRiferimento defaults to CLIENTE when not set', async () => {
    const { Template } = cds.entities('com.reply.contrattiattivi');
    const ID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID, nome: 'Template di prova' });
    const riga = await SELECT.one.from(Template, ID);
    expect(riga.tipoRiferimento).toBe('CLIENTE');
  });

  it('Template.tipoRiferimento accetta STANDARD esplicito', async () => {
    const { Template } = cds.entities('com.reply.contrattiattivi');
    const ID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID, nome: 'Template standard', tipoRiferimento: 'STANDARD' });
    const riga = await SELECT.one.from(Template, ID);
    expect(riga.tipoRiferimento).toBe('STANDARD');
  });

  it('TemplateVersion.embeddingDocumento accetta un JSON di embedding o null', async () => {
    const { Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template con embedding' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0,
      dataCreazione: new Date().toISOString(), embeddingDocumento: JSON.stringify([0.1, 0.2, 0.3])
    });
    const riga = await SELECT.one.from(TemplateVersion, versionID);
    expect(JSON.parse(riga.embeddingDocumento)).toEqual([0.1, 0.2, 0.3]);
  });

  it('creaTemplateManuale senza tipoRiferimento crea un Template CLIENTE (default)', async () => {
    const res = await POST('/contratti/creaTemplateManuale', {
      nome: 'Template manuale cliente', tipoServizio: 'Test', descrizione: '',
      clausole: [{ titolo: 'Oggetto', testo: 'Testo clausola.' }],
      testata: { intestatario: 'Acme S.p.A.' }
    }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    const { Template } = cds.entities('com.reply.contrattiattivi');
    const riga = await SELECT.one.from(Template, res.data.template_ID);
    expect(riga.tipoRiferimento).toBe('CLIENTE');
  });

  it('creaTemplateManuale con tipoRiferimento=STANDARD crea un Template STANDARD', async () => {
    const res = await POST('/contratti/creaTemplateManuale', {
      nome: 'Template manuale standard', tipoServizio: 'Test', descrizione: '', tipoRiferimento: 'STANDARD',
      clausole: [{ titolo: 'Oggetto', testo: 'Testo clausola.' }],
      testata: { intestatario: 'Acme S.p.A.' }
    }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    const { Template } = cds.entities('com.reply.contrattiattivi');
    const riga = await SELECT.one.from(Template, res.data.template_ID);
    expect(riga.tipoRiferimento).toBe('STANDARD');
  });
});