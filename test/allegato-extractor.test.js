const mockChatJSON = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({ chatJSON: (...args) => mockChatJSON(...args) }));

const { estraiCampiAllegato } = require('../srv/lib/allegato-extractor');

describe('allegato-extractor — confidenza per campo', () => {
  beforeEach(() => mockChatJSON.mockReset());

  it('ritorna un array di metadati con valore e confidenza per campo richiesto al modello', async () => {
    mockChatJSON.mockResolvedValueOnce({
      numeroProtocollo: { valore: 'INAIL-123', confidenza: 0.95 },
      denominazione: { valore: 'Acme S.p.A.', confidenza: 0.88 },
      codiceFiscale: { valore: null, confidenza: 0 },
      sedeLegale: { valore: 'Via Roma 1', confidenza: 0.7 },
      dataRichiesta: { valore: '2026-01-10', confidenza: 0.9 },
      scadenzaValidita: { valore: '2026-05-10', confidenza: 0.85 },
      esito: { valore: 'REGOLARE', confidenza: 0.99 }
    });

    const { metadati, dataScadenza } = await estraiCampiAllegato('DURC', 'Testo del DURC di prova.');

    expect(metadati).toHaveLength(7);
    const denom = metadati.find(m => m.campo === 'denominazione');
    expect(denom.valore).toBe('Acme S.p.A.');
    expect(denom.confidenza).toBeCloseTo(0.88);
    expect(denom.etichetta).toBe('Denominazione');
    const cf = metadati.find(m => m.campo === 'codiceFiscale');
    expect(cf.valore).toBeNull();
    expect(dataScadenza).toBe('2026-05-10');
  });

  it('per il tipo CONTRATTO esclude i campi dynamic (es. templateContrattuale) dalla richiesta al modello', async () => {
    mockChatJSON.mockResolvedValueOnce(
      Object.fromEntries(['titoloContratto', 'fornitore'].map(c => [c, { valore: 'x', confidenza: 0.5 }]))
    );

    const { metadati } = await estraiCampiAllegato('CONTRATTO', 'Testo contratto di prova.');
    // in questo task (3) i campi dynamic non sono ancora valorizzati da un motore dedicato:
    // Task 3b sostituisce questo comportamento placeholder con riconosciTemplateContrattuale.
    const template = metadati.find(m => m.campo === 'templateContrattuale');
    expect(template.valore).toBeNull();
    expect(template.confidenza).toBeNull();

    const promptInviato = mockChatJSON.mock.calls[0][0];
    expect(promptInviato).not.toContain('templateContrattuale:');
  });

  it('ritorna metadati vuoti se il testo è vuoto o il tipo non esiste', async () => {
    const r1 = await estraiCampiAllegato('CONTRATTO', '');
    expect(r1.metadati).toEqual([]);
    const r2 = await estraiCampiAllegato('TIPO_INESISTENTE', 'testo');
    expect(r2.metadati).toEqual([]);
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('gestisce una risposta del modello malformata senza lanciare eccezioni', async () => {
    mockChatJSON.mockResolvedValueOnce({ denominazione: 'stringa invece di oggetto' });
    const { metadati } = await estraiCampiAllegato('DURC', 'Testo.');
    const denom = metadati.find(m => m.campo === 'denominazione');
    expect(denom.valore).toBeNull();
    expect(denom.confidenza).toBe(0);
  });
});
