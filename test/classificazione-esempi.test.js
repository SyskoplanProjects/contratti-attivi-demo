const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [0.9, 0.1, 0.0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const openai = require('../srv/modules/openai-module');

describe('classificazione-esempi', () => {
  beforeEach(() => { openai.embeddings.mockClear(); });

  it('salvaEsempio calcola embedding e inserisce la riga', async () => {
    const { salvaEsempio } = require('../srv/lib/classificazione-esempi');
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');

    await salvaEsempio({
      categoria: 'MAIL', sottoTipo: null, testo: 'Oggetto: rinnovo contratto',
      fonte: 'correzione', categoriaProposta: 'ODA', confidenzaProposta: 0.6
    });

    const righe = await SELECT.from(EsempioClassificazione).where({ categoria: 'MAIL' });
    expect(righe).toHaveLength(1);
    expect(JSON.parse(righe[0].embedding)).toEqual([0.9, 0.1, 0.0]);
    expect(openai.embeddings).toHaveBeenCalledWith(['Oggetto: rinnovo contratto']);
  });

  it('caricaEsempi ritorna gli esempi salvati con key = sottoTipo || categoria', async () => {
    const { salvaEsempio, caricaEsempi } = require('../srv/lib/classificazione-esempi');

    await salvaEsempio({
      categoria: 'CONTRATTO', sottoTipo: 'CGC', testo: 'Condizioni Generali...',
      fonte: 'conferma', categoriaProposta: 'CGC', confidenzaProposta: 0.9
    });

    const pool = await caricaEsempi();
    const trovato = pool.find(p => p.key === 'CGC');
    expect(trovato).toBeDefined();
    expect(trovato.embedding).toEqual([0.9, 0.1, 0.0]);
  });

  it('caricaEsempi usa la cache: una seconda chiamata non rilegge il DB se non ci sono nuovi salvaEsempio', async () => {
    const { caricaEsempi } = require('../srv/lib/classificazione-esempi');
    const primo = await caricaEsempi();
    const secondo = await caricaEsempi();
    expect(secondo).toBe(primo); // stessa reference, servita da cache
  });

  it('salvaEsempio invalida la cache: caricaEsempi successivo include il nuovo esempio', async () => {
    const { salvaEsempio, caricaEsempi } = require('../srv/lib/classificazione-esempi');
    const prima = await caricaEsempi();
    await salvaEsempio({
      categoria: 'FATTURA', sottoTipo: null, testo: 'Fattura n. 123',
      fonte: 'conferma', categoriaProposta: 'FATTURA', confidenzaProposta: 0.95
    });
    const dopo = await caricaEsempi();
    expect(dopo).not.toBe(prima);
    expect(dopo.find(p => p.key === 'FATTURA')).toBeDefined();
  });
});
