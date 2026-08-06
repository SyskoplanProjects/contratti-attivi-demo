// Riconciliazione dati contratto vs SAP (RF7, 03-requisiti-evoluzione-gap-analysis.md).
// Nessuna integrazione SAP disponibile in questa fase: i valori SAP sono inseriti manualmente
// (nel wizard finale) e confrontati con i metadati già estratti dal contratto. Confine onesto
// finché non è definito un connettore reale — vedi commento sull'action nel .cds.
function _normalizzaData(valore) {
  if (!valore) return null;
  const s = String(valore).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

function _normalizzaImporto(valore) {
  if (valore == null || valore === '') return null;
  const n = Number(String(valore).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const CAMPI = [
  { campo: 'dataDecorrenza', metadato: 'dataDecorrenza', normalizza: _normalizzaData },
  { campo: 'dataScadenza', metadato: 'dataScadenza', normalizza: _normalizzaData },
  { campo: 'importoContrattuale', metadato: 'importoContrattuale', normalizza: _normalizzaImporto }
];

// metadatiContratto: array di { campo, valore } (MetadatoDocumento / preview.metadati).
// datiSAP: { dataDecorrenza, dataScadenza, importoContrattuale } — solo i campi valorizzati vengono confrontati.
function verificaAllineamentoSAP(metadatiContratto, datiSAP) {
  const mappa = new Map((metadatiContratto || []).map(m => [m.campo, m.valore]));
  const risultati = [];
  for (const c of CAMPI) {
    const valoreSAP = datiSAP && datiSAP[c.campo];
    if (valoreSAP == null || valoreSAP === '') continue;
    const valoreContratto = mappa.get(c.metadato);
    const a = c.normalizza(valoreContratto);
    const b = c.normalizza(valoreSAP);
    const esito = (a != null && b != null && a === b) ? 'allineato' : 'incoerente';
    risultati.push({
      campo: c.campo,
      valoreContratto: valoreContratto != null ? String(valoreContratto) : '',
      valoreSAP: String(valoreSAP),
      esito
    });
  }
  return risultati;
}

module.exports = { verificaAllineamentoSAP };
