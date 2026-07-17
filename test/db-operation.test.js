const path = require('path');
const cds = require('@sap/cds');
cds.test(path.join(__dirname, '..'));
const { seedTemplateConClausole } = require('./helpers/seed');

describe('db-operation', () => {
  it('getVersioniClausola returns ordered versions for existing clausola', async () => {
    const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Test' });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: clausolaID, numero: 1,
      testo: 'Versione 1', dataCreazione: new Date().toISOString(), modificata: false
    });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: clausolaID, numero: 2,
      testo: 'Versione 2', dataCreazione: new Date().toISOString(), modificata: true
    });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = await manageFunction('getVersioniClausola', JSON.stringify({ codice: 'C1' }));
    const data = JSON.parse(result);
    expect(data).toHaveLength(2);
    expect(data[0].numero).toBe(1);
    expect(data[1].numero).toBe(2);
  });

  it('getVersioniClausola returns empty array for unknown clausola', async () => {
    const { manageFunction } = require('../srv/modules/db-operation');
    const result = await manageFunction('getVersioniClausola', JSON.stringify({ codice: 'INEXISTENT' }));
    expect(JSON.parse(result)).toEqual([]);
  });

  it('manageFunction throws for unknown function name', async () => {
    const { manageFunction } = require('../srv/modules/db-operation');
    await expect(manageFunction('unknownFunc', '{}')).rejects.toThrow('Funzione sconosciuta');
  });

  it('getContrattiConCommentiAperti returns only contracts with open comments', async () => {
    const { Contratto, Revisione, Commento, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    const { templateID, versionID, clausolaID, versioneClausolaID } = await seedTemplateConClausole();

    const contrattoApertoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoApertoID, intestatario: 'Cliente Aperto', stato: 'IN_REVISIONE', template_ID: templateID, templateVersion_ID: versionID });
    const contrattoClausolaID = cds.utils.uuid();
    await INSERT.into(ContrattoClausola).entries({ ID: contrattoClausolaID, contratto_ID: contrattoApertoID, clausola_ID: clausolaID, clausolaVersione_ID: versioneClausolaID, ordine: 1 });
    const revisioneID = cds.utils.uuid();
    await INSERT.into(Revisione).entries({ ID: revisioneID, contratto_ID: contrattoApertoID, stato: 'IN_REVISIONE', dataInvio: new Date().toISOString() });
    await INSERT.into(Commento).entries({ ID: cds.utils.uuid(), revisione_ID: revisioneID, contrattoClausola_ID: contrattoClausolaID, testo: 'Commento aperto', autore: 'revisore@test.it', stato: 'APERTO' });

    const contrattoChiusoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoChiusoID, intestatario: 'Cliente Chiuso', stato: 'APPROVATO', template_ID: templateID, templateVersion_ID: versionID });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('getContrattiConCommentiAperti', '{}'));
    expect(result.some(r => r.contrattoID === contrattoApertoID)).toBe(true);
    expect(result.some(r => r.contrattoID === contrattoChiusoID)).toBe(false);
  });

  it('getInfoApprovazioneContratto returns revisore and data for an approved contract', async () => {
    const { Contratto, Revisione } = cds.entities('com.reply.contrattiattivi');
    const { templateID, versionID } = await seedTemplateConClausole();
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, intestatario: 'Cliente Approvato Unico', stato: 'APPROVATO', template_ID: templateID, templateVersion_ID: versionID });
    await INSERT.into(Revisione).entries({
      ID: cds.utils.uuid(), contratto_ID: contrattoID, stato: 'APPROVATA', revisore: 'mario.rossi@contrattiattivi.it',
      dataInvio: new Date().toISOString(), dataCompletamento: new Date().toISOString()
    });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('getInfoApprovazioneContratto', JSON.stringify({ intestatario: 'Cliente Approvato Unico' })));
    expect(result.revisore).toBe('mario.rossi@contrattiattivi.it');
    expect(result.dataCompletamento).toBeTruthy();
  });

  it('getInfoApprovazioneContratto returns null when no matching contract', async () => {
    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('getInfoApprovazioneContratto', JSON.stringify({ intestatario: 'Non Esiste Mai' })));
    expect(result).toBeNull();
  });

  it('getStatoContratto returns stato and dataStipula for matching contracts', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const { templateID, versionID } = await seedTemplateConClausole();
    await INSERT.into(Contratto).entries({ ID: cds.utils.uuid(), intestatario: 'Cliente Stato Uno', stato: 'BOZZA', template_ID: templateID, templateVersion_ID: versionID });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('getStatoContratto', JSON.stringify({ intestatario: 'Cliente Stato Uno' })));
    expect(result).toHaveLength(1);
    expect(result[0].stato).toBe('BOZZA');
  });

  it('getContrattiFuoriSyncConTemplate flags a contract with a locally diverged clause', async () => {
    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola, Contratto, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template FuoriSync', tipoServizio: 'Test' });
    const templateVersionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: templateVersionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'FS1', titolo: 'Test', template_ID: templateID });
    const versioneOrigineID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: versioneOrigineID, clausola_ID: clausolaID, numero: 0, testo: 'originale', dataCreazione: new Date().toISOString() });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: templateVersionID, clausola_ID: clausolaID, clausolaVersione_ID: versioneOrigineID, ordine: 1 });

    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, intestatario: 'Cliente FuoriSync', stato: 'BOZZA', template_ID: templateID, templateVersion_ID: templateVersionID });
    const versioneDivergenteID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({ ID: versioneDivergenteID, clausola_ID: clausolaID, numero: 1, testo: 'modificata sul contratto', dataCreazione: new Date().toISOString() });
    await INSERT.into(ContrattoClausola).entries({ ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID, clausolaVersione_ID: versioneDivergenteID, ordine: 1 });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('getContrattiFuoriSyncConTemplate', '{}'));
    expect(result.some(r => r.contrattoID === contrattoID)).toBe(true);
  });

  it('confrontaClausole compares the latest versions of two different clauses by default', async () => {
    const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const c1ID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: c1ID, codice: 'CC1', titolo: 'Prima' });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c1ID, numero: 0,
      testo: 'Testo della prima clausola.', dataCreazione: new Date().toISOString(), modificata: false
    });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c1ID, numero: 1,
      testo: 'Testo AGGIORNATO della prima clausola.', dataCreazione: new Date().toISOString(), modificata: true
    });

    const c2ID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: c2ID, codice: 'CC2', titolo: 'Seconda' });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c2ID, numero: 0,
      testo: 'Testo della seconda clausola.', dataCreazione: new Date().toISOString(), modificata: false
    });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('confrontaClausole', JSON.stringify({ codice1: 'CC1', codice2: 'CC2' })));

    expect(result.testo1).toBe('Testo AGGIORNATO della prima clausola.'); // ultima versione di CC1
    expect(result.testo2).toBe('Testo della seconda clausola.');
    expect(result.numero1).toBe(1);
    expect(result.numero2).toBe(0);
  });

  it('confrontaClausole honors explicit version numbers when provided', async () => {
    const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const c1ID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: c1ID, codice: 'CC3', titolo: 'Terza' });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c1ID, numero: 0,
      testo: 'Versione zero di CC3.', dataCreazione: new Date().toISOString(), modificata: false
    });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c1ID, numero: 1,
      testo: 'Versione uno di CC3.', dataCreazione: new Date().toISOString(), modificata: true
    });

    const c2ID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: c2ID, codice: 'CC4', titolo: 'Quarta' });
    await INSERT.into(ClausolaVersione).entries({
      ID: cds.utils.uuid(), clausola_ID: c2ID, numero: 0,
      testo: 'Versione zero di CC4.', dataCreazione: new Date().toISOString(), modificata: false
    });

    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('confrontaClausole', JSON.stringify({ codice1: 'CC3', codice2: 'CC4', numero1: 0, numero2: 0 })));

    expect(result.testo1).toBe('Versione zero di CC3.');
    expect(result.testo2).toBe('Versione zero di CC4.');
  });

  it('confrontaClausole returns an errore field when a clause code does not exist', async () => {
    const { manageFunction } = require('../srv/modules/db-operation');
    const result = JSON.parse(await manageFunction('confrontaClausole', JSON.stringify({ codice1: 'INESISTENTE', codice2: 'ANCHE-QUESTA' })));
    expect(result.errore).toBeTruthy();
  });

  describe('getClausolePiuAggiornateAltrove', () => {
    it('segnala una clausola quando un altro contratto usa già una versione più recente', async () => {
      const { Contratto, ContrattoClausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
      const { templateID, versionID, clausolaID, versioneClausolaID } = await seedTemplateConClausole();

      const contrattoVecchioID = cds.utils.uuid();
      await INSERT.into(Contratto).entries({
        ID: contrattoVecchioID, intestatario: 'Contratto Vecchio', stato: 'BOZZA',
        template_ID: templateID, templateVersion_ID: versionID
      });
      await INSERT.into(ContrattoClausola).entries({
        ID: cds.utils.uuid(), contratto_ID: contrattoVecchioID, clausola_ID: clausolaID,
        clausolaVersione_ID: versioneClausolaID, ordine: 1, rimossa: false
      });

      const versioneNuovaID = cds.utils.uuid();
      await INSERT.into(ClausolaVersione).entries({
        ID: versioneNuovaID, clausola_ID: clausolaID, numero: 1,
        testo: 'Testo aggiornato della clausola C1.', dataCreazione: new Date().toISOString(), modificata: true
      });
      const contrattoNuovoID = cds.utils.uuid();
      await INSERT.into(Contratto).entries({
        ID: contrattoNuovoID, intestatario: 'Contratto Aggiornato', stato: 'BOZZA',
        template_ID: templateID, templateVersion_ID: versionID
      });
      await INSERT.into(ContrattoClausola).entries({
        ID: cds.utils.uuid(), contratto_ID: contrattoNuovoID, clausola_ID: clausolaID,
        clausolaVersione_ID: versioneNuovaID, ordine: 1, rimossa: false
      });

      const { manageFunction } = require('../srv/modules/db-operation');
      const result = JSON.parse(await manageFunction('getClausolePiuAggiornateAltrove', JSON.stringify({ contrattoID: contrattoVecchioID })));

      expect(result).toHaveLength(1);
      expect(result[0].codice).toBe('C1');
      expect(result[0].versioneAttuale).toBe(0);
      expect(result[0].versionePiuRecenteDisponibile).toBe(1);
      expect(result[0].testoPiuRecente).toBe('Testo aggiornato della clausola C1.');
      expect(result[0].contrattoConVersionePiuRecente).toBe('Contratto Aggiornato');

      const risultatoInverso = JSON.parse(await manageFunction('getClausolePiuAggiornateAltrove', JSON.stringify({ contrattoID: contrattoNuovoID })));
      expect(risultatoInverso).toHaveLength(0);
    });

    it('returns an errore field for an unknown contratto', async () => {
      const { manageFunction } = require('../srv/modules/db-operation');
      const result = JSON.parse(await manageFunction('getClausolePiuAggiornateAltrove', JSON.stringify({ contrattoID: cds.utils.uuid() })));
      expect(result.errore).toBeTruthy();
    });
  });
});
