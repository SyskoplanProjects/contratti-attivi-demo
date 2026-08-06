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
  estraiClausoleAI,
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

  it('uses the AI segmentation when it returns valid clausole presenti letteralmente nel documento', async () => {
    const sTesto = 'Il presente contratto ha per oggetto la fornitura di servizi ICT.';
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: sTesto }]
    });
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toEqual([{ numero: 1, titolo: 'Oggetto', testo: sTesto }]);
  });

  it('scarta le clausole allucinate (testo non presente nel documento) e tiene solo quelle reali', async () => {
    const sTestoReale = 'Il presente contratto ha per oggetto la fornitura di servizi ICT.';
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 1, titolo: 'Oggetto', testo: sTestoReale },
        { numero: 2, titolo: 'Clausola inventata', testo: 'Questa frase non esiste da nessuna parte nel documento originale.' }
      ]
    });
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toEqual([{ numero: 1, titolo: 'Oggetto', testo: sTestoReale }]);
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

describe('estraiClausoleAI — filtro anti-allucinazione (le clausole devono esistere nel documento)', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  it('accetta una clausola il cui testo coincide dopo normalizzazione spazi/maiuscole', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'IL FORNITORE   eroga\nservizi.' }]
    });
    const clausole = await estraiClausoleAI('Testo introduttivo. Il fornitore eroga servizi. Testo finale.');
    expect(clausole).toHaveLength(1);
  });

  it('rigetta con errore se tutte le clausole restituite sono allucinate', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Fantasma', testo: 'Frase completamente inventata dal modello.' }]
    });
    await expect(estraiClausoleAI('Documento reale che non contiene quella frase.'))
      .rejects.toThrow('nessuna clausola verificabile');
  });
});

describe('estraiClausoleAI — clausole con sezioni (es. clausola 5 con 5.1, 5.2)', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  const sDocumento =
    'Clausola 5 Requisiti di sicurezza.\n' +
    '5.1 Governance: il fornitore applica una governance della sicurezza ICT.\n' +
    '5.2 Protezione dati: il fornitore protegge i dati personali.\n' +
    'Clausola 6 Clausola finale.';

  it('mantiene le sezioni dentro il testo della clausola madre quando il modello le restituisce già incluse', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{
        numero: 5, titolo: 'Requisiti di sicurezza',
        testo: 'Requisiti di sicurezza.\n5.1 Governance: il fornitore applica una governance della sicurezza ICT.\n5.2 Protezione dati: il fornitore protegge i dati personali.'
      }]
    });

    const clausole = await estraiClausoleAI(sDocumento);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].numero).toBe(5);
    expect(clausole[0].testo).toContain('5.1 Governance');
    expect(clausole[0].testo).toContain('5.2 Protezione dati');
  });

  it('fonde le sezioni restituite come clausole separate (numero decimale) nel testo della clausola madre', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 5, titolo: 'Requisiti di sicurezza', testo: 'Requisiti di sicurezza.' },
        { numero: 5.1, titolo: '5.1 Governance', testo: '5.1 Governance: il fornitore applica una governance della sicurezza ICT.' },
        { numero: 5.2, titolo: '5.2 Protezione dati', testo: '5.2 Protezione dati: il fornitore protegge i dati personali.' }
      ]
    });

    const clausole = await estraiClausoleAI(sDocumento);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].numero).toBe(5);
    expect(clausole[0].testo.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(clausole[0].testo).toContain('5.1 Governance');
    expect(clausole[0].testo).toContain('5.2 Protezione dati');
  });

  it('sezione senza clausola madre esplicita viene aggregata nella clausola con numero intero immediatamente precedente', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 5.1, titolo: '5.1 Governance', testo: '5.1 Governance: il fornitore applica una governance della sicurezza ICT.' },
        { numero: 5, titolo: 'Requisiti di sicurezza', testo: 'Requisiti di sicurezza.' }
      ]
    });

    const clausole = await estraiClausoleAI(sDocumento);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].numero).toBe(5);
    expect(clausole[0].testo).toContain('5.1 Governance');
  });

  it('clausole senza sezioni restano invariate', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 5, titolo: 'Requisiti di sicurezza', testo: 'Requisiti di sicurezza.' },
        { numero: 6, titolo: 'Clausola finale', testo: 'Clausola finale.' }
      ]
    });

    const clausole = await estraiClausoleAI(sDocumento);

    expect(clausole).toHaveLength(2);
    expect(clausole[0].numero).toBe(5);
    expect(clausole[1].numero).toBe(6);
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
