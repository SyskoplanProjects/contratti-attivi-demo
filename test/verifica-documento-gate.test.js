const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const previewStore = require('../srv/lib/preview-store');

describe('verificaDocumento — gate di classificazione a monte (step 1-2 del flusso)', () => {
  it('documento classificato come CONTRATTO → esitoGate CONTRATTO, nessuna anomalia bloccante', async () => {
    const previewID = previewStore.put({
      filename: 'contratto.pdf', clausole: [], coveragePercent: 0,
      documentoPrincipale: { categoria: 'CONTRATTO', sottoTipo: 'CGC', confidenza: 0.9 }
    });

    const resp = await POST('/comparator/verificaDocumento', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.esitoGate).toBe('CONTRATTO');
    expect(resp.data.gravita).toBeNull();

    const { DocumentoClassificato } = cds.entities('com.reply.contrattiattivi');
    const righe = await SELECT.from(DocumentoClassificato).where({ ID: resp.data.documentoID });
    expect(righe[0].esitoGate).toBe('CONTRATTO');
  });

  it('documento classificato come MAIL → esitoGate ANOMALIA, gravità BLOCCANTE, persistito nel repository', async () => {
    const previewID = previewStore.put({
      filename: 'mail.eml', clausole: [], coveragePercent: 0,
      documentoPrincipale: { categoria: 'MAIL', sottoTipo: null, confidenza: 0.88 }
    });

    const resp = await POST('/comparator/verificaDocumento', { previewID }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.esitoGate).toBe('ANOMALIA');
    expect(resp.data.gravita).toBe('BLOCCANTE');
    expect(resp.data.categoria).toBe('MAIL');

    const { DocumentoClassificato } = cds.entities('com.reply.contrattiattivi');
    const riga = await SELECT.one.from(DocumentoClassificato, resp.data.documentoID);
    expect(riga.esitoGate).toBe('ANOMALIA');
    expect(riga.gravita).toBe('BLOCCANTE');
    expect(riga.contratto_ID).toBeFalsy();
  });

  it('documento OdA senza contratto collegato compare nel report ordini privi di contratto', async () => {
    const previewID = previewStore.put({
      filename: 'oda-123.pdf', clausole: [], coveragePercent: 0,
      documentoPrincipale: { categoria: 'ODA', sottoTipo: null, confidenza: 0.9 }
    });
    await POST('/comparator/verificaDocumento', { previewID }, { auth: MOCK_USER });

    const resp = await POST('/comparator/getOrdiniPriviDiContratto', {}, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.value.some(r => r.filename === 'oda-123.pdf')).toBe(true);
  });

  it('reject 410 se la preview non esiste', async () => {
    await expect(POST('/comparator/verificaDocumento', { previewID: cds.utils.uuid() }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 410 } });
  });
});

describe('verificaAllineamentoSAP action', () => {
  it('confronta i metadati della preview con i dati SAP passati', async () => {
    const previewID = previewStore.put({
      filename: 'contratto.pdf', clausole: [], coveragePercent: 0,
      metadati: [{ campo: 'importoContrattuale', valore: '100000' }]
    });

    const resp = await POST('/comparator/verificaAllineamentoSAP', {
      previewID, importoSAP: 200000
    }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.value[0]).toMatchObject({ campo: 'importoContrattuale', esito: 'incoerente' });
  });
});
