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
        getTextContent: jest.fn().mockResolvedValue({ items: [{ str: 'Contenuto PDF di prova.' }] }),
        getViewport: jest.fn().mockReturnValue({ height: 842 })
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

  it('bug reale (Contratto_ADAM.pdf): numero di piè di pagina isolato in fascia di margine non si fonde nella riga di testo successiva', async () => {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: jest.fn().mockResolvedValue({
          getViewport: jest.fn().mockReturnValue({ height: 842 }),
          getTextContent: jest.fn().mockResolvedValue({
            items: [
              // numero di pagina isolato, primo item della pagina, in fascia di margine (y<72)
              { str: '2', transform: [1, 0, 0, 1, 50, 59.6], hasEOL: false },
              { str: 'allegato d', transform: [1, 0, 0, 1, 50, 500], hasEOL: true }
            ]
          })
        })
      })
    });

    const testo = await extractTextMultiFormato(Buffer.from('finto pdf'), 'application/pdf', 'doc.pdf');

    expect(testo).not.toMatch(/^2/);
    expect(testo.trim()).toBe('allegato d');
  });

  it('rejects an unsupported format', async () => {
    await expect(extractTextMultiFormato(Buffer.from('x'), 'text/plain', 'doc.txt'))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });
});

describe('estraiClausoleConFallback', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  it('uses the AI segmentation when it returns un\'ancora trovabile nel documento', async () => {
    const sTesto = 'Il presente contratto ha per oggetto la fornitura di servizi ICT.';
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Oggetto', inizio: 'Il presente contratto ha per oggetto' }]
    });
    const buffer = await buildDocxFixture();
    // buildDocxFixture produce un paragrafo "Art. 1 - Oggetto" + "Il presente contratto ha per oggetto la fornitura di servizi ICT."
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toHaveLength(1);
    expect(clausole[0].titolo).toBe('Oggetto');
    expect(clausole[0].testo).toContain(sTesto);
  });

  it('scarta le clausole la cui ancora non è presente nel documento e tiene solo quelle reali', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 1, titolo: 'Oggetto', inizio: 'Il presente contratto ha per oggetto' },
        { numero: 2, titolo: 'Clausola inventata', inizio: 'Questa frase non esiste da nessuna parte' }
      ]
    });
    const buffer = await buildDocxFixture();
    const clausole = await estraiClausoleConFallback(buffer, 'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toHaveLength(1);
    expect(clausole[0].titolo).toBe('Oggetto');
  });

  it('bug reale (Contratto_ADAM.pdf): virgolette dritte nell\'ancora LLM vs virgolette curve nel documento non fanno scartare la clausola', async () => {
    const sTestoDocumento = 'Le Premesse e gli Allegati costituiscono parte integrante delle presenti Condizioni Particolari di Contratto (di seguito anche “CPC”).';
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Premesse ed Allegati', inizio: 'Le Premesse e gli Allegati costituiscono parte integrante delle presenti Condizioni Particolari di Contratto (di seguito anche "CPC")' }]
    });

    const clausole = await estraiClausoleAI(sTestoDocumento);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].titolo).toBe('Premesse ed Allegati');
    expect(clausole[0].testo).toBe(sTestoDocumento);
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

describe('estraiClausoleAI — filtro anti-allucinazione (l\'ancora deve esistere nel documento)', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  it('accetta un\'ancora che coincide dopo normalizzazione spazi/maiuscole', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Oggetto', inizio: 'IL FORNITORE   eroga\nservizi' }]
    });
    const clausole = await estraiClausoleAI('Testo introduttivo. Il fornitore eroga servizi. Testo finale.');
    expect(clausole).toHaveLength(1);
  });

  it('rigetta con errore se tutte le ancore restituite sono allucinate', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: 'Fantasma', inizio: 'Frase completamente inventata dal modello' }]
    });
    await expect(estraiClausoleAI('Documento reale che non contiene quella frase.'))
      .rejects.toThrow('nessuna clausola verificabile');
  });
});

