const mammoth = require('mammoth');
const puppeteer = require('puppeteer');

// .docx -> HTML (mammoth) -> PDF (Puppeteer headless). Un solo path di conversione,
// nessun binario esterno richiesto oltre al Chromium scaricato da Puppeteer via npm.
async function convertiDocxInPdf(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(`<html><body>${html}</body></html>`, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { convertiDocxInPdf };