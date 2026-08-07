const path = require('path');
const cds = require('@sap/cds');
const { seed } = require('../srv/lib/seed-fornitori');

cds.test(path.join(__dirname, '..'));

describe('seed-fornitori', () => {
  it('imports fornitori from CSV and is idempotent', async () => {
    const n1 = await seed(cds);
    expect(n1).toBe(377);
    const [{ COUNT }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as COUNT']);
    expect(COUNT).toBe(n1);
    const n2 = await seed(cds);
    expect(n2).toBe(n1);
    const [{ c2 }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as c2']);
    expect(c2).toBe(n1);
  });

  it('excludes rows with at least one empty field', async () => {
    const all = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore');
    const fields = ['idSapFornitore','codiceAteco','rischioEmissioni','nomeFornitore','codiceFiscale',
      'dataAttivazione','numAddetti','cgsScore','fatturatoTot','annoFatturatoTot',
      'protesti','pregiudizievoli','scoreVendorRating'];
    const empty = all.filter(r => fields.some(f => r[f] === null || r[f] === '' || (typeof r[f] === 'string' && !r[f].trim())));
    expect(empty.length).toBe(0);
  });

  it('parses fatturatoTot and numAddetti correctly', async () => {
    const [step] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where({ nomeFornitore: 'STEP SPA' });
    expect(step.fatturatoTot).toBe(47545);
    expect(step.numAddetti).toBe(158);
  });
});