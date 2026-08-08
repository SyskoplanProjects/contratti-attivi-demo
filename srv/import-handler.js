const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { extractTextMultiFormato } = require('./lib/ai-import');

const CLAUSE_PATTERN = /^(?:Art(?:icolo)?\.?|Clausola|Sezione)\s+(\d+)\s*[\.\:\-]?\s*(.*)$/i;

// Stesso splitter riga-per-riga su pattern Art./Clausola/Sezione, condiviso da tutti i
// formati (docx via mammoth, pdf via pdf.js) che arrivano qui come testo semplice —
// solo l'estrazione del testo grezzo cambia per formato, la segmentazione è identica.
function _clausoleDaTesto(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const clausole = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(CLAUSE_PATTERN);
    if (match) {
      if (current) clausole.push(current);
      current = { numero: Number(match[1]), titolo: match[2] || `Clausola ${match[1]}`, testo: '' };
    } else if (current) {
      current.testo += (current.testo ? '\n' : '') + line;
    }
  }
  if (current) clausole.push(current);
  return clausole;
}

async function parseDocx(buffer) {
  const { value: text } = await mammoth.extractRawText({ buffer });
  return _clausoleDaTesto(text);
}

async function parsePdf(buffer, filename, mimeType) {
  const text = await extractTextMultiFormato(buffer, mimeType, filename);
  return _clausoleDaTesto(text);
}

function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const ALIASES = { numero: ['numero', 'n', '#'], titolo: ['titolo', 'title'], testo: ['testo', 'text', 'contenuto'] };
  function findKey(row, aliases) {
    return Object.keys(row).find(k => aliases.includes(String(k).trim().toLowerCase()));
  }

  return rows.map((row, i) => {
    const numKey = findKey(row, ALIASES.numero);
    const titKey = findKey(row, ALIASES.titolo);
    const txtKey = findKey(row, ALIASES.testo);
    return {
      numero: numKey ? Number(row[numKey]) : i + 1,
      titolo: titKey ? String(row[titKey]) : `Clausola ${i + 1}`,
      testo: txtKey ? String(row[txtKey]) : ''
    };
  }).filter(c => c.testo);
}

async function parseFile(buffer, filename, mimeType) {
  const name = (filename || '').toLowerCase();
  const isPdf = name.endsWith('.pdf') || mimeType === 'application/pdf';
  const isDocx = name.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isXlsx = name.endsWith('.xlsx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (isPdf) {
    const clausole = await parsePdf(buffer, filename, mimeType);
    if (!clausole.length) {
      const err = new Error('Nessuna clausola identificabile nel file PDF (pattern Art./Clausola/Sezione non trovato)');
      err.code = 'NO_CLAUSES_FOUND';
      throw err;
    }
    return clausole;
  }

  if (isDocx) {
    const clausole = await parseDocx(buffer);
    if (!clausole.length) {
      const err = new Error('Nessuna clausola identificabile nel file Word (pattern Art./Clausola/Sezione non trovato)');
      err.code = 'NO_CLAUSES_FOUND';
      throw err;
    }
    return clausole;
  }

  if (isXlsx) {
    const clausole = parseXlsx(buffer);
    if (!clausole.length) {
      const err = new Error('Nessuna clausola identificabile nel file Excel (intestazioni colonna non riconosciute o foglio vuoto)');
      err.code = 'NO_CLAUSES_FOUND';
      throw err;
    }
    return clausole;
  }

  const err = new Error(`Formato file non riconosciuto: ${filename}`);
  err.code = 'UNSUPPORTED_FORMAT';
  throw err;
}

module.exports = { parseFile, parseDocx, parsePdf, parseXlsx };
