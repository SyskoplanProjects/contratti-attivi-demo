const cds = require('@sap/cds');
const { normalizeText } = require('./diff-utils');

async function generaAlertModificaTemplate(tx, clausolaVersioneID) {
  const { ClausolaVersione, Clausola, ContrattoClausola, Contratto,
    AlertModificaTemplate, AlertContrattoCoinvolto } = cds.entities('com.reply.contrattiattivi');

  const nuovaVersione = await tx.run(SELECT.one.from(ClausolaVersione, clausolaVersioneID));
  if (!nuovaVersione) return;

  const clausola = await tx.run(SELECT.one.from(Clausola, nuovaVersione.clausola_ID));
  if (!clausola || !clausola.template_ID) return; // not a template principal clause

  // find previous version
  const versioniPrecedenti = await tx.run(SELECT.from(ClausolaVersione)
    .where({ clausola_ID: clausola.ID, ID: { '<>': clausolaVersioneID } })
    .orderBy('numero desc'));
  if (!versioniPrecedenti.length) return;
  const vecchiaVersione = versioniPrecedenti[0];

  // find open contracts using this clause
  const righeContratto = await tx.run(SELECT.from(ContrattoClausola)
    .where({ clausola_ID: clausola.ID, rimossa: false }));

  if (!righeContratto.length) return;

  const contrattoIDs = [...new Set(righeContratto.map(r => r.contratto_ID))];
  const contrattiAperti = await tx.run(SELECT.from(Contratto)
    .where({ ID: { in: contrattoIDs }, stato: { in: ['BOZZA', 'IN_REVISIONE'] } }));

  if (!contrattiAperti.length) return;

  const alertID = cds.utils.uuid();
  await tx.run(INSERT.into(AlertModificaTemplate).entries({
    ID: alertID, template_ID: clausola.template_ID, clausola_ID: clausola.ID,
    vecchiaVersione_ID: vecchiaVersione.ID, nuovaVersione_ID: clausolaVersioneID,
    dataModifica: new Date().toISOString(), risolto: false
  }));

  for (const cc of righeContratto) {
    if (!contrattiAperti.find(c => c.ID === cc.contratto_ID)) continue;
    const versioneContratto = await tx.run(SELECT.one.from(ClausolaVersione, cc.clausolaVersione_ID));
    const clausolaIdentica = normalizeText(vecchiaVersione.testo) === normalizeText(versioneContratto?.testo || '');
    await tx.run(INSERT.into(AlertContrattoCoinvolto).entries({
      ID: cds.utils.uuid(), alert_ID: alertID, contratto_ID: cc.contratto_ID,
      clausolaIdentica, notificato: false
    }));
  }
}

module.exports = { generaAlertModificaTemplate };
