const mammoth = require('mammoth');
const puppeteer = require('puppeteer');

// classificaAllegati chiama convertiDocxInPdf una volta per allegato docx, in loop:
// un browser Chromium per chiamata significa N cold start serializzati. Si tiene invece
// un'unica istanza condivisa per la vita del processo, e si apre/chiude solo la pagina
// per ogni conversione.
let _browserPromise = null;
function _getBrowser() {
  if (!_browserPromise) {
    _browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
      .catch(e => { _browserPromise = null; throw e; }); // consente un retry alla chiamata successiva se il launch fallisce
  }
  return _browserPromise;
}

// .docx -> HTML (mammoth) -> PDF (Puppeteer headless). Un solo path di conversione,
// nessun binario esterno richiesto oltre al Chromium scaricato da Puppeteer via npm.
async function convertiDocxInPdf(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });

  const browser = await _getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(`<html><body>${html}</body></html>`, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

module.exports = { convertiDocxInPdf };