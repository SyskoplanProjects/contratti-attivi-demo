const fs = require('fs');
const path = require('path');
const { extractTextMultiFormato } = require('./ai-import');
const { categoriaMacro, TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');
const { salvaEsempio } = require('./classificazione-esempi');
const { connectDb } = require('./connect-db');

// Esempi reali dal POC (cartella fuori dal repo, path assoluto locale) usati per calibrare il
// classificatore embedding (srv/lib/allegato-classifier.js#_poolEmbeddings) con documenti veri
// invece dei soli testoRiferimento sintetici. Solo file a tipo singolo e verificato: i fascicoli
// compositi (es. "Contratti ICT", CGC+CPC+Allegati+OdA concatenati in un unico PDF) sono esclusi
// di proposito — userli come esempio a etichetta singola inquinerebbe il pool con un embedding
// medio che non rappresenta nessuno dei tipi realmente contenuti.
const BASE_DIR = process.env.POC_DIR
  ? path.join(process.env.POC_DIR, '03. Contratti da analizzare', 'a. Contratti SAP')
  : '/Users/emiliocasella/Desktop/POC Contratti_ER_0408/03. Contratti da analizzare/a. Contratti SAP';

const FILE_ENTRIES = [
  { file: 'OdA/4200017108 CAD IT S.P.A__signed.pdf', tipo: 'ODA' },
  { file: 'OdA/ODA Dedacredit 4200241577.pdf', tipo: 'ODA' },
  { file: 'OdA/4200252803 MICROSOFT SRL .pdf', tipo: 'ODA' },
  { file: '20250324 DORA Addendum ICCREA (1) - Italiano.docx', tipo: 'ADDENDUM' }
];

// Seconda fonte reale: "sample contratti" (ADAM, Nomios, quadro/Deda Credit). Ogni file è
// stato aperto e letto (non solo il nome) prima di assegnargli un tipo — necessario perché
// in ADAM Contratto_ADAM.pdf e CPC_Adam.pdf hanno il tipo SCAMBIATO rispetto al nome file:
// CPC_Adam.pdf contiene per intero il testo delle CGC ("Condizioni Generali di Contratto per
// Servizi ICT... GRUPPO BANCARIO COOPERATIVO ICCREA"), Contratto_ADAM.pdf apre invece con
// "Condizioni Particolari di Contratto" (quindi è la vera CPC). Etichettare questi due esempi
// per nome file avrebbe iniettato nel pool embedding due esempi CGC/CPC invertiti — stesso tipo
// di corruzione che aveva causato la regressione ODA. Esclusi di proposito: file a fascicolo
// composito (AllegatoA-B_Nomios.pdf, Allegati_ABCDF_Quadro.pdf uniscono più tipologie in un
// unico file, vedi nota sopra su FILE_ENTRIES) e i file Deloitte (scansioni senza testo,
// extractTextMultiFormato ritorna stringa vuota per l'intera cartella).
const SAMPLE_DIR = '/Users/emiliocasella/Desktop/sample contratti';

const SAMPLE_ENTRIES = [
  { file: 'ADAM/CPC_Adam.pdf', tipo: 'CGC' },
  { file: 'ADAM/Contratto_ADAM.pdf', tipo: 'CPC' },
  { file: 'ADAM/AllegatoA_Adam.pdf', tipo: 'ALLEGATO_A' },
  { file: 'ADAM/allegatoB_ADAM.pdf', tipo: 'ALLEGATO_B' },
  { file: 'ADAM/AllegatoC_ADAM.pdf', tipo: 'ALLEGATO_C' },
  { file: 'ADAM/AllegatoD_ADAM.pdf', tipo: 'ALLEGATO_D' },
  { file: 'ADAM/AllegatoE_ADAM.pdf', tipo: 'ALLEGATO_E' },
  { file: 'ADAM/AllegatoF_ADAM.pdf', tipo: 'ALLEGATO_F' },
  { file: 'ADAM/AllegatoG_ADAM.pdf', tipo: 'ALLEGATO_G' },
  { file: 'ADAM/Deroghe_CGC_Adam.pdf', tipo: 'ADDENDUM' },
  { file: 'Nomios/AllegatoC_Nomios.pdf', tipo: 'ALLEGATO_C' },
  { file: 'Nomios/AllegatoD_Nomios.pdf', tipo: 'ALLEGATO_D' },
  { file: 'Nomios/AllegatoE_Nomios.pdf', tipo: 'ALLEGATO_E' },
  { file: 'Nomios/AllegatoF_Nomios.pdf', tipo: 'ALLEGATO_F' },
  { file: 'Nomios/NOMIOS_AllegatoF.pdf', tipo: 'ALLEGATO_F' },
  { file: 'Nomios/AllegatoG_Nomios.pdf', tipo: 'ALLEGATO_G' },
  { file: 'Nomios/Nomios_CPC.pdf', tipo: 'CPC' },
  { file: 'Nomios/Contratto_Nomios.pdf', tipo: 'CONTRATTO' },
  { file: 'Oda/4200017108 CAD IT S.P.A__signed.pdf', tipo: 'ODA' },
  { file: "Oda/4200017108_4600001499_SAP_2026-02-11 - BCC Sinergia - Lettera integrativa Od.pdf", tipo: 'ODA' },
  { file: 'quadro/ODA Dedacredit 4200241577.pdf', tipo: 'ODA' },
  { file: 'quadro/AccordoQuadro_Contratto.pdf', tipo: 'CONTRATTO' }
];

// Terza fonte reale: certificati generici (DURC/DURF/Visura), colmano tipologie assenti
// dalle prime due fonti (solo contratti/allegati bancari ICT).
const SAMPLE_DIR_2 = '/Users/emiliocasella/Documents/CONTRATTI ATTIVI/sample pdf';

const SAMPLE_ENTRIES_2 = [
  { file: 'durf.pdf', tipo: 'DURF' },
  { file: 'durc.pdf', tipo: 'DURC' },
  { file: 'camera commercio.pdf', tipo: 'CAMERA_COMMERCIO' }
];

function _mimeType(filename) {
  const n = filename.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function seed() {
  let importati = 0;
  const fonti = [
    ...FILE_ENTRIES.map(e => ({ ...e, baseDir: BASE_DIR })),
    ...SAMPLE_ENTRIES.map(e => ({ ...e, baseDir: SAMPLE_DIR })),
    ...SAMPLE_ENTRIES_2.map(e => ({ ...e, baseDir: SAMPLE_DIR_2 }))
  ];
  for (const { file, tipo, baseDir } of fonti) {
    const fullPath = path.join(baseDir, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File non trovato, saltato: ${fullPath}`);
      continue;
    }
    const buffer = fs.readFileSync(fullPath);
    const testo = await extractTextMultiFormato(buffer, _mimeType(file), path.basename(file));
    if (!testo || !testo.trim()) {
      console.warn(`Testo vuoto, saltato: ${file}`);
      continue;
    }

    const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
    const categoria = categoriaMacro(tipo);
    const sottoTipo = (tipologia && tipologia.sottoTipologia) ? tipo : null;

    await salvaEsempio({ categoria, sottoTipo, testo, fonte: 'poc-reale' });
    console.log(`Esempio salvato: ${path.basename(file)} -> ${tipo}`);
    importati++;
  }
  console.log(`Esempi di classificazione importati: ${importati}`);
  return importati;
}

async function main() {
  const cds = require('@sap/cds');
  const csn = await cds.load(path.join(__dirname, '..', '..', 'db', 'schema.cds'));
  cds.model = csn;
  await connectDb(cds);
  await seed();
}

if (require.main === module) main().catch(e => { console.error(e.message || e); process.exit(1); });

module.exports = { seed, main };
