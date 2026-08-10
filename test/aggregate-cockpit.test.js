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

  test('importoTotaleAnno sums correctly when importo arrives as string (OData v4 Decimal)', () => {
    const contrattiStringa = [
      { stato: 'BOZZA', importo: '100000.00' },
      { stato: 'APPROVATO', importo: '200000.00' }
    ];
    const r = aggregateCockpit({ contratti: contrattiStringa, fornitori: [] });
    expect(r.importoTotaleAnno).toBe(300000);
  });

  describe('buildTrendPeriodo', () => {
    it('percentuale positiva quando i contratti correnti sono più dei precedenti', () => {
      const corrente = [{}, {}, {}]; // 3
      const precedente = [{}, {}]; // 2
      const r = aggregateCockpit.buildTrendPeriodo(corrente, precedente);
      expect(r).toEqual({ valore: 3, percentuale: 50, direzione: 'up' });
    });

    it('percentuale negativa quando i contratti correnti sono meno dei precedenti', () => {
      const corrente = [{}, {}]; // 2
      const precedente = [{}, {}, {}, {}]; // 4
      const r = aggregateCockpit.buildTrendPeriodo(corrente, precedente);
      expect(r).toEqual({ valore: 2, percentuale: -50, direzione: 'down' });
    });

    it('percentuale 100 quando il periodo precedente è vuoto ma quello corrente no', () => {
      const r = aggregateCockpit.buildTrendPeriodo([{}, {}], []);
      expect(r).toEqual({ valore: 2, percentuale: 100, direzione: 'up' });
    });

    it('percentuale 0 quando entrambi i periodi sono vuoti', () => {
      const r = aggregateCockpit.buildTrendPeriodo([], []);
      expect(r).toEqual({ valore: 0, percentuale: 0, direzione: 'up' });
    });
  });

  describe('buildTrendPeriodoImporto', () => {
    it('percentuale calcolata sulla somma degli importi, non sul conteggio', () => {
      const corrente = [{ importo: 100 }, { importo: 50 }]; // somma 150
      const precedente = [{ importo: 100 }]; // somma 100
      const r = aggregateCockpit.buildTrendPeriodoImporto(corrente, precedente);
      expect(r).toEqual({ valore: 150, percentuale: 50, direzione: 'up' });
    });

    it('gestisce importo string (OData v4 Decimal) come aggregateCockpit principale', () => {
      const corrente = [{ importo: '200.00' }];
      const precedente = [{ importo: '100.00' }];
      const r = aggregateCockpit.buildTrendPeriodoImporto(corrente, precedente);
      expect(r.valore).toBe(200);
      expect(r.percentuale).toBe(100);
    });
  });
});