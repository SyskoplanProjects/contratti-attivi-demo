const path = require('path');
const cds = require('@sap/cds');
const { Document, Packer, Paragraph } = require('docx');

process.env.ASSISTANT_ID = 'mock-e2e';

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn().mockResolvedValue('mock-e2e-thread'),
  sendMessage: jest.fn().mockResolvedValue(['Risposta mock e2e.']),
  deleteThread: jest.fn().mockResolvedValue('deleted'),
  embeddings: jest.fn().mockResolvedValue([]),
  chatJSON: jest.fn().mockResolvedValue({ clausole: [] })
}));

const { GET, POST, axios } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

const REV_USER = { username: 'revisore@contrattiattivi.it', password: 'test' };

describe('e2e: full application flow', () => {
  let templateID, contrattoID, righe;

  it('1. importTemplate', async () => {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph('Art. 1 - Oggetto'),
          new Paragraph('Testo oggetto originale.'),
          new Paragraph('Art. 2 - Durata'),
          new Paragraph('Testo durata originale.')
        ]
      }]
    });
    const buffer = await Packer.toBuffer(doc);
    const r = await axios.post('/contratti/importTemplate', buffer, {
      auth: MOCK_USER,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-filename': 'template-e2e.docx' }
    });
    expect(r.data.clausoleCreate).toBe(2);
    templateID = r.data.templateID;
  });

  it('2. creaDaTemplate — BOZZA with clausole', async () => {
    const r = await POST('/contratti/creaDaTemplate', { templateID }, { auth: MOCK_USER });
    expect(r.data.stato).toBe('BOZZA');
    contrattoID = r.data.ID;
    righe = r.data.clausole;
    if (!righe) {
      const res = await GET(`/contratti/ContrattoClausola?$filter=contratto_ID eq ${contrattoID}`, { auth: MOCK_USER });
      righe = res.data.value;
    }
    expect(righe.length).toBeGreaterThan(0);
  });

  it('3. modificaClausolaTesto — creates new version', async () => {
    const r = await POST(`/contratti/Contratto(${contrattoID})/ContrattiService.modificaClausolaTesto`,
      { contrattoClausolaID: righe[0].ID, nuovoTesto: 'Testo modificato nel contratto.' }, { auth: MOCK_USER });
    expect(r.status).toBe(200);
  });

  it('4. confrontaContrattoConTemplate — fuoriSync', async () => {
    const r = await POST('/contratti/confrontaContrattoConTemplate', { contrattoID }, { auth: MOCK_USER });
    const mod = r.data.value.find(c => c.contrattoClausolaID === righe[0].ID);
    expect(mod.fuoriSync).toBe(true);
    const inv = r.data.value.find(c => c.contrattoClausolaID === righe[1].ID);
    expect(inv.fuoriSync).toBe(false);
  });

  it('5. inviaARevisione — IN_REVISIONE', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    await cds.run(UPDATE(Contratto, contrattoID).with({ responsabile: 'mario.rossi@contrattiattivi.it' }));
    const r = await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    expect(r.data.stato).toBe('IN_REVISIONE');
  });

  it('6. aggiungiCommento — revisore commenta', async () => {
    const r = await POST('/contratti/aggiungiCommento',
      { contrattoID, contrattoClausolaID: righe[0].ID, testo: 'Clausola da rivedere.' }, { auth: REV_USER });
    expect(r.status).toBe(200);
    expect(r.data.testo).toBe('Clausola da rivedere.');
  });

  it('7. riaprireBozza — BOZZA', async () => {
    const r = await POST('/contratti/riaprireBozza', { contrattoID }, { auth: MOCK_USER });
    expect(r.data.stato).toBe('BOZZA');
  });

  it('8. re-invia e approva', async () => {
    await POST('/contratti/inviaARevisione', { contrattoID }, { auth: MOCK_USER });
    const { Revisione } = cds.entities('com.reply.contrattiattivi');
    const [rev] = await cds.run(SELECT.from(Revisione).where({ contratto_ID: contrattoID }).orderBy('dataInvio desc'));
    const r = await POST('/contratti/approvaRevisione', { revisioneID: rev.ID }, { auth: REV_USER });
    expect(r.data.stato).toBe('APPROVATO');
  });

  it('9. agente openThread + sendMessage + deleteThread', async () => {
    const open = await POST('/agente/openThread', {}, { auth: MOCK_USER });
    expect(typeof open.data.value).toBe('string');
    const threadID = open.data.value;

    const msg = await POST('/agente/sendMessage', { message: 'quante versioni?', thread_id: threadID }, { auth: MOCK_USER });
    expect(Array.isArray(msg.data.value)).toBe(true);

    const del = await POST('/agente/deleteThread', { thread_id: threadID }, { auth: MOCK_USER });
    expect(del.data.value).toBe('deleted');
  });

  describe('Comparator engine', () => {
    it('calcolaCoverage loads module without error', async () => {
      const { calcolaCoverage } = require('../srv/lib/comparator-engine');
      expect(calcolaCoverage).toBeDefined();
    });
  });

  describe('comparator flow', () => {
    it('buildTemplateClausoleMap returns map for known template', async () => {
      const cds = require('@sap/cds');
      const { buildTemplateClausoleMap } = require('../srv/lib/comparator-engine');
      const { Template } = cds.entities('com.reply.contrattiattivi');
      const template = await SELECT.one.from(Template);
      if (!template) return; // skip if no seed data
      const map = await cds.tx(tx => buildTemplateClausoleMap(tx, template.ID));
      expect(typeof map).toBe('object');
      if (Object.keys(map).length > 0) {
        const entry = map[Object.keys(map)[0]];
        expect(entry).toHaveProperty('clausolaID');
        expect(entry).toHaveProperty('versioneID');
        expect(entry).toHaveProperty('testo');
      }
    });

    it('cercaUtilizzoClausola trova il contratto nativo creato in questo flusso', async () => {
      const { cercaUtilizzoClausola } = require('../srv/lib/comparator-engine');
      const clausolaID = righe[0].clausola_ID;
      const utilizzo = await cds.tx(tx => cercaUtilizzoClausola(clausolaID, tx));
      expect(Array.isArray(utilizzo)).toBe(true);
      const trovato = utilizzo.find(u => u.contrattoID === contrattoID);
      expect(trovato).toBeDefined();
      expect(trovato.tipo).toBe('NATIVO');
      expect(typeof trovato.variante).toBe('boolean');
    });
  });
});
