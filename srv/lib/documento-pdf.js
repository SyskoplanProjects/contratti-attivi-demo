const { convertiDocxInPdf } = require('./docx-to-pdf');
const { estraiTestoPosizionato } = require('./pdf-position');

// Un solo percorso di codice per PDF nativo o convertito da .docx: entrambi finiscono
// nella stessa estraiTestoPosizionato. .xlsx resta fuori (fallback testuale esistente,
// nessuna preview con evidenziazione per quel formato — limitazione nota, non bloccante).
async function ottieniPdfEPosizioni(buffer, mimeType) {
  let pdfBuffer = null;

  if (mimeType === 'application/pdf') {
    pdfBuffer = buffer;
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      pdfBuffer = await convertiDocxInPdf(buffer);
    } catch (e) {
      console.warn('[documento-pdf] conversione docx->pdf fallita:', e.message);
      return { pdfBase64: null, testoPosizionato: null };
    }
  } else {
    return { pdfBase64: null, testoPosizionato: null };
  }

  const testoPosizionato = await estraiTestoPosizionato(pdfBuffer);
  return { pdfBase64: pdfBuffer.toString('base64'), testoPosizionato };
}

module.exports = { ottieniPdfEPosizioni };