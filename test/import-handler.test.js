const { Document, Packer, Paragraph } = require('docx');
const XLSX = require('xlsx');
const { parseFile } = require('../srv/import-handler');

async function buildDocxFixture() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph('Art. 1 - Oggetto'),
        new Paragraph('Il presente contratto ha per oggetto la fornitura di servizi ICT.'),
        new Paragraph('Art. 2 - Durata'),
        new Paragraph('Il contratto ha durata di 12 mesi dalla data di stipula.')
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

function buildXlsxFixture() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { Numero: 1, Titolo: 'Oggetto', Testo: 'Il presente contratto ha per oggetto...' },
    { Numero: 2, Titolo: 'Durata', Testo: 'Il contratto ha durata di 12 mesi.' }
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Clausole');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('import-handler', () => {
  it('extracts clauses from a .docx via Art./Clausola/Sezione pattern', async () => {
    const buffer = await buildDocxFixture();
    const clausole = await parseFile(buffer, 'template.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(clausole).toHaveLength(2);
    expect(clausole[0].numero).toBe(1);
    expect(clausole[0].titolo).toMatch(/Oggetto/);
    expect(clausole[0].testo).toMatch(/fornitura di servizi ICT/);
  });

  it('falls back to tabular extraction for .xlsx with tolerant headers', () => {
    const buffer = buildXlsxFixture();
    const clausole = require('../srv/import-handler').parseXlsx(buffer);
    expect(clausole).toHaveLength(2);
    expect(clausole[1].titolo).toBe('Durata');
  });

  it('throws a structured error for an unsupported format', async () => {
    await expect(parseFile(Buffer.from('x'), 'file.txt', 'text/plain'))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });

  it('throws a structured error when no clauses are found in a corrupt/empty docx', async () => {
    const { Document, Packer } = require('docx');
    const emptyDoc = new Document({ sections: [{ children: [] }] });
    const buffer = await Packer.toBuffer(emptyDoc);
    await expect(parseFile(buffer, 'vuoto.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .rejects.toMatchObject({ code: 'NO_CLAUSES_FOUND' });
  });
});
