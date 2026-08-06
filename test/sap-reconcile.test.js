const { verificaAllineamentoSAP } = require('../srv/lib/sap-reconcile');

describe('sap-reconcile (RF7 — riconciliazione dati contratto vs SAP)', () => {
  it('campo allineato quando data contratto e SAP coincidono', () => {
    const metadati = [{ campo: 'dataDecorrenza', valore: '2025-01-01' }];
    const risultati = verificaAllineamentoSAP(metadati, { dataDecorrenza: '2025-01-01' });
    expect(risultati).toHaveLength(1);
    expect(risultati[0]).toMatchObject({ campo: 'dataDecorrenza', esito: 'allineato' });
  });

  it('campo incoerente quando le date differiscono', () => {
    const metadati = [{ campo: 'dataScadenza', valore: '2025-12-31' }];
    const risultati = verificaAllineamentoSAP(metadati, { dataScadenza: '2026-01-31' });
    expect(risultati[0].esito).toBe('incoerente');
  });

  it('importo allineato anche con formati numerici diversi (virgola/punto)', () => {
    const metadati = [{ campo: 'importoContrattuale', valore: '120000.00' }];
    const risultati = verificaAllineamentoSAP(metadati, { importoContrattuale: '120000,00' });
    expect(risultati[0].esito).toBe('allineato');
  });

  it('importo incoerente quando i valori differiscono', () => {
    const metadati = [{ campo: 'importoContrattuale', valore: '100000' }];
    const risultati = verificaAllineamentoSAP(metadati, { importoContrattuale: '200000' });
    expect(risultati[0].esito).toBe('incoerente');
  });

  it('campi SAP non forniti non generano righe di confronto', () => {
    const risultati = verificaAllineamentoSAP([{ campo: 'dataDecorrenza', valore: '2025-01-01' }], {});
    expect(risultati).toEqual([]);
  });

  it('metadato contratto assente per il campo SAP fornito → incoerente (nulla da confrontare)', () => {
    const risultati = verificaAllineamentoSAP([], { importoContrattuale: '100000' });
    expect(risultati[0].esito).toBe('incoerente');
    expect(risultati[0].valoreContratto).toBe('');
  });
});
