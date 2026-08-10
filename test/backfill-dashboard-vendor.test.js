const path = require('path');
const cds = require('@sap/cds');
cds.test(path.join(__dirname, '..'));
const { backfill } = require('../srv/lib/backfill-dashboard-vendor');

describe('backfill dashboard vendor', () => {
  it('collega intestatario a fornitore e genera codici, idempotente', async () => {
    const { Contratto, Fornitore, Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const fID = cds.utils.uuid();
    await INSERT.into(Fornitore).entries({ ID: fID, idSapFornitore: 'S1', nomeFornitore: 'APPIAN SOFTWARE INTERNATIONAL' });
    const tID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: tID, nome: 'T' });
    const vID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: vID, template_ID: tID, numero: 0, dataCreazione: new Date().toISOString() });
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), intestatario: 'APPIAN SOFTWARE INTERNATIONAL', template_ID: tID, templateVersion_ID: vID });
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), intestatario: 'Nessun Match Qui', template_ID: tID, templateVersion_ID: vID });

    const r1 = await backfill(cds);
    expect(r1.matchati).toBe(1);
    expect(r1.codici).toBe(2);
    const c1 = await SELECT.one.from(Contratto).where({ intestatario: 'APPIAN SOFTWARE INTERNATIONAL' });
    const c2 = await SELECT.one.from(Contratto).where({ intestatario: 'Nessun Match Qui' });
    expect(c1.fornitore_ID).toBe(fID);
    expect(c2.fornitore_ID).toBeNull();
    expect(c1.codice).toMatch(/^CONTR-\d{4}$/);
    expect(c2.codice).toMatch(/^CONTR-\d{4}$/);
    expect(c1.codice).not.toBe(c2.codice);

    const r2 = await backfill(cds);
    expect(r2.matchati).toBe(0);
    expect(r2.codici).toBe(0);
    const c3 = await SELECT.one.from(Contratto).where({ intestatario: 'APPIAN SOFTWARE INTERNATIONAL' });
    expect(c3.fornitore_ID).toBe(fID);
  });
});