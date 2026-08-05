const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Estrae il testo di un PDF pagina per pagina mantenendo, per ogni item testuale,
// la posizione (bbox) e l'offset nel testo concatenato — usato per localizzare nel
// documento il punto sorgente di un valore estratto (vedi allegato-extractor.js).
async function estraiTestoPosizionato(buffer) {
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (e) {
    console.warn('[pdf-position] documento non leggibile:', e.message);
    return { testo: '', items: [] };
  }

  const items = [];
  let testo = '';
  let prevY = null;
  let prevPagina = null;

  for (let pagina = 1; pagina <= doc.numPages; pagina++) {
    const page = await doc.getPage(pagina);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    for (const it of content.items) {
      if (!it.str) continue;
      const [, , , , x, yBase] = it.transform;
      const width = it.width || 0;
      const height = it.height || Math.abs(it.transform[3]) || 0;
      // pdf.js usa origine in basso a sinistra: converto in coordinate "schermo" (origine in alto)
      // per allineare la bbox a come pdf.js browser disegna il canvas in PdfPreview.
      const y = viewport.height - yBase - height;

      // Cambio riga rispetto all'item precedente (nuovo paragrafo o a capo): pdf.js non marca
      // sempre hasEOL tra blocchi separati (es. titolo seguito dal corpo testo in un paragrafo
      // diverso, tipico nei PDF generati da Puppeteer/Chromium via docx-to-pdf), lasciando
      // l'ultima parola di una riga e la prima della successiva incollate senza spazio: si
      // rileva quindi anche dal cambio di coordinata y, non solo da hasEOL.
      if (prevY !== null && (pagina !== prevPagina || Math.abs(y - prevY) > 1) && !/\s$/.test(testo)) {
        testo += '\n';
      }

      const offsetInizio = testo.length;
      testo += it.str;
      const offsetFine = testo.length;
      if (it.hasEOL) testo += '\n';

      items.push({ testo: it.str, pagina, x, y, width, height, offsetInizio, offsetFine });
      prevY = y;
      prevPagina = pagina;
    }
  }

  return { testo, items };
}

module.exports = { estraiTestoPosizionato };