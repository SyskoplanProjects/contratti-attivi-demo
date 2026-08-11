const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn()
}));

jest.mock('../srv/lib/allegato-classifier', () => ({
  classificaAllegato: jest.fn(),
  rilevaTipiPresenti: jest.fn(() => Promise.resolve([]))
}));

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const { classificaAllegato } = require('../srv/lib/allegato-classifier');
const { Document, Packer, Paragraph } = require('docx');

async function bufferDocx(testo) {
  const doc = new Document({ sections: [{ children: [new Paragraph(testo)] }] });
  return (await Packer.toBuffer(doc)).toString('base64');
}

describe('verificaDocumentoPreliminare (gate economico pre-match)', () => {
  beforeEach(() => { classificaAllegato.mockReset(); });

  it('esitoGate CONTRATTO quando il documento è classificato come sotto-tipo di contratto (es. CGC)', async () => {
    classificaAllegato.mockResolvedValue({ tipo: 'CGC', confidenza: 0.9, metodoRiconoscimento: 'llm' });

    const res = await POST('/comparator/verificaDocumentoPreliminare', {
      file: await bufferDocx('Condizioni Generali di Contratto.'), filename: 'contratto.docx'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.esitoGate).toBe('CONTRATTO');
    expect(res.data.sottoTipo).toBe('CGC');
  });

  it('esitoGate ANOMALIA bloccante quando il documento non è un contratto (es. fattura)', async () => {
    classificaAllegato.mockResolvedValue({ tipo: 'FATTURA', confidenza: 0.8, metodoRiconoscimento: 'llm' });

    const res = await POST('/comparator/verificaDocumentoPreliminare', {
      file: await bufferDocx('Fattura n. 123 del 01/01/2026.'), filename: 'fattura.docx'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.esitoGate).toBe('ANOMALIA');
    expect(res.data.gravita).toBe('BLOCCANTE');
    expect(res.data.dettaglio).toContain('FATTURA');
  });

  it('non scrive su DocumentoClassificato (a differenza di verificaDocumento sulla preview)', async () => {
    classificaAllegato.mockResolvedValue({ tipo: 'CGC', confidenza: 0.9, metodoRiconoscimento: 'llm' });
    const cdsRuntime = require('@sap/cds');
    const { DocumentoClassificato } = cdsRuntime.entities('com.reply.contrattiattivi');
    const prima = await SELECT.from(DocumentoClassificato);

    await POST('/comparator/verificaDocumentoPreliminare', {
      file: await bufferDocx('Condizioni Generali di Contratto.'), filename: 'contratto.docx'
    }, { auth: MOCK_USER });

    const dopo = await SELECT.from(DocumentoClassificato);
    expect(dopo).toHaveLength(prima.length);
  });
});
