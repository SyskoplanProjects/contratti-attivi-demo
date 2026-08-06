const path = require('path');
const cds = require('@sap/cds');

const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: (...args) => mockChatJSON(...args),
  // stesso embedding per qualunque testo -> similarity 1.0 con qualunque profilo di riferimento,
  // il codice sceglie il primo profilo (indice 0) essendo tutte le similarity uguali.
  embeddings: jest.fn((testi) => Promise.resolve(testi.map(() => [1, 0, 0])))
}));

const { POST, GET, axios } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');
const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');
const previewStore = require('../srv/lib/preview-store');
const openai = require('../srv/modules/openai-module');
const { Document, Packer, Paragraph } = require('docx');

// Nota: questa describe DEVE restare la prima del file: popola la cache degli embedding
// di riferimento (srv/lib/allegato-classifier) con vettori one-hot, così la classifica
// via embedding può raggiungere un profilo qualsiasi (non solo l'indice 0).
describe('classificaAllegati — sottoTipo CGC end-to-end (RF2)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });
  afterEach(() => {
    openai.embeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => [1, 0, 0])));
  });

  it('mappa la sotto-tipologia CGC a categoria CONTRATTO + sottoTipo CGC quando l\'embedding matcha il profilo CGC', async () => {
    const riferimenti = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const indiceCGC = riferimenti.findIndex(t => t.key === 'CGC');
    expect(indiceCGC).toBeGreaterThanOrEqual(0);

    openai.embeddings.mockImplementation((testi) => Promise.resolve(testi.map((_, i) => {
      const v = Array(riferimenti.length).fill(0);
      if (testi.length === 1) { v[indiceCGC] = 1; return v; }
      v[i] = 1;
      return v;
    })));

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Condizioni Generali di Contratto per Servizi ICT.'
    });

    const resp = await POST('/comparator/classificaAllegati', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.documentoPrincipale.sottoTipo).toBe('CGC');
    expect(resp.data.documentoPrincipale.categoria).toBe('CONTRATTO');
    expect(resp.data.documentoPrincipale.confidenza).toBe(1);
  });
});

