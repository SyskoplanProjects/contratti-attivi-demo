const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

async function seedAnomalia(stato, extra) {
  const { Contratto, Template, TemplateVersion, EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
  const templateID = cds.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome: 'T ' + cds.utils.uuid() });
  const versionID = cds.utils.uuid();
  await INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
  });
  const contrattoID = cds.utils.uuid();
  await INSERT.into(Contratto).entries({
    ID: contrattoID, stato: 'BOZZA', intestatario: 'Anomalie S.p.A.', template_ID: templateID, templateVersion_ID: versionID
  });
  const esitoID = cds.utils.uuid();
  await INSERT.into(EsitoVerificaContratto).entries({
    ID: esitoID, contratto_ID: contrattoID, dataVerifica: new Date().toISOString(), completezzaPercent: 50, fonte: 'CONTRATTO'
  });
  const anomaliaID = cds.utils.uuid();
  await INSERT.into(Anomalia).entries(Object.assign({
    ID: anomaliaID, esitoVerifica_ID: esitoID, tipo: 'COMPLETEZZA',
    riferimento: 'ALLEGATO_B', dettaglio: 'mancante', stato
  }, extra || {}));
  return { anomaliaID, contrattoID, intestatario: 'Anomalie S.p.A.' };
}

describe('workflow anomalie (RF9)', () => {
  it('assegnaAnomalia: APERTA → ASSEGNATA con assegnatario', async () => {
    const { anomaliaID } = await seedAnomalia('APERTA');
    const resp = await POST('/comparator/assegnaAnomalia', { anomaliaID, assegnatario: 'mario.rossi@contrattiattivi.it' }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.stato).toBe('ASSEGNATA');
    expect(resp.data.assegnatario).toBe('mario.rossi@contrattiattivi.it');
  });

  it('assegnaAnomalia su ASSEGNATA → 409', async () => {
    const { anomaliaID } = await seedAnomalia('ASSEGNATA', { assegnatario: 'x@x.it' });
    await expect(POST('/comparator/assegnaAnomalia', { anomaliaID, assegnatario: 'y@y.it' }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 409 } });
  });

  it('avviaLavorazione: ASSEGNATA → IN_LAVORAZIONE; su APERTA → 409', async () => {
    const { anomaliaID } = await seedAnomalia('ASSEGNATA', { assegnatario: 'x@x.it' });
    const resp = await POST('/comparator/avviaLavorazione', { anomaliaID }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.stato).toBe('IN_LAVORAZIONE');

    const { anomaliaID: a2 } = await seedAnomalia('APERTA');
    await expect(POST('/comparator/avviaLavorazione', { anomaliaID: a2 }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 409 } });
  });

  it('risolviAnomalia: IN_LAVORAZIONE → RISOLTA con nota e file', async () => {
    const { anomaliaID } = await seedAnomalia('IN_LAVORAZIONE', { assegnatario: 'x@x.it' });
    const resp = await POST('/comparator/risolviAnomalia', {
      anomaliaID, nota: 'Azione correttiva completata', file: 'UEsDBBQ=', filename: 'azione.docx'
    }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.stato).toBe('RISOLTA');
    expect(resp.data.notaCorrettiva).toBe('Azione correttiva completata');
    expect(resp.data.filenameAllegato).toBe('azione.docx');
  });

  it('risolviAnomalia senza file: allegato null, filename null', async () => {
    const { anomaliaID } = await seedAnomalia('IN_LAVORAZIONE', { assegnatario: 'x@x.it' });
    const resp = await POST('/comparator/risolviAnomalia', { anomaliaID, nota: 'ok' }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.allegato).toBeNull();
    expect(resp.data.filenameAllegato).toBeNull();
  });

  it('chiudiAnomalia: APERTA → CHIUSA_SENZA_AZIONE con nota; RISOLTA → 409', async () => {
    const { anomaliaID } = await seedAnomalia('APERTA');
    const resp = await POST('/comparator/chiudiAnomalia', { anomaliaID, nota: 'Non applicabile' }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    expect(resp.data.stato).toBe('CHIUSA_SENZA_AZIONE');
    expect(resp.data.notaCorrettiva).toBe('Non applicabile');

    const { anomaliaID: a2 } = await seedAnomalia('RISOLTA');
    await expect(POST('/comparator/chiudiAnomalia', { anomaliaID: a2, nota: 'x' }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 409 } });
  });

  it('anomalia inesistente → 404', async () => {
    await expect(POST('/comparator/avviaLavorazione', { anomaliaID: cds.utils.uuid() }, { auth: MOCK_USER }))
      .rejects.toMatchObject({ response: { status: 404 } });
  });

  it('getAnomalie: filtra per stato/tipo e ritorna contrattoID + intestatario', async () => {
    const { anomaliaID, contrattoID, intestatario } = await seedAnomalia('APERTA');
    const resp = await POST('/comparator/getAnomalie', { stato: 'APERTA', tipo: 'COMPLETEZZA' }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    const righe = resp.data.value;
    const riga = righe.find(r => r.anomaliaID === anomaliaID);
    expect(riga).toBeDefined();
    expect(riga.contrattoID).toBe(contrattoID);
    expect(riga.intestatario).toBe(intestatario);
    expect(riga.stato).toBe('APERTA');
  });
});
