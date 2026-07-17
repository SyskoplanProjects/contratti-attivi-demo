const cds = require('@sap/cds');

async function seedTemplateConClausole() {
  const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } =
    cds.entities('com.reply.contrattiattivi');

  const templateID = cds.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome: 'Template Test', tipoServizio: 'ICT' });

  const versionID = cds.utils.uuid();
  await INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
  });

  const clausolaID = cds.utils.uuid();
  await INSERT.into(Clausola).entries({
    ID: clausolaID, codice: 'C1', titolo: 'Oggetto del contratto', template_ID: templateID
  });

  const versioneClausolaID = cds.utils.uuid();
  await INSERT.into(ClausolaVersione).entries({
    ID: versioneClausolaID, clausola_ID: clausolaID, numero: 0,
    testo: 'Testo originale della clausola C1.', dataCreazione: new Date().toISOString(),
    modificata: false, templateVersionOrigine_ID: versionID
  });

  await INSERT.into(TemplateVersionClausola).entries({
    ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID,
    clausolaVersione_ID: versioneClausolaID, ordine: 1
  });

  return { templateID, versionID, clausolaID, versioneClausolaID };
}

module.exports = { seedTemplateConClausole };
