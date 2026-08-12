const fs = require('fs');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer-core');

// Il download del Chromium bundle di `puppeteer` (pacchetto completo) fallisce sulla rete
// BAS/CF build (vedi mta.yaml), quindi in produzione non è mai presente. In locale invece
// `puppeteer` (devDependency-like, ma tenuto in dependencies per compatibilità) scarica il
// browser regolarmente: si usa quello se c'è, altrimenti si cade su @sparticuz/chromium, un
// binario Linux già incluso nel pacchetto npm (nessun download esterno, funziona in CF).
async function _executablePath() {
  try {
    const p = require('puppeteer').executablePath();
    if (fs.existsSync(p)) return { executablePath: p, args: ['--no-sandbox'] };
  } catch (_) { /* puppeteer non installato o browser non scaricato: fallback sotto */ }
  const chromium = require('@sparticuz/chromium');
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

// classificaAllegati chiama convertiDocxInPdf una volta per allegato docx, in loop:
// un browser Chromium per chiamata significa N cold start serializzati. Si tiene invece
// un'unica istanza condivisa per la vita del processo, e si apre/chiude solo la pagina
// per ogni conversione.
let _browserPromise = null;
function _getBrowser() {
  if (!_browserPromise) {
    _browserPromise = _executablePath()
      .then(opts => puppeteer.launch({ headless: true, ...opts }))
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