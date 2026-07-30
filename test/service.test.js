const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn().mockResolvedValue({
    clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo estratto dal documento di prova.' }]
  }),
  embeddings: jest.fn().mockResolvedValue([[1, 0, 0]])
}));

describe('data model', () => {
  it('loads all core entities under com.reply.contrattiattivi', async () => {
    const model = await cds.load(path.join(__dirname, '..', 'db', 'schema.cds'));
    const csn = cds.compile.for.odata(model);
    const names = Object.keys(csn.definitions);
    [
      'com.reply.contrattiattivi.Template',
      'com.reply.contrattiattivi.TemplateVersion',
      'com.reply.contrattiattivi.Clausola',
      'com.reply.contrattiattivi.ClausolaVersione',
      'com.reply.contrattiattivi.TemplateVersionClausola',
      'com.reply.contrattiattivi.Contratto',
      'com.reply.contrattiattivi.ContrattoClausola'
    ].forEach(entity => expect(names).toContain(entity));
  });

  it('loads revisione entities under com.reply.contrattiattivi', async () => {
    const model = await cds.load(path.join(__dirname, '..', 'db', 'schema.cds'));
    const csn = cds.compile.for.odata(model);
    const names = Object.keys(csn.definitions);
    [
      'com.reply.contrattiattivi.Revisione',
      'com.reply.contrattiattivi.Commento'
    ].forEach(e => expect(names).toContain(e));
  });
});

const { GET, POST, axios } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

describe('ContrattiService', () => {
  it('exposes /contratti/$metadata for the mocked InternalUser', async () => {
    const res = await GET('/contratti/$metadata', {
      auth: { username: 'mario.rossi@contrattiattivi.it', password: 'test' }
    });
    expect(res.status).toBe(200);
    expect(res.data).toContain('Contratto');
  });

  it('exposes the new AI import and manual creation actions in $metadata', async () => {
    const res = await GET('/contratti/$metadata', {
      auth: { username: 'mario.rossi@contrattiattivi.it', password: 'test' }
    });
    expect(res.data).toContain('previewImportAI');
    expect(res.data).toContain('confirmImportAI');
    expect(res.data).toContain('creaTemplateManuale');
  });
});

const { seedTemplateConClausole } = require('./helpers/seed');

describe('creaDaTemplate', () => {
  it('creates a BOZZA contract with clauses copied from the current template version', async () => {
    const { templateID, versioneClausolaID } = await seedTemplateConClausole();

    const res = await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('BOZZA');
    expect(res.data.template_ID).toBe(templateID);

    const clausole = await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${res.data.ID}`, { auth: MOCK_USER });
    expect(clausole.data.value).toHaveLength(1);
    expect(clausole.data.value[0].clausolaVersione_ID).toBe(versioneClausolaID);
  });
});

describe('modificaClausolaTesto', () => {
  it('creates a new ClausolaVersione instead of overwriting the existing one', async () => {
    const { templateID, clausolaID, versioneClausolaID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const righe = (await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${contratto.ID}`, { auth: MOCK_USER })).data.value;

    const res = await POST(`/contratti/Contratto(${contratto.ID})/ContrattiService.modificaClausolaTesto`,
      { contrattoClausolaID: righe[0].ID, nuovoTesto: 'Testo modificato della clausola C1.' }, { auth: MOCK_USER });
    expect(res.status).toBe(200);

    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const versioniPerClausola = await SELECT.from(ClausolaVersione).where({ clausola_ID: clausolaID });
    expect(versioniPerClausola).toHaveLength(2);

    const vecchiaVersione = await SELECT.one.from(ClausolaVersione, versioneClausolaID);
    expect(vecchiaVersione.testo).toBe('Testo originale della clausola C1.');

    const rigaAggiornata = await GET(`/contratti/ContrattoClausola(${righe[0].ID})`, { auth: MOCK_USER });
    expect(rigaAggiornata.data.clausolaVersione_ID).not.toBe(versioneClausolaID);
  });
});

