const { Document, Packer, Paragraph } = require('docx');
const XLSX = require('xlsx');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(),
  embeddings: jest.fn()
}));

const openai = require('../srv/modules/openai-module');
const {
  extractTextMultiFormato,
  estraiClausoleConFallback,
  cosineSimilarity,
  trovaMatch
} = require('../srv/lib/ai-import');

async function buildDocxFixture() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph('Art. 1 - Oggetto'),
        new Paragraph('Il presente contratto ha per oggetto la fornitura di servizi ICT.')
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

function buildXlsxFixture() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([{ Numero: 1, Titolo: 'Oggetto', Testo: 'Testo tabellare di prova.' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Clausole');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

jest.mock('pdfjs-dist/legacy/build/pdf.js', () => ({
  getDocument: jest.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: jest.fn().mockResolvedValue({
        getTextContent: jest.fn().mockResolvedValue({ items: [{ str: 'Contenuto PDF di prova.' }] })
      })
    })
  })
}));

describe('extractTextMultiFormato', () => {
  it('extracts raw text from a .docx buffer', async () => {
    const buffer = await buildDocxFixture();
    const testo = await extractTextMultiFormato(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx');
    expect(testo).toMatch(/fornitura di servizi ICT/);
  });

  it('extracts text from an .xlsx buffer', async () => {
    const buffer = buildXlsxFixture();
    const testo = await extractTextMultiFormato(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'doc.xlsx');
    expect(testo).toMatch(/Testo tabellare di prova/);
  });

  it('extracts text from a .pdf buffer via pdfjs-dist', async () => {
    const testo = await extractTextMultiFormato(Buffer.from('finto pdf'), 'application/pdf', 'doc.pdf');
    expect(testo).toMatch(/Contenuto PDF di prova/);
  });

  it('rejects an unsupported format', async () => {
    await expect(extractTextMultiFormato(Buffer.from('x'), 'text/plain', 'doc.txt'))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });
});

describe('estraiClausoleConFallback', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  it('uses the AI segmentation when it returns valid clausole', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo estratto dal documento.' }]
    });
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toEqual([{ numero: 1, titolo: 'Oggetto', testo: 'Testo estratto dal documento.' }]);
  });

  it('falls back to regex parsing when the AI call fails', async () => {
    openai.chatJSON.mockRejectedValue(new Error('rete non disponibile'));
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toHaveLength(1);
    expect(clausole[0].titolo).toMatch(/Oggetto/);
  });

  it('falls back to regex parsing when the AI returns no clausole', async () => {
    openai.chatJSON.mockResolvedValue({ clausole: [] });
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toHaveLength(1);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
});

describe('trovaMatch', () => {
  beforeEach(() => { openai.embeddings.mockReset(); });

  it('marks a clause as RIUSATA when the matched candidate has identical text and high similarity', async () => {
    openai.embeddings.mockResolvedValue([[1, 0, 0], [1, 0, 0]]);
    const clausole = [{ numero: 1, titolo: 'Oggetto', testo: 'Stesso testo.' }];
    const candidati = { '1': { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Stesso testo.' } };
    const result = await trovaMatch(clausole, candidati);
    expect(result[0].stato).toBe('RIUSATA');
    expect(result[0].matchClausolaVersioneID).toBe('v1');
  });

  it('marks a clause as MODIFICATA when similarity is high but text differs', async () => {
    openai.embeddings.mockResolvedValue([[1, 0, 0], [1, 0, 0]]);
    const clausole = [{ numero: 1, titolo: 'Oggetto', testo: 'Testo nuovo.' }];
    const candidati = { '1': { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Testo vecchio.' } };
    const result = await trovaMatch(clausole, candidati);
    expect(result[0].stato).toBe('MODIFICATA');
    expect(result[0].matchClausolaVersioneID).toBe('v1');
  });

  it('marks a clause as NUOVA when there is no candidate at that codice', async () => {
    openai.embeddings.mockResolvedValue([[1, 0, 0]]);
    const clausole = [{ numero: 9, titolo: 'Nuova', testo: 'Testo.' }];
    const result = await trovaMatch(clausole, {});
    expect(result[0].stato).toBe('NUOVA');
    expect(result[0].matchClausolaVersioneID).toBeNull();
  });

  it('falls back to NUOVA for all clauses when embeddings fail', async () => {
    openai.embeddings.mockRejectedValue(new Error('rate limit'));
    const clausole = [{ numero: 1, titolo: 'Oggetto', testo: 'Testo.' }];
    const candidati = { '1': { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Testo.' } };
    const result = await trovaMatch(clausole, candidati);
    expect(result[0].stato).toBe('NUOVA');
  });
});