describe('classificaAllegati / confirmCoverage allegati', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('classifica un allegato e lo persiste su ContrattoAllegato alla conferma', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100
    });

    const doc = new Document({
      sections: [{ children: [new Paragraph('Documento Unico di Regolarità Contributiva rilasciato da INPS.')] }]
    });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const classifica = await POST('/comparator/classificaAllegati', {
      previewID,
      allegati: [{ filename: 'durc.docx', file: fileBase64 }]
    }, { auth: MOCK_USER });

    expect(classifica.status).toBe(200);
    expect(classifica.data.allegati).toHaveLength(1);
    expect(classifica.data.allegati[0].filename).toBe('durc.docx');
    expect(classifica.data.allegati[0].tipo).toBe('DURC');
    expect(classifica.data.allegati[0].metodoRiconoscimento).toBe('nomeEsplicito');

    const conferma = await POST('/comparator/confirmCoverage', {
      previewID,
      clausole: [],
      allegati: [{ filename: 'durc.docx', tipo: 'DURC' }], // correzione manuale rispetto al suggerimento
      metadati: []
    }, { auth: MOCK_USER });

    expect(conferma.status).toBe(200);

    const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const righe = await SELECT.from(ContrattoAllegato).where({ contratto_ID: conferma.data.ID });
    const { MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const metadatiAllegato = await SELECT.from(MetadatoDocumento).where({ allegato_ID: righe[0].ID });
    expect(metadatiAllegato.length).toBeGreaterThan(0);
    expect(righe).toHaveLength(1);
    expect(righe[0].filename).toBe('durc.docx');
    expect(righe[0].tipo).toBe('DURC');
    expect(righe[0].contenuto).toBe(fileBase64);
    expect(righe[0].testo.trim()).toBe('Documento Unico di Regolarità Contributiva rilasciato da INPS.');

    const viaOData = await GET(
      `/contratti/ContrattoAllegato?$filter=contratto_ID eq ${conferma.data.ID}`,
      { auth: MOCK_USER }
    );
    expect(viaOData.data.value).toHaveLength(1);
    expect(viaOData.data.value[0].filename).toBe('durc.docx');

    const download = await axios.get(`/contratti/scaricaAllegato/${righe[0].ID}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    });
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('durc.docx');
    expect(Buffer.from(download.data).toString('base64')).toBe(fileBase64);

    await expect(axios.get(`/contratti/scaricaAllegato/${righe[0].ID}`))
      .rejects.toMatchObject({ response: { status: 401 } });
  });

  it('sanitizes a malicious filename before writing response headers', async () => {
    const { Contratto, TemplateVersion, Template, ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template header-test' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({ ID: contrattoID, intestatario: 'Header Test', stato: 'BOZZA', template_ID: templateID, templateVersion_ID: versionID });

    const allegatoID = cds.utils.uuid();
    const filenameMalevolo = 'evil.docx"\r\nX-Injected: yes\r\n';
    await INSERT.into(ContrattoAllegato).entries({
      ID: allegatoID, contratto_ID: contrattoID, filename: filenameMalevolo,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contenuto: Buffer.from('x').toString('base64'), tipo: 'ALTRO'
    });

    const download = await axios.get(`/contratti/scaricaAllegato/${allegatoID}`, {
      auth: MOCK_USER, responseType: 'arraybuffer'
    });

    expect(download.status).toBe(200);
    expect(download.headers['x-injected']).toBeUndefined();
    expect(download.headers['content-disposition']).not.toMatch(/[\r\n]/);
  });
});

describe('classificaAllegati — classificazione documento principale (RF2)', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('classifica il documento principale della preview e ritorna categoria/sottoTipo/confidenza', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Condizioni Generali di Contratto per Servizi ICT.'
    });

    const resp = await POST('/comparator/classificaAllegati', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    // embeddings mock -> [1,0,0] -> similarity 1.0 col primo profilo con testoRiferimento
    // (APPENDICE_CONTRATTO, indice 0), confidenza 1.0.
    expect(resp.data.documentoPrincipale).toBeDefined();
    expect(resp.data.documentoPrincipale.categoria).toBe(TIPOLOGIE_ALLEGATO[0].key);
    expect(resp.data.documentoPrincipale.confidenza).toBe(1);
    expect(resp.data.allegati).toEqual([]);
  });

  it('mappa una sotto-tipologia a categoria CONTRATTO via categoriaMacro', () => {
    const { categoriaMacro } = require('../srv/lib/tipologie-allegato');
    expect(categoriaMacro('CGC')).toBe('CONTRATTO');
    expect(categoriaMacro('ALLEGATO_E')).toBe('CONTRATTO');
    expect(categoriaMacro('MAIL')).toBe('MAIL');
    expect(categoriaMacro('FATTURA')).toBe('FATTURA');
    expect(categoriaMacro('DURC')).toBe('DURC');
  });

  it('non fallisce se la preview non ha testo (documentoPrincipale con campi null)', async () => {
    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'no-text.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'x', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100
    });

    const resp = await POST('/comparator/classificaAllegati', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.documentoPrincipale.categoria).toBeNull();
    expect(resp.data.documentoPrincipale.sottoTipo).toBeNull();
    expect(resp.data.allegati).toEqual([]);
  });

  it('coerziona a 0 la confidenza LLM non numerica', async () => {
    const dimensione = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null).length;
    // vettore documento azzerato -> similarity 0 con ogni profilo -> fallback LLM
    openai.embeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => Array(dimensione).fill(0))));
    mockChatJSON.mockResolvedValue({ tipo: 'CGC', confidenza: 'alta' });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Documento non classificabile via embedding.'
    });

    const resp = await POST('/comparator/classificaAllegati', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.documentoPrincipale.categoria).toBe('CONTRATTO');
    expect(resp.data.documentoPrincipale.confidenza).toBe(0);
  });

  it('arrotonda a 4 decimali la confidenza LLM numerica', async () => {
    const dimensione = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null).length;
    openai.embeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => Array(dimensione).fill(0))));
    mockChatJSON.mockResolvedValue({ tipo: 'CGC', confidenza: 0.987654321 });

    const previewID = previewStore.put({
      templateID: cds.utils.uuid(),
      filename: 'contratto_test.pdf',
      clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.', stato: 'PRESENTE', similarity: 0.9 }],
      coveragePercent: 100,
      testo: 'Documento non classificabile via embedding.'
    });

    const resp = await POST('/comparator/classificaAllegati', { previewID, allegati: [] }, { auth: MOCK_USER });

    expect(resp.status).toBe(200);
    expect(resp.data.documentoPrincipale.categoria).toBe('CONTRATTO');
    expect(resp.data.documentoPrincipale.confidenza).toBe(0.9877);
  });
});

describe('calcolaCoverage / confirmCoverage — metadati contratto principale', () => {
  beforeEach(() => { mockChatJSON.mockReset(); });

  it('estrae metadati con confidenza per il documento principale e li salva su MetadatoDocumento + colonne testata', async () => {
    // mockChatJSON e' condiviso sia dalla segmentazione clausole (calcolaCoverage) sia
    // dall'estrazione campi CONTRATTO (estraiCampiAllegato): distingue in base al systemPrompt.
    mockChatJSON.mockImplementation(async (systemPrompt) => {
      if (systemPrompt && systemPrompt.includes('segmenta')) {
        return { clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.' }] };
      }
      return {
        titoloContratto: { valore: 'Contratto Cloud', confidenza: 0.9 },
        fornitore: { valore: 'Acme S.p.A.', confidenza: 0.93 },
        oggettoContratto: { valore: 'Servizi cloud', confidenza: 0.8 }
      };
    });

    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template coverage' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo clausola.',
      dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
    });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    const doc = new Document({ sections: [{ children: [new Paragraph('Testo clausola.')] }] });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const coverage = await POST('/comparator/calcolaCoverage', { templateID, file: fileBase64, filename: 'contratto.docx' }, { auth: MOCK_USER });
    expect(coverage.status).toBe(200);

    const conferma = await POST('/comparator/confirmCoverage', {
      previewID: coverage.data.previewID, clausole: coverage.data.clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });
    expect(conferma.status).toBe(200);

    const { Contratto, MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const contratto = await SELECT.one.from(Contratto, conferma.data.ID);
    expect(contratto.intestatario).toBe('Contratto Cloud');
    expect(contratto.societaContraente).toBe('Acme S.p.A.');
    expect(contratto.oggetto).toBe('Servizi cloud');

    const metadati = await SELECT.from(MetadatoDocumento).where({ contratto_ID: conferma.data.ID });
    expect(metadati.length).toBeGreaterThanOrEqual(3);
  });

  it('usa i metadati corretti a mano nel wizard (parametro metadati) al posto di quelli originali AI', async () => {
    mockChatJSON.mockImplementation(async (systemPrompt) => {
      if (systemPrompt && systemPrompt.includes('segmenta')) {
        return { clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola.' }] };
      }
      return { titoloContratto: { valore: 'Titolo AI', confidenza: 0.5 } };
    });

    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template coverage 2' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo clausola.',
      dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
    });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    const doc = new Document({ sections: [{ children: [new Paragraph('Testo clausola.')] }] });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const coverage = await POST('/comparator/calcolaCoverage', { templateID, file: fileBase64, filename: 'contratto2.docx' }, { auth: MOCK_USER });

    const conferma = await POST('/comparator/confirmCoverage', {
      previewID: coverage.data.previewID, clausole: coverage.data.clausole, allegati: [],
      metadati: [{ campo: 'titoloContratto', etichetta: 'Titolo Contratto', valore: 'Titolo corretto a mano', confidenza: 0.5, modificatoManualmente: true }]
    }, { auth: MOCK_USER });

    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const contratto = await SELECT.one.from(Contratto, conferma.data.ID);
    expect(contratto.intestatario).toBe('Titolo corretto a mano');
  });

  it('ritorna anche il testo integrale estratto dal documento', async () => {
    mockChatJSON.mockImplementation(async (systemPrompt) => {
      if (systemPrompt && systemPrompt.includes('segmenta')) {
        return { clausole: [{ numero: 1, titolo: 'Oggetto', testo: 'Testo clausola per verifica testo.' }] };
      }
      return { titoloContratto: { valore: 'Contratto Testo', confidenza: 0.9 } };
    });

    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template testo' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Testo clausola per verifica testo.',
      dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
    });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    const doc = new Document({ sections: [{ children: [new Paragraph('Testo clausola per verifica testo.')] }] });
    const fileBase64 = (await Packer.toBuffer(doc)).toString('base64');

    const coverage = await POST('/comparator/calcolaCoverage', { templateID, file: fileBase64, filename: 'contratto-testo.docx' }, { auth: MOCK_USER });

    expect(coverage.status).toBe(200);
    expect(typeof coverage.data.testo).toBe('string');
    expect(coverage.data.testo).toContain('Testo clausola per verifica testo.');
  });

  it('calcolaCoverageDaContratto: preview con testo dalle clausole → DEROGHE nello snapshot', async () => {
    mockChatJSON.mockResolvedValue({
      risultati: [
        { articolo: '21', esito: 'derogato', dettaglio: 'Subappalto libero', riferimentoComma: '21.4', segnali: '' }
      ]
    });

    const { Template, TemplateVersion, Clausola, ClausolaVersione, TemplateVersionClausola, Contratto, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'Template da contratto' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({ ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString() });
    const clausolaID = cds.utils.uuid();
    await INSERT.into(Clausola).entries({ ID: clausolaID, codice: 'C1', titolo: 'Oggetto', template_ID: templateID });
    const clausolaVersioneID = cds.utils.uuid();
    await INSERT.into(ClausolaVersione).entries({
      ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo: 'Art. 21 — Il subappalto è libero.',
      dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
    });
    await INSERT.into(TemplateVersionClausola).entries({ ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1 });

    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Contratto esistente', template_ID: templateID, templateVersion_ID: versionID
    });
    await INSERT.into(ContrattoClausola).entries({
      ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID, clausolaVersione_ID: clausolaVersioneID, ordine: 1, rimossa: false
    });

    const resp = await POST('/comparator/calcolaCoverageDaContratto', { contractID: contrattoID, templateID }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    const previewID = resp.data.previewID;

    const conferma = await POST('/comparator/confirmCoverage', {
      previewID, clausole: resp.data.clausole, allegati: [], metadati: []
    }, { auth: MOCK_USER });
    expect(conferma.status).toBe(200);

    const { EsitoVerificaContratto, Anomalia } = cds.entities('com.reply.contrattiattivi');
    const esiti = await SELECT.from(EsitoVerificaContratto).where({ contratto_ID: conferma.data.ID });
    const anomalie = await SELECT.from(Anomalia).where({ esitoVerifica_ID: esiti[0].ID });
    expect(anomalie.map(a => a.tipo)).toContain('DEROGHE');
  });
});
