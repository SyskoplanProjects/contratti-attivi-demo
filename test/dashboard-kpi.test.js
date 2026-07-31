const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

async function seedSnapshot({ giorniFa, completezzaPercent, deroghe = [], fonte = 'CONTRATTO', contrattoID } = {}) {
  const { Contratto, Template, TemplateVersion, EsitoVerificaContratto } = cds.entities('com.reply.contrattiattivi');
  if (!contrattoID) {
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'T ' + cds.utils.uuid() });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'KPI S.p.A.', template_ID: templateID, templateVersion_ID: versionID
    });
  }
  const data = new Date();
  data.setDate(data.getDate() - giorniFa);
  await INSERT.into(EsitoVerificaContratto).entries({
    ID: cds.utils.uuid(), contratto_ID: contrattoID, dataVerifica: data.toISOString(),
    completezzaPercent, deroghe, totaleAllegati: 9, allegatiPresenti: Math.round(completezzaPercent / 100 * 9),
    confidenzaMedia: 0.9, fonte
  });
  return contrattoID;
}

async function seedAnomaliaAperta(contrattoID) {
  const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
  const esito = (await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: contrattoID }))[0];
  await INSERT.into(Anomalia).entries({
    ID: cds.utils.uuid(), esitoVerifica_ID: esito.ID, tipo: 'COMPLETEZZA',
    riferimento: 'ALLEGATO_B', dettaglio: 'mancante', stato: 'APERTA'
  });
}

describe('getDashboardKPIs (RF8)', () => {
  it('KPI corrette con snapshot multipli (ultimo per contratto)', async () => {
    const c1 = await seedSnapshot({ giorniFa: 10, completezzaPercent: 100 });
    await seedSnapshot({ giorniFa: 2, completezzaPercent: 50, contrattoID: c1 });
    const c2 = await seedSnapshot({ giorniFa: 1, completezzaPercent: 50 });
    await seedAnomaliaAperta(c2);

    const resp = await POST('/comparator/getDashboardKPIs', {}, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.totaleContratti).toBe(2);
    expect(resp.data.contrattiCompleti).toBe(0); // c1 latest 50, c2 50
    expect(resp.data.derogheTotali).toBe(0);
    expect(resp.data.anomalieAperte).toBe(1);
    expect(resp.data.completezzaMedia).toBe(50); // (50+50)/2, ultimo per contratto
    expect(resp.data.andamento.length).toBe(30);
  });

  it('andamento raggruppato per dataVerifica con completezzaMedia e totaleContratti', async () => {
    await seedSnapshot({ giorniFa: 0, completezzaPercent: 100 });
    await seedSnapshot({ giorniFa: 0, completezzaPercent: 50 });
    await seedSnapshot({ giorniFa: 5, completezzaPercent: 100 });

    const resp = await POST('/comparator/getDashboardKPIs', {}, { auth: MOCK_USER });
    expect(resp.status).toBe(200);

    const oggi = new Date().toISOString().slice(0, 10);
    const cinqueGiorniFa = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const giornoOggi = resp.data.andamento.find(a => a.data === oggi);
    const giorno5 = resp.data.andamento.find(a => a.data === cinqueGiorniFa);
    expect(giornoOggi.completezzaMedia).toBe(75);
    expect(giornoOggi.totaleContratti).toBe(2);
    expect(giorno5.totaleContratti).toBe(1);
  });
});
