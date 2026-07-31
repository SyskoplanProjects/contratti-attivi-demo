const path = require('path');
const cds = require('@sap/cds');

cds.test(path.join(__dirname, '..'));

describe('CDS Fase B — azioni dichiarate', () => {
  it('ComparatorService espone le azioni RF8/RF9', () => {
    const service = cds.model.services.find(s => s.name === 'ComparatorService');
    expect(service).toBeDefined();
    const azioni = Object.keys(service.actions || {});
    ['getDashboardKPIs', 'getAnomalie', 'assegnaAnomalia', 'avviaLavorazione', 'risolviAnomalia', 'chiudiAnomalia']
      .forEach(a => expect(azioni).toContain(a));
  });
});
