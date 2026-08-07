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
});