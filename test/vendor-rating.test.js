const aggregateCockpit = require('../app/contratti/webapp/model/aggregateCockpit');

describe('buildVendorRating', () => {
  const contratti = [
    { ID: 'a', fornitore_ID: 'F1', importo: 300 },
    { ID: 'b', fornitore_ID: 'F1', importo: 100 },
    { ID: 'c', fornitore_ID: 'F2', importo: 400 },
    { ID: 'd', fornitore_ID: 'F2', importo: 100 },
    { ID: 'e', fornitore_ID: 'F3', importo: 50 }
  ];
  const fornitori = [
    { ID: 'F1', nomeFornitore: 'Alfa', fatturatoTot: 500 },
    { ID: 'F2', nomeFornitore: 'Beta', fatturatoTot: null },
    { ID: 'F3', nomeFornitore: 'Gamma', fatturatoTot: 100 },
    { ID: 'F4', nomeFornitore: 'Delta', fatturatoTot: 999 }
  ];

  it('somma importi, conta, calcola indice', () => {
    const rows = aggregateCockpit.buildVendorRating(contratti, fornitori);
    expect(rows).toHaveLength(3);
    const alfa = rows.find(r => r.nome === 'Alfa');
    expect(alfa.numeroContratti).toBe(2);
    expect(alfa.totaleContratti).toBe(400);
    expect(alfa.indiceDipendenza).toBe(80);
    expect(rows[0].nome).toBe('Beta');
  });

  it('indice null quando fatturatoTot nullo o zero', () => {
    const rows = aggregateCockpit.buildVendorRating(contratti, fornitori);
    const beta = rows.find(r => r.nome === 'Beta');
    expect(beta.indiceDipendenza).toBeNull();
    const zero = aggregateCockpit.buildVendorRating(
      [{ ID: 'x', fornitore_ID: 'F1', importo: 10 }],
      [{ ID: 'F1', nomeFornitore: 'Alfa', fatturatoTot: 0 }]
    );
    expect(zero[0].indiceDipendenza).toBeNull();
  });

  it('fornitore senza contratti escluso', () => {
    const rows = aggregateCockpit.buildVendorRating(contratti, fornitori);
    expect(rows.some(r => r.nome === 'Delta')).toBe(false);
  });
});

describe('rischio fornitore', () => {
  const d = require('../app/contratti/webapp/model/dashboardUtils');
  it('protesti Si => alto', () => {
    expect(d.buildRischioFornitore({ protesti: 'Si' }).livello).toBe('alto');
  });
  it('cgs 8 => alto, cgs 6 => medio, cgs 3 => basso', () => {
    expect(d.buildRischioFornitore({ cgsScore: '8 - RISCHIO' }).livello).toBe('alto');
    expect(d.buildRischioFornitore({ cgsScore: '6 - SOLVIBILITA MODERATA' }).livello).toBe('medio');
    expect(d.buildRischioFornitore({ cgsScore: '3 - AMPIA SOLVIBILITA' }).livello).toBe('basso');
  });
  it('High Risk emission => alto', () => {
    expect(d.buildRischioFornitore({ rischioEmissioni: 'High Risk emission' }).livello).toBe('alto');
  });
  it('scoreVendorRating < 50 => medio', () => {
    expect(d.buildRischioFornitore({ scoreVendorRating: '45.5' }).livello).toBe('medio');
  });
  it('nessun dato => nd', () => {
    expect(d.buildRischioFornitore({}).livello).toBe('nd');
  });
});