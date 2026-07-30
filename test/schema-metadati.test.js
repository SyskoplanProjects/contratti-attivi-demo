const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

describe('schema MetadatoDocumento', () => {
  it('collega righe metadato a un Contratto e le legge via composition', async () => {
    const { Contratto, Template, TemplateVersion, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');

    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template metadati test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Test', template_ID: templateID, templateVersion_ID: versionID
    });

    await INSERT.into(MetadatoDocumento).entries({
      ID: cds.utils.uuid(), contratto_ID: contrattoID,
      campo: 'fornitore', etichetta: 'Fornitore', valore: 'Acme S.p.A.',
      valoreOriginaleAI: 'Acme S.p.A.', confidenza: 0.92, modificatoManualmente: false
    });

    const righe = await SELECT.from(MetadatoDocumento).where({ contratto_ID: contrattoID });
    expect(righe).toHaveLength(1);
    expect(righe[0].campo).toBe('fornitore');
    expect(righe[0].confidenza).toBeCloseTo(0.92);
  });

  it('collega righe metadato a un ContrattoAllegato e ContrattoAllegato non ha più campiEstratti', async () => {
    const { Contratto, Template, TemplateVersion, ContrattoAllegato, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const contrattiDef = cds.model.definitions['com.reply.contrattiattivi.ContrattoAllegato'];
    expect(contrattiDef.elements.campiEstratti).toBeUndefined();
    expect(contrattiDef.elements.metadati).toBeDefined();

    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template allegato test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Test2', template_ID: templateID, templateVersion_ID: versionID
    });
    const allegatoID = cds.utils.uuid();
    await INSERT.into(ContrattoAllegato).entries({
      ID: allegatoID, contratto_ID: contrattoID, filename: 'durc.pdf', contenuto: 'AA==', tipo: 'DURC'
    });
    await INSERT.into(MetadatoDocumento).entries({
      ID: cds.utils.uuid(), allegato_ID: allegatoID,
      campo: 'denominazione', etichetta: 'Denominazione', valore: 'Acme S.p.A.'
    });

    const righe = await SELECT.from(MetadatoDocumento).where({ allegato_ID: allegatoID });
    expect(righe).toHaveLength(1);
  });
});
