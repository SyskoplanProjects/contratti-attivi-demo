const path = require('path');
const cds = require('@sap/cds');
const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const { prossimoCodiceContratto } = require('../srv/lib/codice-contratto');

describe('codice contratto', () => {
  it('genera codice progressivo successivo al massimo esistente', async () => {
    const { Contratto, Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const tID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: tID, nome: 'T' });
    const vID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: vID, template_ID: tID, numero: 0, dataCreazione: new Date().toISOString() });
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), codice: 'CONTR-0007', intestatario: 'A', template_ID: tID, templateVersion_ID: vID });
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), codice: 'CONTR-0042', intestatario: 'B', template_ID: tID, templateVersion_ID: vID });
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), intestatario: 'C', template_ID: tID, templateVersion_ID: vID });
    const tx = cds.db;
    expect(await prossimoCodiceContratto(tx)).toBe('CONTR-0043');
    const codici = await SELECT.from(Contratto).where(`codice like 'CONTR-%'`).columns('codice');
    expect(codici.length).toBe(2);
  });

  it('POST /contratti/Contratto assegna codice quando assente', async () => {
    const { Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const tID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: tID, nome: 'T2' });
    const vID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: vID, template_ID: tID, numero: 0, dataCreazione: new Date().toISOString() });
    const res = await POST('/contratti/Contratto', { intestatario: 'X', stato: 'BOZZA', template_ID: tID, templateVersion_ID: vID }, { auth: MOCK_USER });
    expect(res.status).toBe(201);
    expect(res.data.codice).toMatch(/^CONTR-\d{4}$/);
  });
});