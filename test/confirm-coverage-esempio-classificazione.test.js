const path = require('path');
const cds = require('@sap/cds');

const mockChatJSON = jest.fn();
jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: (...args) => mockChatJSON(...args),
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

function previewBase(overrides) {
  return Object.assign({
    filename: 'contratto.pdf',
    testo: 'Testo del documento analizzato',
    clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
    coveragePercent: 100,
    documentoPrincipale: { categoria: 'ODA', sottoTipo: null, confidenza: 0.6 }
  }, overrides);
}

describe('confirmCoverage — salvataggio esempio classificazione', () => {
  it('salva un esempio con fonte=correzione quando tipoDocumento differisce dalla proposta AI', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
    const previewID = previewStore.put(previewBase());

    const risposta = await POST('/comparator/confirmCoverage', {
      previewID, clausole: [], allegati: [], metadati: [], tipoDocumento: 'MAIL'
    }, { auth: MOCK_USER });

    expect(risposta.status).toBe(200);
    const righe = await SELECT.from(EsempioClassificazione).where({ categoria: 'MAIL' });
    expect(righe).toHaveLength(1);
    expect(righe[0].fonte).toBe('correzione');
    expect(righe[0].categoriaProposta).toBe('ODA');
    expect(righe[0].confidenzaProposta).toBe(0.6);
    expect(righe[0].testo).toBe('Testo del documento analizzato');
  });

  it('salva un esempio con fonte=conferma quando tipoDocumento coincide con la proposta AI', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
    const previewID = previewStore.put(previewBase({
      documentoPrincipale: { categoria: 'FATTURA', sottoTipo: null, confidenza: 0.95 }
    }));

    await POST('/comparator/confirmCoverage', {
      previewID, clausole: [], allegati: [], metadati: [], tipoDocumento: 'FATTURA'
    }, { auth: MOCK_USER });

    const righe = await SELECT.from(EsempioClassificazione).where({ categoria: 'FATTURA' });
    expect(righe).toHaveLength(1);
    expect(righe[0].fonte).toBe('conferma');
  });

  it('deriva categoria/sottoTipo da tipoDocumento sotto-tipologia (es. CGC -> categoria CONTRATTO)', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
    const previewID = previewStore.put(previewBase({
      documentoPrincipale: { categoria: 'CONTRATTO', sottoTipo: 'CPC', confidenza: 0.8 }
    }));

    await POST('/comparator/confirmCoverage', {
      previewID, clausole: [], allegati: [], metadati: [], tipoDocumento: 'CGC'
    }, { auth: MOCK_USER });

    const righe = await SELECT.from(EsempioClassificazione).where({ sottoTipo: 'CGC' });
    expect(righe).toHaveLength(1);
    expect(righe[0].categoria).toBe('CONTRATTO');
    expect(righe[0].fonte).toBe('correzione'); // CGC != CPC proposto
  });

  it('non salva nulla se tipoDocumento non è fornito (retro-compatibilità)', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
    const previewID = previewStore.put(previewBase());

    const prima = await SELECT.from(EsempioClassificazione);
    await POST('/comparator/confirmCoverage', { previewID, clausole: [], allegati: [], metadati: [] }, { auth: MOCK_USER });
    const dopo = await SELECT.from(EsempioClassificazione);

    expect(dopo.length).toBe(prima.length);
  });

  it('non blocca confirmCoverage se salvaEsempio fallisce (embedding non disponibile)', async () => {
    const openai = require('../srv/modules/openai-module');
    openai.embeddings.mockRejectedValueOnce(new Error('OpenAI down'));

    const previewID = previewStore.put(previewBase());
    const risposta = await POST('/comparator/confirmCoverage', {
      previewID, clausole: [], allegati: [], metadati: [], tipoDocumento: 'MAIL'
    }, { auth: MOCK_USER });

    expect(risposta.status).toBe(200); // il contratto si crea comunque
  });
});
