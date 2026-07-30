const cds = require('@sap/cds');

// Mappa campo-metadato (nuovo modello) -> colonna Contratto (modello legacy, vedi
// docs/superpowers/plans/2026-07-30-wizard-verifica-metadati.md, sezione "Deviazioni dallo spec").
// intestatario ha due possibili sorgenti con priorità: titoloContratto se presente, altrimenti fornitore.
const MAPPA_COLONNE_SEMPLICI = {
  fornitore: 'societaContraente',
  contractManager: 'responsabileControparte',
  emailControparte: 'emailControparte',
  oggettoContratto: 'oggetto',
  dataFirma: 'dataStipula',
  dataDecorrenza: 'dataDecorrenza',
  dataScadenza: 'dataScadenza',
  partitaIvaFornitore: 'codiceFiscale'
};

async function salvaMetadati({ tx, parentType, parentID, metadati }) {
  const { MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
  const fk = parentType === 'Contratto' ? 'contratto_ID' : 'allegato_ID';

  await tx.run(DELETE.from(MetadatoDocumento).where({ [fk]: parentID }));

  const righe = (metadati || []).filter(m => m && m.campo);
  if (righe.length) {
    await tx.run(INSERT.into(MetadatoDocumento).entries(righe.map(m => ({
      ID: cds.utils.uuid(),
      [fk]: parentID,
      campo: m.campo,
      etichetta: m.etichetta || m.campo,
      valore: (m.valore != null && m.valore !== '') ? String(m.valore) : null,
      valoreOriginaleAI: m.valoreOriginaleAI != null ? String(m.valoreOriginaleAI)
        : ((m.valore != null && m.valore !== '') ? String(m.valore) : null),
      confidenza: m.confidenza != null ? m.confidenza : null,
      modificatoManualmente: !!m.modificatoManualmente
    }))));
  }

  if (parentType !== 'Contratto') return;

  const { Contratto } = cds.entities('com.reply.contrattiattivi');
  const byCampo = {};
  righe.forEach(m => { if (m.valore != null && m.valore !== '') byCampo[m.campo] = String(m.valore); });

  const update = {};
  if (byCampo.titoloContratto) update.intestatario = byCampo.titoloContratto;
  else if (byCampo.fornitore) update.intestatario = byCampo.fornitore;

  for (const [campo, colonna] of Object.entries(MAPPA_COLONNE_SEMPLICI)) {
    if (byCampo[campo]) update[colonna] = byCampo[campo];
  }

  if (byCampo.importoContrattuale) {
    const n = Number(byCampo.importoContrattuale);
    if (!isNaN(n)) update.importo = n;
  }

  if (Object.keys(update).length) {
    await tx.run(UPDATE(Contratto, parentID).with(update));
  }
}

module.exports = { salvaMetadati };
