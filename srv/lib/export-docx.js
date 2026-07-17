const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

function formatData(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('it-IT');
}

function testataParagraphs(contratto) {
  const righe = [
    ['Intestatario', contratto.intestatario],
    ['Società contraente', contratto.societaContraente],
    ['Oggetto', contratto.oggetto],
    ['Categoria', contratto.categoria],
    ['Data stipula', formatData(contratto.dataStipula)],
    ['Data decorrenza', formatData(contratto.dataDecorrenza)],
    ['Data scadenza', formatData(contratto.dataScadenza)],
    ['Importo', contratto.importo != null ? String(contratto.importo) : null],
    ['Referente controparte', contratto.responsabileControparte],
    ['Email controparte', contratto.emailControparte]
  ].filter(([, valore]) => valore);

  return righe.map(([etichetta, valore]) => new Paragraph({
    children: [
      new TextRun({ text: `${etichetta}: `, bold: true }),
      new TextRun(valore)
    ]
  }));
}

function clausolaParagraphs(titolo, testo) {
  const paragrafi = [new Paragraph({ text: titolo, heading: HeadingLevel.HEADING_2 })];
  for (const riga of String(testo || '').split(/\r?\n/)) {
    paragrafi.push(new Paragraph(riga));
  }
  return paragrafi;
}

async function generaDocxContratto(contratto, clausole) {
  const children = [
    new Paragraph({ text: contratto.oggetto || 'Contratto', heading: HeadingLevel.TITLE }),
    ...testataParagraphs(contratto),
    new Paragraph(''),
    ...clausole.flatMap(c => clausolaParagraphs(c.titolo, c.testo))
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { generaDocxContratto };
