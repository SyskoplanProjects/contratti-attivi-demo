// Copia tutte le righe dal db.sqlite locale (anni di dati demo/test) alle tabelle hana
// corrispondenti. Idempotente: per ogni tabella salta gli ID gia' presenti su hana, quindi si
// puo' rilanciare in sicurezza dopo un fallimento parziale (es. un vincolo di colonna che emerge
// solo su hana, mai su sqlite che non valida String(n)).
const path = require('path');
const cds = require('@sap/cds');
const { connectDb } = require('./connect-db');

const NS = 'com_reply_contrattiattivi_';
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'db.sqlite');

// Ordine di dipendenza (Fornitore/Template prima di chi li referenzia): hana qui non applica FK
// constraint reali sulle associazioni CAP, ma manteniamo l'ordine per coerenza e log leggibili.
const TABLES = [
  'Fornitore', 'Template', 'TemplateVersion', 'Clausola', 'ClausolaVersione',
  'TemplateVersionClausola', 'Contratto', 'ContrattoClausola', 'ContrattoImportato',
  'ContrattoAllegato', 'MetadatoDocumento', 'ClausolaImportata', 'Revisione', 'Commento',
  'TemplateCommento', 'ChatThread', 'AlertModificaTemplate', 'AlertContrattoCoinvolto',
  'ContrattoVersione', 'ContrattoVersioneClausola', 'EsitoVerificaContratto', 'Anomalia',
  'DocumentoClassificato', 'EsempioClassificazione'
];

async function migrateTable(sqliteDb, hanaDb, table) {
  const tableName = NS + table;
  const rows = await sqliteDb.run(SELECT.from(tableName));
  if (!rows.length) { console.log(`${table}: 0 righe in locale`); return; }

  const existing = new Set((await hanaDb.run(SELECT.from(tableName).columns('ID'))).map(r => r.ID));
  const todo = rows.filter(r => !existing.has(r.ID));
  if (!todo.length) { console.log(`${table}: ${rows.length} righe, gia' tutte presenti su hana`); return; }

  try {
    await hanaDb.run(INSERT.into(tableName).entries(todo));
    console.log(`${table}: ${todo.length} inserite (${rows.length - todo.length} gia' presenti)`);
  } catch (e) {
    console.error(`${table}: insert bulk fallito (${e.message}), riprovo riga per riga...`);
    let ok = 0, fail = 0;
    for (const row of todo) {
      try { await hanaDb.run(INSERT.into(tableName).entries(row)); ok++; }
      catch (e2) { fail++; console.error(`  ${table} ID=${row.ID}: ${e2.message}`); }
    }
    console.log(`${table}: ${ok} inserite, ${fail} fallite dopo retry riga per riga`);
  }
}

async function main() {
  const csn = await cds.load(path.join(__dirname, '..', '..', 'db', 'schema.cds'));
  cds.model = csn;

  console.log(`SQLITE_PATH: ${SQLITE_PATH}`);
  const sqliteDb = await cds.connect.to('sqlite-src', { kind: 'sqlite', credentials: { database: SQLITE_PATH } });
  const hanaDb = await connectDb(cds);

  for (const table of TABLES) {
    await migrateTable(sqliteDb, hanaDb, table);
  }
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { main };
