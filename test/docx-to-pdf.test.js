const { Document, Packer, Paragraph } = require('docx');
const { convertiDocxInPdf } = require('../srv/lib/docx-to-pdf');

describe('docx-to-pdf', () => {
  it('converte un .docx valido in un buffer PDF (magic bytes %PDF)', async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph('Contratto di prova ACME S.p.A.')] }]
    });
    const docxBuffer = await Packer.toBuffer(doc);

    const pdfBuffer = await convertiDocxInPdf(docxBuffer);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 30000);

  it('propaga l\'errore se il buffer non è un .docx valido, senza restituire un buffer vuoto silenzioso', async () => {
    await expect(convertiDocxInPdf(Buffer.from('non è un docx'))).rejects.toThrow();
  }, 30000);
});