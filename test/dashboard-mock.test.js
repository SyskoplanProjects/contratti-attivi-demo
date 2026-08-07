const dashboardUtils = require('../app/contratti/webapp/model/dashboardUtils');

describe('dashboardUtils.matchFornitore', () => {
  test('exact match (case/space insensitive)', () => {
    expect(dashboardUtils.matchFornitore('Banca Alpha S.p.A.', '  banca alpha s.p.a.  ')).toBe(true);
  });
  test('partial match: fornitore name contained in intestatario', () => {
    expect(dashboardUtils.matchFornitore('CloudTech Provider S.r.l.', 'Contratto CloudTech Provider S.r.l. 2026')).toBe(true);
  });
  test('no match', () => {
    expect(dashboardUtils.matchFornitore('Reply S.p.A.', 'Banca Alpha S.p.A.')).toBe(false);
  });
  test('empty inputs never match', () => {
    expect(dashboardUtils.matchFornitore('', 'Banca Alpha S.p.A.')).toBe(false);
    expect(dashboardUtils.matchFornitore('Reply S.p.A.', '')).toBe(false);
  });
});

describe('dashboardUtils.buildDonutGradient', () => {
  test('two segments produce a conic-gradient with two color stops summing to 360deg', () => {
    const sGradient = dashboardUtils.buildDonutGradient([
      { value: 30, color: '#0a6ed1' },
      { value: 70, color: '#e9730c' }
    ]);
    expect(sGradient).toBe('conic-gradient(#0a6ed1 0.00deg 108.00deg, #e9730c 108.00deg 360.00deg)');
  });
});

describe('dashboardUtils.buildDonutHtml', () => {
  test('renders total in the donut hole and one legend row per segment', () => {
    const sHtml = dashboardUtils.buildDonutHtml([
      { label: 'DORA', value: 29, color: '#0a6ed1' },
      { label: 'Altro', value: 18, color: '#e9730c' }
    ]);
    expect(sHtml).toContain('app-donut-hole');
    expect(sHtml).toContain('>47<');
    expect(sHtml).toContain('DORA');
    expect(sHtml).toContain('61.7%');
    expect(sHtml).toContain('Altro');
    expect(sHtml).toContain('38.3%');
  });

  test('escapes malicious label and color values (XSS regression)', () => {
    const sHtml = dashboardUtils.buildDonutHtml([
      { label: '<img onerror=x>', value: 1, color: '"><b>inject</b>' }
    ]);
    expect(sHtml).not.toContain('<img onerror=x>');
    expect(sHtml).not.toContain('"><b>inject</b>');
    expect(sHtml).toContain('&lt;img onerror=x&gt;');
  });
});

describe('dashboardUtils.buildTrendHtml', () => {
  test('renders one column per month with attivati/scadenza bars', () => {
    const sHtml = dashboardUtils.buildTrendHtml([
      { mese: 'Gen', attivati: 5, scadenza: 2 },
      { mese: 'Feb', attivati: 3, scadenza: 1 }
    ]);
    const aCols = sHtml.match(/app-trend-col/g) || [];
    expect(aCols.length).toBe(2);
    expect(sHtml).toContain('Attivati: 5');
    expect(sHtml).toContain('In scadenza: 2');
    expect(sHtml).toContain('>Gen<');
    expect(sHtml).toContain('>Feb<');
  });

  test('tallest bar in the set reaches 100% height', () => {
    const sHtml = dashboardUtils.buildTrendHtml([
      { mese: 'Gen', attivati: 10, scadenza: 2 }
    ]);
    expect(sHtml).toContain('height:100%');
  });
});

describe('dashboardUtils.buildTopFornitoriHtml', () => {
  const aTop = [
    { nome: 'A', value: 100000 },
    { nome: 'B', value: 900000 },
    { nome: 'C', value: 120000 },
    { nome: 'D', value: 5000 }
  ];

  test('sorts desc by value and renders top name first', () => {
    const sHtml = dashboardUtils.buildTopFornitoriHtml(aTop, 'fatturato');
    const iB = sHtml.indexOf('>B<');
    const iA = sHtml.indexOf('>A<');
    expect(iB).toBeGreaterThan(-1);
    expect(iB).toBeLessThan(iA);
    expect(sHtml).toContain('€ 900k');
  });

  test('caps rendered rows at 8', () => {
    const aMany = Array.from({ length: 12 }, (_, i) => ({ nome: 'F' + i, value: (12 - i) * 1000 }));
    const sHtml = dashboardUtils.buildTopFornitoriHtml(aMany, 'value');
    const aRows = sHtml.match(/app-topf-row/g) || [];
    expect(aRows.length).toBe(8);
  });
});
