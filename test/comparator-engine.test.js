const { calcolaCoverage, buildTemplateClausoleMap, cercaUtilizzoClausola } = require('../srv/lib/comparator-engine');

describe('comparator-engine', () => {
  it('exports calcolaCoverage', () => {
    expect(typeof calcolaCoverage).toBe('function');
  });
  it('exports buildTemplateClausoleMap', () => {
    expect(typeof buildTemplateClausoleMap).toBe('function');
  });
  it('exports cercaUtilizzoClausola', () => {
    expect(typeof cercaUtilizzoClausola).toBe('function');
  });
});
