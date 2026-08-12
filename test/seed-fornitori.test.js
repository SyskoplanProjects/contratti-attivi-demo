const path = require('path');
const cds = require('@sap/cds');
const { seed } = require('../srv/lib/seed-fornitori');

cds.test(path.join(__dirname, '..'));

describe('seed-fornitori', () => {
  it('imports fornitori from CSV and is idempotent', async () => {
    const n1 = await seed(cds);
    expect(n1).toBe(378); // 377 CSV + 1 fornitore POC (Pegaso, assente dal CSV)
    const [{ COUNT }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as COUNT']);
    expect(COUNT).toBe(n1);
    const n2 = await seed(cds);
    expect(n2).toBe(n1);
    const [{ c2 }] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').columns(['count(*) as c2']);
    expect(c2).toBe(n1);
  });

  it('excludes CSV rows with at least one empty field (POC placeholders esenti)', async () => {
    const all = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where(`idSapFornitore not like 'POC-%'`);
    const fields = ['idSapFornitore','codiceAteco','rischioEmissioni','nomeFornitore','codiceFiscale',
      'dataAttivazione','numAddetti','cgsScore','fatturatoTot','annoFatturatoTot',
      'protesti','pregiudizievoli','scoreVendorRating'];
    const empty = all.filter(r => fields.some(f => r[f] === null || r[f] === '' || (typeof r[f] === 'string' && !r[f].trim())));
    expect(empty.length).toBe(0);
  });

  it('include i fornitori POC dei contratti reali seed-poc-reali', async () => {
    const poc = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where(`idSapFornitore like 'POC-%'`);
    expect(poc.length).toBe(1);
    expect(poc.map(f => f.nomeFornitore).sort()).toEqual(['Pegaso 2000 S.r.l.']);
  });

  it('parses fatturatoTot and numAddetti correctly', async () => {
    const [step] = await cds.ql.SELECT.from('com.reply.contrattiattivi.Fornitore').where({ nomeFornitore: 'STEP SPA' });
    expect(step.fatturatoTot).toBe(47545);
    expect(step.numAddetti).toBe(158);
  });
});