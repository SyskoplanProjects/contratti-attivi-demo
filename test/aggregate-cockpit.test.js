const aggregateCockpit = require('../app/contratti/webapp/model/aggregateCockpit');

describe('aggregateCockpit', () => {
  const contratti = [
    { stato: 'BOZZA', categoria: 'fornitura', esitoVerifica: 'in_corso', dataStipula: '2026-01-15', dataScadenza: '2026-06-15', importo: 100000 },
    { stato: 'IN_REVISIONE', categoria: 'fornitura', esitoVerifica: 'ok', dataStipula: '2026-02-10', dataScadenza: '2026-08-10', importo: 200000 },
    { stato: 'APPROVATO', categoria: 'NDA', esitoVerifica: 'non_conforme', dataStipula: '2026-03-20', dataScadenza: '2027-03-20', importo: 500000 },
    { stato: 'ARCHIVIATO', categoria: 'servizio', esitoVerifica: null, dataStipula: '2025-01-01', dataScadenza: '2025-12-31', importo: 999999 }
  ];
  const fornitori = [
    { nomeFornitore: 'STEP SPA', fatturatoTot: 47545, numAddetti: 158 },
    { nomeFornitore: 'HSPI SPA', fatturatoTot: 900000, numAddetti: 80 }
  ];

  test('excludes ARCHIVIATO from totals', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.totaleContratti).toBe(3);
    expect(r.importoTotaleAnno).toBe(800000);
  });

  test('donut tipologia groups by categoria with correct counts', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    const fornitura = r.donutTipologia.find(s => s.label === 'fornitura');
    expect(fornitura.value).toBe(2);
  });

  test('donut survey maps esitoVerifica to labels (excludes ARCHIVIATO)', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.donutSurvey.every(s => s.value > 0)).toBe(true);
    expect(r.donutSurvey.map(s => s.value).reduce((a, b) => a + b, 0)).toBe(3);
  });

  test('trend has 12 months', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.trend.length).toBe(12);
  });

  test('topFornitori sorted desc by fatturato, capped at 8', () => {
    const r = aggregateCockpit({ contratti, fornitori });
    expect(r.topFornitori[0].nome).toBe('HSPI SPA');
    expect(r.topFornitori[0].value).toBe(900000);
  });
});