describe('estraiClausoleAI — testo ritagliato dal documento reale (non ri-trascritto dal modello)', () => {
  beforeEach(() => { openai.chatJSON.mockReset(); });

  const sDocumento =
    'Articolo 5 - Requisiti di sicurezza\n' +
    '5.1 Governance: il fornitore applica una governance della sicurezza ICT.\n' +
    '5.2 Protezione dati: il fornitore protegge i dati personali.\n' +
    'Articolo 6 - Clausola finale\n' +
    'Testo della clausola finale.';

  it('include automaticamente le sottosezioni (5.1, 5.2) nel testo della clausola madre, ritagliandolo dal documento reale', async () => {
    openai.chatJSON.mockResolvedValue({
      clausole: [
        { numero: 5, titolo: 'Requisiti di sicurezza', inizio: '5.1 Governance: il fornitore applica' },
        { numero: 6, titolo: 'Clausola finale', inizio: 'Testo della clausola finale' }
      ]
    });

    const clausole = await estraiClausoleAI(sDocumento);

    expect(clausole).toHaveLength(2);
    expect(clausole[0].numero).toBe(5);
    expect(clausole[0].testo).toContain('5.1 Governance');
    expect(clausole[0].testo).toContain('5.2 Protezione dati');
    // il taglio si ferma esattamente all'inizio del CORPO della clausola successiva (l'ancora
    // indicata dal modello è "Testo della clausola finale", non il titolo "Articolo 6" che la
    // precede — la riga di titolo resta quindi in coda al taglio della clausola precedente,
    // dettaglio di confine innocuo, non perdita di contenuto)
    expect(clausole[0].testo).not.toContain('Testo della clausola finale');
    expect(clausole[1].testo).toBe('Testo della clausola finale.');
  });

  it('bug reale (Contratto_ADAM.pdf): la ricerca riparte da dove si era arrivati, non trova per errore un\'ancora corta citata prima nel documento', async () => {
    const sDoc =
      'Premesse: gli allegati previsti includono B) Condizioni economiche descritte più avanti.\n' +
      'Articolo 4 - Condizioni economiche\n' +
      'I corrispettivi dovuti sono indicati in Allegato B.';
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 4, titolo: 'Condizioni economiche', inizio: 'I corrispettivi dovuti sono indicati' }]
    });

    const clausole = await estraiClausoleAI(sDoc);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].testo).toBe('I corrispettivi dovuti sono indicati in Allegato B.');
  });

  it('titolo vuoto -> placeholder "Clausola N"', async () => {
    const sDoc = 'Definizioni\n1.1 Nelle presenti Condizioni Generali di Contratto i termini hanno il significato indicato.';
    openai.chatJSON.mockResolvedValue({
      clausole: [{ numero: 1, titolo: '', inizio: '1.1 Nelle presenti Condizioni' }]
    });

    const clausole = await estraiClausoleAI(sDoc);

    expect(clausole).toHaveLength(1);
    expect(clausole[0].titolo).toBe('Clausola 1');
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
    const candidati = { C1: { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Stesso testo.' } };
    const result = await trovaMatch(clausole, candidati);
    expect(result[0].stato).toBe('RIUSATA');
    expect(result[0].matchClausolaVersioneID).toBe('v1');
  });

  it('marks a clause as MODIFICATA when similarity is high but text differs', async () => {
    openai.embeddings.mockResolvedValue([[1, 0, 0], [1, 0, 0]]);
    const clausole = [{ numero: 1, titolo: 'Oggetto', testo: 'Testo nuovo.' }];
    const candidati = { C1: { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Testo vecchio.' } };
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
    const candidati = { C1: { clausolaID: 'c1', clausolaVersioneID: 'v1', testo: 'Testo.' } };
    const result = await trovaMatch(clausole, candidati);
    expect(result[0].stato).toBe('NUOVA');
  });
});
