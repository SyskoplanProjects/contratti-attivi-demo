const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));

describe('schema Fase B — EsitoVerificaContratto e Anomalia', () => {
  it('crea un EsitoVerificaContratto con allegatiAttesi e deroghe come JSON e lo legge', async () => {
    const { Contratto, Template, TemplateVersion, EsitoVerificaContratto } = cds.entities('com.reply.contrattiattivi');

    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template fase B' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Test B', template_ID: templateID, templateVersion_ID: versionID
    });

    const esitoID = cds.utils.uuid();
    await INSERT.into(EsitoVerificaContratto).entries({
      ID: esitoID, contratto_ID: contrattoID, dataVerifica: new Date().toISOString(),
      completezzaPercent: 66.67,
      allegatiAttesi: [
        { codice: 'CGC', presente: true, filename: 'cgc.pdf' },
        { codice: 'CPC', presente: false, filename: null }
      ],
      deroghe: [{ articolo: '17', esito: 'derogato', dettaglio: 'Audit limitati', riferimentoComma: '17.2' }],
      totaleAllegati: 9, allegatiPresenti: 6, confidenzaMedia: 0.9, fonte: 'AVVIO_VERIFICA'
    });

    const riga = await SELECT.one.from(EsitoVerificaContratto, esitoID);
    expect(riga.completezzaPercent).toBe(66.67);
    expect(riga.allegatiAttesi).toHaveLength(2);
    expect(riga.allegatiAttesi[0].codice).toBe('CGC');
    expect(riga.deroghe[0].esito).toBe('derogato');
    expect(riga.fonte).toBe('AVVIO_VERIFICA');
  });

  it('crea un Anomalia con stato default APERTA e la legge', async () => {
    const { Contratto, Template, TemplateVersion, EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');

    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template fase B 2' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Test B2', template_ID: templateID, templateVersion_ID: versionID
    });
    const esitoID = cds.utils.uuid();
    await INSERT.into(EsitoVerificaContratto).entries({
      ID: esitoID, contratto_ID: contrattoID, dataVerifica: new Date().toISOString(), completezzaPercent: 50, fonte: 'CONTRATTO'
    });

    const anomaliaID = cds.utils.uuid();
    await INSERT.into(Anomalia).entries({
      ID: anomaliaID, esitoVerifica_ID: esitoID, tipo: 'COMPLETEZZA',
      riferimento: 'ALLEGATO_B', dettaglio: 'Allegati attesi mancanti'
    });

    const riga = await SELECT.one.from(Anomalia, anomaliaID);
    expect(riga.stato).toBe('APERTA');
    expect(riga.tipo).toBe('COMPLETEZZA');
    expect(riga.riferimento).toBe('ALLEGATO_B');
  });
});
