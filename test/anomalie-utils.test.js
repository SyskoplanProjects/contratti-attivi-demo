const path = require('path');
const cds = require('@sap/cds');

const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: (...args) => mockChatJSON(...args),
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { buildSnapshotData } = require('../srv/lib/snapshot-utils');
const { generaAnomalie, SOGLIA_CONFIDENZA } = require('../srv/lib/anomalie-utils');

describe('snapshot-utils / anomalie-utils (RF8/RF9)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('SOGLIA_CONFIDENZA è 0.80', () => {
    expect(SOGLIA_CONFIDENZA).toBe(0.80);
  });

  it('generaAnomalie: completa al 100% senza deroghe né confidenze basse → nessuna anomalia', () => {
    const attesi = ['CGC', 'CPC'].map((codice, i) => ({
      allegatoAtteso: codice, etichetta: codice, presente: true, filename: codice + '.pdf'
    }));
    const anomalie = generaAnomalie({
      attesi, percentuale: 100,
      deroghe: [{ articolo: '17', esito: 'conforme' }, { articolo: '21', esito: 'non_determinabile' }],
      allegati: [{ filename: 'cgc.pdf', confidenza: 0.95 }]
    });
    expect(anomalie).toEqual([]);
  });

  it('generaAnomalie: allegato atteso mancante → una COMPLETEZZA per allegato, con gravità', () => {
    const attesi = [
      { allegatoAtteso: 'CGC', etichetta: 'CGC', presente: true, filename: 'cgc.pdf' },
      { allegatoAtteso: 'ALLEGATO_B', etichetta: 'Allegato B', presente: false, filename: null },
      { allegatoAtteso: 'ALLEGATO_E', etichetta: 'Allegato E', presente: false, filename: null }
    ];
    const anomalie = generaAnomalie({ attesi, deroghe: [], allegati: [] });
    expect(anomalie).toHaveLength(2);
    expect(anomalie.every(a => a.tipo === 'COMPLETEZZA')).toBe(true);
    expect(anomalie.map(a => a.riferimento).sort()).toEqual(['ALLEGATO_B', 'ALLEGATO_E']);
    expect(anomalie.every(a => a.gravita === 'MEDIA')).toBe(true);
  });

  it('generaAnomalie: allegato non critico mancante (Allegato C) → gravità BASSA', () => {
    const attesi = [{ allegatoAtteso: 'ALLEGATO_C', etichetta: 'Allegato C', presente: false, filename: null }];
    const anomalie = generaAnomalie({ attesi, deroghe: [], allegati: [] });
    expect(anomalie[0].gravita).toBe('BASSA');
  });

  it('generaAnomalie: CGC/CPC mancanti → gravità ALTA', () => {
    const attesi = [{ allegatoAtteso: 'CGC', etichetta: 'CGC', presente: false, filename: null }];
    const anomalie = generaAnomalie({ attesi, deroghe: [], allegati: [] });
    expect(anomalie[0].gravita).toBe('ALTA');
  });

  it('generaAnomalie: allineamentoSAP incoerente → DATI_SAP gravità ALTA', () => {
    const anomalie = generaAnomalie({
      attesi: [], deroghe: [], allegati: [],
      allineamentoSAP: [
        { campo: 'importoContrattuale', valoreContratto: '100', valoreSAP: '200', esito: 'incoerente' },
        { campo: 'dataDecorrenza', valoreContratto: '2025-01-01', valoreSAP: '2025-01-01', esito: 'allineato' }
      ]
    });
    expect(anomalie).toHaveLength(1);
    expect(anomalie[0].tipo).toBe('DATI_SAP');
    expect(anomalie[0].gravita).toBe('ALTA');
    expect(anomalie[0].riferimento).toBe('importoContrattuale');
  });

  it('generaAnomalie: una anomalia DEROGHE per articolo derogato', () => {
    const anomalie = generaAnomalie({
      attesi: [], percentuale: 100,
      deroghe: [
        { articolo: '17', esito: 'derogato', dettaglio: 'Audit limitati', riferimentoComma: '17.2' },
        { articolo: '21', esito: 'derogato', dettaglio: 'Subappalto libero', riferimentoComma: '' },
        { articolo: '17', esito: 'derogato', dettaglio: 'duplicato ignorato', riferimentoComma: '17.2' }
      ],
      allegati: []
    });
    expect(anomalie.filter(a => a.tipo === 'DEROGHE')).toHaveLength(2);
    const d17 = anomalie.find(a => a.riferimento === 'Art. 17 comma 17.2');
    const d21 = anomalie.find(a => a.riferimento === 'Art. 21');
    expect(d17.dettaglio).toBe('Audit limitati');
    expect(d21).toBeDefined();
  });

  it('generaAnomalie: confidenza sotto soglia → CONFIDENZA per filename', () => {
    const anomalie = generaAnomalie({
      attesi: [], percentuale: 100, deroghe: [],
      allegati: [
        { filename: 'cgc.pdf', confidenza: 0.95 },
        { filename: 'allegato_b.pdf', confidenza: 0.60 }
      ]
    });
    expect(anomalie).toHaveLength(1);
    expect(anomalie[0].tipo).toBe('CONFIDENZA');
    expect(anomalie[0].riferimento).toBe('allegato_b.pdf');
  });

  it('buildSnapshotData: completa, deroghe e confidenza media dai dati DB', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '17', esito: 'derogato', dettaglio: 'Audit limitati', riferimentoComma: '17.2', segnali: '' },
        { articolo: '21', esito: 'conforme', dettaglio: '', riferimentoComma: '', segnali: '' }
      ]
    });

    const snapshot = await buildSnapshotData([
      { tipo: 'CGC', filename: 'cgc.pdf', confidenza: 0.9 },
      { tipo: 'CPC', filename: 'cpc.pdf', confidenza: 0.8 }
    ], 'Testo del contratto con Art. 17.');

    expect(snapshot.percentuale).toBe(22.22);
    expect(snapshot.totaleAllegati).toBe(9);
    expect(snapshot.allegatiPresenti).toBe(2);
    expect(snapshot.confidenzaMedia).toBe(0.85);
    expect(snapshot.deroghe.find(d => d.articolo === '17').esito).toBe('derogato');
    expect(snapshot.attesi.find(a => a.allegatoAtteso === 'CGC').presente).toBe(true);
  });

  it('buildSnapshotData: confidenza NaN esclusa dalla media', async () => {
    mockChatJSON.mockResolvedValue({ risultati: [] });

    const snapshot = await buildSnapshotData([
      { tipo: 'CGC', filename: 'cgc.pdf', confidenza: 0.9 },
      { tipo: 'CPC', filename: 'cpc.pdf', confidenza: NaN }
    ], 'Testo senza deroghe.');

    expect(snapshot.confidenzaMedia).toBe(0.9);
  });
});
