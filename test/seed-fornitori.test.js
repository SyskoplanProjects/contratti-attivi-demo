const path = require('path');
const cds = require('@sap/cds');
const { seed } = require('../srv/lib/seed-fornitori');

cds.test(path.join(__dirname, '..'));

describe('seed-fornitori', () => {
  it('imports fornitori from CSV and is idempotent', async () => {
    const n1 = await seed(cds);
    expect(n1).toBeGreaterThan(4000);
    const [{ COUNT }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as COUNT']);
    expect(COUNT).toBe(n1);
    const n2 = await seed(cds);
    expect(n2).toBe(n1);
    const [{ c2 }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as c2']);
    expect(c2).toBe(n1);
  });

  it('parses fatturatoTot and numAddetti correctly', async () => {
    const [step] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where({ nomeFornitore: 'STEP SPA' });
    expect(step.fatturatoTot).toBe(47545);
    expect(step.numAddetti).toBe(158);
    const [dussmann] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where({ nomeFornitore: 'DUSSMANN SERVICE S.R.L.' });
    expect(dussmann.fatturatoTot).toBe(1041931);
    expect(dussmann.numAddetti).toBeNull();
    const [tirassa] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where({ nomeFornitore: 'GIUSEPPE TIRASSA SRL' });
    expect(tirassa.fatturatoTot).toBe(524);
    expect(tirassa.numAddetti).toBe(5);
  });
});