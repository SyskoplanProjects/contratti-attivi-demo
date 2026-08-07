const { TEMPLATE, CONTRATTI } = require('../srv/lib/demo-data');

describe('demo-data', () => {
  test('has at least 15 contratti', () => {
    expect(CONTRATTI.length).toBeGreaterThanOrEqual(15);
  });

  test('each contratto has valid fields', () => {
    const stati = ['BOZZA', 'IN_REVISIONE', 'APPROVATO', 'FIRMATO'];
    const cat = ['fornitura', 'servizio', 'consulenza', 'NDA', 'altro'];
    const esiti = ['ok', 'non_conforme', 'in_corso'];
    CONTRATTI.forEach(c => {
      expect(c.intestatario).toBeTruthy();
      expect(c.importo).toBeGreaterThan(0);
      expect(c.dataStipula).toBeTruthy();
      expect(stati).toContain(c.statoFinale);
      expect(cat).toContain(c.categoria || 'fornitura');
      if (c.esitoVerifica) expect(esiti).toContain(c.esitoVerifica);
    });
  });

  test('declares dataScadenza when dataStipula present', () => {
    expect(CONTRATTI.every(c => !c.dataStipula || c.dataScadenza)).toBe(true);
  });
});