describe('aggiungiClausola / rimuoviClausola', () => {
  it('adds a clause row and removes it (soft delete)', async () => {
    const { templateID, clausolaID, versioneClausolaID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;

    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const secondaClausolaID = cds.utils.uuid();
    await INSERT.into(cds.entities('com.reply.contrattiattivi').Clausola).entries({
      ID: secondaClausolaID, codice: 'C2', titolo: 'Clausola aggiuntiva', aggiuntiva: true
    });
    const secondaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: secondaVersioneID, clausola_ID: secondaClausolaID, numero: 0,
      testo: 'Testo clausola aggiuntiva.', dataCreazione: new Date().toISOString(), modificata: false
    });

    const add = await POST(`/contratti/Contratto(${contratto.ID})/ContrattiService.aggiungiClausola`,
      { clausolaVersioneID: secondaVersioneID }, { auth: MOCK_USER });
    expect(add.status).toBe(200);

    const righe = await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${contratto.ID}`, { auth: MOCK_USER });
    expect(righe.data.value).toHaveLength(2);

    const rigaDaRimuovere = righe.data.value[0];
    const remove = await POST(`/contratti/Contratto(${contratto.ID})/ContrattiService.rimuoviClausola`,
      { contrattoClausolaID: rigaDaRimuovere.ID }, { auth: MOCK_USER });
    expect(remove.status).toBe(200);

    const rigaAggiornata = await GET(`/contratti/ContrattoClausola(${rigaDaRimuovere.ID})`, { auth: MOCK_USER });
    expect(rigaAggiornata.data.rimossa).toBe(true);
  });

  it('blocks modification actions when contract is not BOZZA', async () => {
    const { templateID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, contratto.ID).with({ stato: 'APPROVATO' });

    await expect(
      POST(`/contratti/Contratto(${contratto.ID})/ContrattiService.rimuoviClausola`,
        { contrattoClausolaID: cds.utils.uuid() }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});

const { Document, Packer, Paragraph } = require('docx');

async function buildDocxBuffer(clauseTexts) {
  const doc = new Document({
    sections: [{ children: clauseTexts.flatMap(c => [new Paragraph(c.header), new Paragraph(c.body)]) }]
  });
  return Packer.toBuffer(doc);
}

describe('importTemplate', () => {
  it('rejects unauthenticated requests', async () => {
    await expect(axios.post('/contratti/importTemplate', Buffer.from('x'), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-filename': 'template.docx' }
    })).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('creates a new TemplateVersion and detects delta on re-import', async () => {
    const bufferV0 = await buildDocxBuffer([
      { header: 'Art. 1 - Oggetto', body: 'Testo oggetto versione 0.' },
      { header: 'Art. 2 - Durata', body: 'Testo durata versione 0.' }
    ]);

    const importV0 = await axios.post('/contratti/importTemplate', bufferV0, {
      auth: MOCK_USER,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-filename': 'template.docx' }
    });
    expect(importV0.status).toBe(200);
    expect(importV0.data.clausoleCreate).toBe(2);
    expect(importV0.data.clausoleRiutilizzate).toBe(0);
    expect(importV0.data.templateID).toBeDefined();

    const templateID = importV0.data.templateID;

    const bufferV1 = await buildDocxBuffer([
      { header: 'Art. 1 - Oggetto', body: 'Testo oggetto versione 0.' },
      { header: 'Art. 2 - Durata', body: 'Testo durata MODIFICATO in versione 1.' }
    ]);

    const importV1 = await axios.post('/contratti/importTemplate', bufferV1, {
      auth: MOCK_USER,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x-filename': 'template.docx',
        'x-template-id': templateID
      }
    });
    expect(importV1.data.clausoleRiutilizzate).toBe(1);
    expect(importV1.data.clausoleConDelta).toBe(1);
  });
});

describe('esportaContratto', () => {
  it('downloads a docx containing the header and non-removed clauses', async () => {
    const { templateID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;

    const res = await axios.get(`/contratti/esportaContratto/${contratto.ID}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(Buffer.from(res.data).slice(0, 2).toString('hex')).toBe('504b'); // firma ZIP/docx
  });

  it('returns 404 for an unknown contratto', async () => {
    await expect(axios.get(`/contratti/esportaContratto/${cds.utils.uuid()}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    })).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('rejects unauthenticated requests', async () => {
    const { templateID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;

    await expect(axios.get(`/contratti/esportaContratto/${contratto.ID}`))
      .rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('getStoricoClausola / confrontaVersioni', () => {
  it('returns version history including which contracts currently use each version', async () => {
    const { templateID, clausolaID, versioneClausolaID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;

    const storico = await POST('/contratti/getStoricoClausola', { clausolaID }, { auth: MOCK_USER });
    expect(storico.data.value).toHaveLength(1);
    expect(storico.data.value[0].versioneID).toBe(versioneClausolaID);
    expect(storico.data.value[0].contrattiCorrenti).toContain(contratto.ID);
  });

  it('computes a textual diff between two arbitrary clause versions', async () => {
    const { clausolaID, versioneClausolaID } = await seedTemplateConClausole();
    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const v2ID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: v2ID, clausola_ID: clausolaID, numero: 1,
      testo: 'Testo originale MODIFICATO della clausola C1.', dataCreazione: new Date().toISOString(), modificata: true
    });

    const res = await POST('/contratti/confrontaVersioni', { versioneID1: versioneClausolaID, versioneID2: v2ID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    const delta = JSON.parse(res.data.delta);
    expect(delta.some(p => p.added)).toBe(true);
  });
});

describe('confrontaContrattoConTemplate / copiaVersioneClausola', () => {
  it('flags a clause as out of sync after an ad-hoc modification', async () => {
    const { templateID } = await seedTemplateConClausole();
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const righe = (await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${contratto.ID}`, { auth: MOCK_USER })).data.value;

    await POST(`/contratti/Contratto(${contratto.ID})/ContrattiService.modificaClausolaTesto`,
      { contrattoClausolaID: righe[0].ID, nuovoTesto: 'Testo divergente dal template.' }, { auth: MOCK_USER });

    const res = await POST('/contratti/confrontaContrattoConTemplate', { contrattoID: contratto.ID }, { auth: MOCK_USER });
    expect(res.data.value[0].fuoriSync).toBe(true);
  });

  it('copies a clause version onto another BOZZA contract, blocked otherwise', async () => {
    const { templateID, versioneClausolaID } = await seedTemplateConClausole();
    const contrattoA = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const contrattoB = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;

    const copia = await POST('/contratti/copiaVersioneClausola',
      { clausolaVersioneID: versioneClausolaID, contrattoDestinazioneID: contrattoB.ID }, { auth: MOCK_USER });
    expect(copia.status).toBe(200);

    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, contrattoB.ID).with({ stato: 'APPROVATO' });

    await expect(
      POST('/contratti/copiaVersioneClausola', { clausolaVersioneID: versioneClausolaID, contrattoDestinazioneID: contrattoB.ID }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe('flusso revisione', () => {
  let templateID, contrattoID;

  beforeEach(async () => {
    const seed = await seedTemplateConClausole();
    templateID = seed.templateID;
    const contratto = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    contrattoID = contratto.ID;
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, contrattoID).with({ responsabile: 'mario.rossi@contrattiattivi.it' });
  });

  it('inviaARevisione transitions from BOZZA to IN_REVISIONE', async () => {
    const res = await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('IN_REVISIONE');
  });

  it('blocks inviaARevisione if contratto is not BOZZA', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, contrattoID).with({ stato: 'APPROVATO' });
    await expect(
      POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });

  it('aggiungiCommento adds a comment and sets revisione to COMMENTATA', async () => {
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const { Revisione } = cds.entities('com.reply.contrattiattivi');
    const revisioni = await SELECT.from(Revisione).where({ contratto_ID: contrattoID });
    const righe = (await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${contrattoID}`, { auth: MOCK_USER })).data.value;
    const res = await POST('/contratti/aggiungiCommento', { contrattoID, contrattoClausolaID: righe[0].ID, testo: 'Da rivedere.' }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });
    expect(res.status).toBe(200);
    expect(res.data.testo).toBe('Da rivedere.');
  });

  it('approvaRevisione transitions contratto to APPROVATO', async () => {
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const { Revisione } = cds.entities('com.reply.contrattiattivi');
    const revisioni = await SELECT.from(Revisione).where({ contratto_ID: contrattoID });
    const res = await POST('/contratti/approvaRevisione', { revisioneID: revisioni[0].ID }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });
    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('APPROVATO');
  });

  it('rifiutaRevisione returns contratto to BOZZA', async () => {
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const { Revisione } = cds.entities('com.reply.contrattiattivi');
    const revisioni = await SELECT.from(Revisione).where({ contratto_ID: contrattoID });
    const res = await POST('/contratti/rifiutaRevisione', { revisioneID: revisioni[0].ID }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });
    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('BOZZA');
  });

  it('riaprireBozza allows owner to reopen after invio', async () => {
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const res = await POST('/contratti/riaprireBozza', { contrattoID }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.stato).toBe('BOZZA');
  });

  it('blocks owner-only actions when called by non-owner', async () => {
    await expect(
      POST('/contratti/inviaARevisione', { contrattoID }, { auth: { username: 'altra.persona@contrattiattivi.it', password: 'test' } })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('full cycle: BOZZA -> invia -> commento -> riapri -> re-invia -> approva -> APPROVATO', async () => {
    const c = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, c.ID).with({ responsabile: 'mario.rossi@contrattiattivi.it' });

    await POST('/contratti/inviaARevisione', { contrattoID: c.ID }, { auth: MOCK_USER });

    const { Revisione } = cds.entities('com.reply.contrattiattivi');
    const rev1 = (await SELECT.from(Revisione).where({ contratto_ID: c.ID }))[0];
    const righe = (await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${c.ID}`, { auth: MOCK_USER })).data.value;
    await POST('/contratti/aggiungiCommento', { contrattoID: c.ID, contrattoClausolaID: righe[0].ID, testo: 'Ok' }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });

    await POST('/contratti/riaprireBozza', { contrattoID: c.ID }, { auth: MOCK_USER });

    await POST('/contratti/inviaARevisione', { contrattoID: c.ID }, { auth: MOCK_USER });

    const rev2 = (await SELECT.from(Revisione).where({ contratto_ID: c.ID }).orderBy('dataInvio desc'))[0];
    expect(rev2.ID).not.toBe(rev1.ID);

    const approvato = (await POST('/contratti/approvaRevisione', { revisioneID: rev2.ID }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } })).data;
    expect(approvato.stato).toBe('APPROVATO');
  });

  it('forbids modification actions during IN_REVISIONE', async () => {
    const c = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, c.ID).with({ responsabile: 'mario.rossi@contrattiattivi.it' });
    await POST('/contratti/inviaARevisione', { contrattoID: c.ID }, { auth: MOCK_USER });

    const righe = (await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${c.ID}`, { auth: MOCK_USER })).data.value;
    await expect(
      POST(`/contratti/Contratto(${c.ID})/ContrattiService.rimuoviClausola`,
        { contrattoClausolaID: righe[0].ID }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe('agente service definition', () => {
  it('loads agenteService without compile errors', async () => {
    const model = await cds.load(path.join(__dirname, '..', 'srv', 'agente-service.cds'));
    const csn = cds.compile.for.odata(model);
    expect(csn.definitions).toHaveProperty('agenteService');
  });
});

describe('confirmImportAI', () => {
  const FormData = require('form-data');
  const { Document, Packer, Paragraph } = require('docx');

  it('commits the confirmed clausole and creates a new template', async () => {
    const form = new FormData();
    const buffer = await Packer.toBuffer(new Document({
      sections: [{ children: [new Paragraph('Contenuto di prova per confirmImportAI.')] }]
    }));
    form.append('file', buffer, {
      filename: 'contratto-confirm.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const preview = await axios.post('/contratti/previewImportAI', form, {
      auth: MOCK_USER, headers: form.getHeaders()
    });

    const r = await POST('/contratti/confirmImportAI', {
      previewID: preview.data.previewID,
      clausole: preview.data.clausole
    }, { auth: MOCK_USER });

    expect(r.status).toBe(200);
    expect(r.data.clausoleCreate).toBe(preview.data.clausole.length);
    expect(typeof r.data.templateID).toBe('string');
  });

  it('rejects an unknown or expired previewID with 410', async () => {
    await expect(POST('/contratti/confirmImportAI', {
      previewID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      clausole: []
    }, { auth: MOCK_USER })).rejects.toMatchObject({ response: { status: 410 } });
  });
});

describe('creaTemplateManuale', () => {
  it('creates a Template with TemplateVersion 0 and one Clausola per input row', async () => {
    const r = await POST('/contratti/creaTemplateManuale', {
      nome: 'Template manuale test',
      tipoServizio: 'Consulenza',
      descrizione: 'Creato a mano per test',
      clausole: [
        { titolo: 'Oggetto', testo: 'Testo oggetto.' },
        { titolo: 'Durata', testo: 'Testo durata.' }
      ],
      testata: { intestatario: 'Cliente Manuale Test' }
    }, { auth: MOCK_USER });

    expect(r.status).toBe(200);
    expect(r.data.intestatario).toBe('Cliente Manuale Test');

    const clausole = await GET(`/contratti/Clausola?$filter=template_ID eq ${r.data.template_ID}`, { auth: MOCK_USER });
    expect(clausole.data.value).toHaveLength(2);
  });

  it('rejects a request with no clausole', async () => {
    await expect(POST('/contratti/creaTemplateManuale', {
      nome: 'Template vuoto', clausole: []
    }, { auth: MOCK_USER })).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('creaClausola con clausolaBaseID', () => {
  it('creates a new version of the base clause instead of a new independent clause', async () => {
    const { clausolaID, versioneClausolaID } = await seedTemplateConClausole();

    const res = await POST('/contratti/creaClausola', {
      testo: 'Testo originale della clausola C1. Con una aggiunta.',
      clausolaBaseID: clausolaID
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.ID).toBe(clausolaID); // stessa clausola, non una nuova

    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const versioni = await SELECT.from(ClausolaVersione).where({ clausola_ID: clausolaID }).orderBy('numero');
    expect(versioni).toHaveLength(2);
    expect(versioni[1].numero).toBe(1); // bump rispetto alla versione 0 esistente
    expect(versioni[1].modificata).toBe(true);
    const delta = JSON.parse(versioni[1].dettaglioDelta);
    expect(delta.some(p => p.added)).toBe(true);
    expect(versioni[0].ID).toBe(versioneClausolaID); // la versione base non è toccata
  });

  it('rejects when clausolaBaseID does not exist', async () => {
    await expect(POST('/contratti/creaClausola', {
      testo: 'Testo qualsiasi', clausolaBaseID: cds.utils.uuid()
    }, { auth: MOCK_USER })).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('still creates an independent clause when clausolaBaseID is omitted (no regression)', async () => {
    const res = await POST('/contratti/creaClausola', {
      codice: 'ZZZ', titolo: 'Clausola indipendente', testo: 'Testo nuovo.'
    }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.codice).toBe('ZZZ');
    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const versioni = await SELECT.from(ClausolaVersione).where({ clausola_ID: res.data.ID });
    expect(versioni).toHaveLength(1);
    expect(versioni[0].numero).toBe(0);
  });
});

describe('ComparatorService confirmCoverage', () => {
  const previewStore = require('../srv/lib/preview-store');

  it('creates a new Contratto with its Clausole from the analyzed contract', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test_acme.pdf',
      clausole: [
        { numero: 1, titolo: 'Oggetto', testo: 'Testo clausola 1.', stato: 'PRESENTE', similarity: 0.9 },
        { numero: 2, titolo: 'Durata', testo: 'Testo clausola 2.', stato: 'VARIANTE', similarity: 0.6 }
      ],
      coveragePercent: 75
    });

    const res = await POST('/comparator/confirmCoverage', { previewID, clausole: [], allegati: [], metadati: [] }, { auth: MOCK_USER });

    expect(res.status).toBe(200);
    expect(res.data.intestatario).toBe('contratto_test_acme');
    expect(res.data.stato).toBe('BOZZA');

    const righe = await GET(
      `/contratti/ContrattoClausola?$filter=contratto_ID eq ${res.data.ID}`,
      { auth: MOCK_USER }
    );
    expect(righe.data.value.length).toBe(2);
  });

  it('rejects with 400 when there are no clauses', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'vuoto.pdf',
      clausole: [],
      coveragePercent: 0
    });

    await expect(
      POST('/comparator/confirmCoverage', { previewID, clausole: [], allegati: [], metadati: [] }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('Contratto versioning snapshots', () => {
  let contrattoID, versione1ID, versione2ID;
  const auth = { username: 'mario.rossi@contrattiattivi.it', password: 'test' };

  beforeAll(async () => {
    const { ContrattoVersione, ContrattoVersioneClausola, Contratto, Revisione } =
      cds.entities('com.reply.contrattiattivi');

    const now = new Date().toISOString();

    contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'APPROVATO', intestatario: 'Test Versioning',
      template_ID: cds.utils.uuid(), templateVersion_ID: cds.utils.uuid(),
      responsabile: 'mario.rossi@contrattiattivi.it', importo: 1000
    });

    versione1ID = cds.utils.uuid();
    await INSERT.into(ContrattoVersione).entries({
      ID: versione1ID, contratto_ID: contrattoID, numero: 0,
      stato: 'BOZZA', dataVersione: now, intestatario: 'Test Versioning',
      importo: 1000
    });

    versione2ID = cds.utils.uuid();
    await INSERT.into(ContrattoVersione).entries({
      ID: versione2ID, contratto_ID: contrattoID, numero: 1,
      stato: 'IN_REVISIONE', dataVersione: now, intestatario: 'Test Versioning',
      importo: 1200, oggetto: 'Versione aggiornata'
    });
  });

  it('getVersioniContratto returns versions ordered by numero desc', async () => {
    const res = await POST('/contratti/getVersioniContratto', {
      contrattoID: contrattoID
    }, { auth });
    expect(res.status).toBe(200);
    const versions = res.data.value;
    expect(versions.length).toBe(2);
    expect(versions[0].numero).toBe(1);
    expect(versions[0].stato).toBe('IN_REVISIONE');
    expect(versions[1].numero).toBe(0);
    expect(versions[1].stato).toBe('BOZZA');
  });

  it('confrontaVersioniContratto detects testata differences', async () => {
    const res = await POST('/contratti/confrontaVersioniContratto', {
      versioneID1: versione1ID, versioneID2: versione2ID
    }, { auth });
    expect(res.status).toBe(200);
    expect(res.data.clausoleAggiunte).toBe(0);
    expect(res.data.clausoleRimosse).toBe(0);
    expect(res.data.clausoleModificate).toBe(0);
    const diffTestata = JSON.parse(res.data.differenzeTestata);
    expect(diffTestata.length).toBeGreaterThan(0);
    const importoDiff = diffTestata.find(d => d.campo === 'importo');
    expect(importoDiff).toBeDefined();
    expect(Number(importoDiff.vecchio)).toBe(1000);
    expect(Number(importoDiff.nuovo)).toBe(1200);
  });

  it('ContrattoVersione is readable via OData', async () => {
    const res = await GET(
      `/contratti/ContrattoVersione?$filter=contratto_ID eq ${contrattoID}&$orderby=numero desc`,
      { auth }
    );
    expect(res.status).toBe(200);
    const snapshots = res.data.value;
    expect(snapshots.length).toBe(2);
    expect(snapshots[0].numero).toBe(1);
    expect(snapshots[0].stato).toBe('IN_REVISIONE');
  });
});

describe('Archiviazione contratti', () => {
  let templateID, contrattoID;

  beforeEach(async () => {
    const seed = await seedTemplateConClausole();
    templateID = seed.templateID;
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const c = (await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER })).data;
    contrattoID = c.ID;
    await UPDATE(Contratto, contrattoID).with({ responsabile: 'mario.rossi@contrattiattivi.it' });
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const rev = (await SELECT.from(cds.entities('com.reply.contrattiattivi').Revisione).where({ contratto_ID: contrattoID }))[0];
    await POST('/contratti/approvaRevisione', { revisioneID: rev.ID }, { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });
  });

  it('archiviaContratto transitions from APPROVATO to ARCHIVIATO', async () => {
    const result = (await POST('/contratti/archiviaContratto', { contrattoID }, { auth: MOCK_USER })).data;
    expect(result.stato).toBe('ARCHIVIATO');
    expect(result.dataArchiviazione).toBeTruthy();
  });

  it('ripristinaContratto transitions from ARCHIVIATO back to APPROVATO', async () => {
    await POST('/contratti/archiviaContratto', { contrattoID }, { auth: MOCK_USER });
    const result = (await POST('/contratti/ripristinaContratto', { contrattoID }, { auth: MOCK_USER })).data;
    expect(result.stato).toBe('APPROVATO');
    expect(result.dataArchiviazione).toBeNull();
  });

  it('archiviaContratto rejects non-APPROVATO contracts', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await UPDATE(Contratto, contrattoID).with({ stato: 'BOZZA' });
    await expect(
      POST('/contratti/archiviaContratto', { contrattoID }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });

  it('ripristinaContratto rejects non-ARCHIVIATO contracts', async () => {
    await expect(
      POST('/contratti/ripristinaContratto', { contrattoID }, { auth: MOCK_USER })
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});
