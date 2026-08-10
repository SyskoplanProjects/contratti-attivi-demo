const cds = require('@sap/cds');
const { computeDelta } = require('./lib/diff-utils');
const { eseguiImportConfermato } = require('./lib/import-commit');
const { prossimoCodiceContratto } = require('./lib/codice-contratto');
const previewStore = require('./lib/preview-store');
const { computeAndSaveEmbedding } = require('./lib/embedding-utils');
const { extractTextMultiFormato } = require('./lib/ai-import');
const { classificaAllegato } = require('./lib/allegato-classifier');
const { estraiCampiAllegato } = require('./lib/allegato-extractor');
const { salvaMetadati } = require('./lib/metadati-writer');
const { TIPOLOGIE_ALLEGATO } = require('./lib/tipologie-allegato');

function _mimeTypeDaFilename(filename) {
  return filename.endsWith('.pdf') ? 'application/pdf'
    : filename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/octet-stream';
}

module.exports = class ContrattiService extends cds.ApplicationService {
  async init() {
    const { Template, TemplateVersion, TemplateVersionClausola, Contratto, ContrattoClausola, Clausola, ClausolaVersione, Revisione, Commento, AlertModificaTemplate, AlertContrattoCoinvolto } =
      cds.entities('com.reply.contrattiattivi');

    this.before('CREATE', 'Contratto', async (req) => {
      if (!req.user) return req.reject(401);
      if (!req.user.is('Utente')) return req.reject(403, 'Solo Utente può creare contratti');
      if (!req.data.codice) req.data.codice = await prossimoCodiceContratto(cds.tx(req));
    });
    this.before('UPDATE', 'Contratto', (req) => {
      if (!req.user) return req.reject(401);
      if (!req.user.is('Utente')) return req.reject(403, 'Solo Utente può modificare contratti');
    });
    this.before('DELETE', 'Contratto', (req) => {
      if (!req.user) return req.reject(401);
      if (!req.user.is('Utente')) return req.reject(403, 'Solo Utente può eliminare contratti');
    });

    this.on('getCategorieContratto', () => {
      return Object.keys(cds.model.definitions['com.reply.contrattiattivi.CategoriaContratto'].enum);
    });

    this.on('creaDaTemplate', async (req) => {
      const { templateID } = req.data;
      const template = await SELECT.one.from(Template, templateID);
      if (!template) return req.error(404, 'Template non trovato');

      const versions = await SELECT.from(TemplateVersion).where({ template_ID: templateID }).orderBy('numero desc');
      if (!versions.length) return req.error(400, 'Il template non ha nessuna versione (importare prima un file)');
      const currentVersion = versions[0];

      const righe = await SELECT.from(TemplateVersionClausola)
        .where({ templateVersion_ID: currentVersion.ID })
        .orderBy('ordine');

      const contrattoID = cds.utils.uuid();
      await INSERT.into(Contratto).entries({
        ID: contrattoID, stato: 'BOZZA', intestatario: template.nome,
        codice: await prossimoCodiceContratto(cds.tx(req)),
        template_ID: templateID, templateVersion_ID: currentVersion.ID,
        responsabile: req.user.id
      });

      for (const riga of righe) {
        await INSERT.into(ContrattoClausola).entries({
          ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: riga.clausola_ID,
          clausolaVersione_ID: riga.clausolaVersione_ID, ordine: riga.ordine, rimossa: false
        });
      }

      await _creaSnapshotContratto(contrattoID, cds.tx(req));
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('confirmImportAI', async (req) => {
      const { previewID, clausole } = req.data;
      const preview = previewStore.get(previewID);
      if (!preview) return req.reject(410, 'Preview scaduta o inesistente, ripetere l\'analisi');

      const clausoleFinali = (clausole && clausole.length) ? clausole : preview.clausole;
      const result = await cds.tx(req).run(tx =>
        eseguiImportConfermato(tx, preview.templateID, preview.filename, clausoleFinali));

      previewStore.remove(previewID);
      return result;
    });

    this.on('creaTemplateManuale', async (req) => {
      const { nome, tipoServizio, descrizione, tipoRiferimento, clausole, testata } = req.data;
      if (!nome) return req.reject(400, 'Nome template obbligatorio');
      if (!clausole || !clausole.length) return req.reject(400, 'Almeno una clausola richiesta');
      if (!testata || !testata.intestatario) return req.reject(400, 'Intestatario obbligatorio');

      const templateID = cds.utils.uuid();
      const datiTemplate = { ID: templateID, nome, tipoServizio, descrizione };
      if (tipoRiferimento) datiTemplate.tipoRiferimento = tipoRiferimento;
      await INSERT.into(Template).entries(datiTemplate);

      const versionID = cds.utils.uuid();
      await INSERT.into(TemplateVersion).entries({
        ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
      });

      const contrattoID = cds.utils.uuid();
      await INSERT.into(Contratto).entries({
        ID: contrattoID, stato: 'BOZZA', template_ID: templateID, templateVersion_ID: versionID,
        codice: await prossimoCodiceContratto(cds.tx(req)),
        ...testata, responsabile: req.user.id
      });

      for (let i = 0; i < clausole.length; i++) {
        const { titolo, testo } = clausole[i];
        const clausolaID = cds.utils.uuid();
        await INSERT.into(Clausola).entries({
          ID: clausolaID, codice: `C${i + 1}`, titolo, template_ID: templateID
        });
        const clausolaVersioneID = cds.utils.uuid();
        await INSERT.into(ClausolaVersione).entries({
          ID: clausolaVersioneID, clausola_ID: clausolaID, numero: 0, testo,
          dataCreazione: new Date().toISOString(), modificata: false, templateVersionOrigine_ID: versionID
        });
        await INSERT.into(TemplateVersionClausola).entries({
          ID: cds.utils.uuid(), templateVersion_ID: versionID, clausola_ID: clausolaID,
          clausolaVersione_ID: clausolaVersioneID, ordine: i + 1
        });
        await INSERT.into(ContrattoClausola).entries({
          ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: clausolaID,
          clausolaVersione_ID: clausolaVersioneID, ordine: i + 1, rimossa: false
        });
      }

      await _creaSnapshotContratto(contrattoID, cds.tx(req));
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('creaClausola', async (req) => {
      const { codice, titolo, testo, clausolaBaseID } = req.data;
      if (!testo) return req.reject(400, 'Testo clausola obbligatorio');

      if (clausolaBaseID) {
        const clausolaBase = await SELECT.one.from(Clausola, clausolaBaseID);
        if (!clausolaBase) return req.reject(404, 'Clausola base non trovata');

        const numeroVersione = await _prossimoNumeroVersione(ClausolaVersione, clausolaBaseID);
        const ultimaVersione = await SELECT.one.from(ClausolaVersione)
          .where({ clausola_ID: clausolaBaseID }).orderBy('numero desc');
        const { modificata, dettaglioDelta } = computeDelta(ultimaVersione.testo, testo);

        const nuovaVersioneID = cds.utils.uuid();
        await INSERT.into(ClausolaVersione).entries({
          ID: nuovaVersioneID, clausola_ID: clausolaBaseID, numero: numeroVersione, testo,
          dataCreazione: new Date().toISOString(), modificata, dettaglioDelta
        });
        const { generaAlertModificaTemplate } = require('./lib/alert-utils');
        await generaAlertModificaTemplate(cds.tx(req), nuovaVersioneID);
        return SELECT.one.from(Clausola, clausolaBaseID);
      }

      if (!codice) return req.reject(400, 'Codice clausola obbligatorio');
      if (!titolo) return req.reject(400, 'Titolo clausola obbligatorio');

      const clausolaID = cds.utils.uuid();
      await INSERT.into(Clausola).entries({ ID: clausolaID, codice, titolo, aggiuntiva: true });
      await INSERT.into(ClausolaVersione).entries({
        ID: cds.utils.uuid(), clausola_ID: clausolaID, numero: 0, testo,
        dataCreazione: new Date().toISOString(), modificata: false
      });
      return SELECT.one.from(Clausola, clausolaID);
    });

    this.on('aggiungiClausola', async (req) => {
      const contrattoID = req.params[0] && (typeof req.params[0] === 'object' ? req.params[0].ID : req.params[0]);
      const { clausolaVersioneID } = req.data;
      if (!await _requireBozza(req, contrattoID, Contratto)) return;
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (contratto.bozzaSalvata) return req.reject(409, 'Clausole blindate: salva bozza già eseguita');

      const versione = await SELECT.one.from(ClausolaVersione, clausolaVersioneID);
      if (!versione) return req.reject(404, 'Versione clausola non trovata');

      const esistenti = await SELECT.from(ContrattoClausola).where({ contratto_ID: contrattoID }).orderBy('ordine desc');
      const ordine = esistenti.length ? esistenti[0].ordine + 1 : 1;

      await INSERT.into(ContrattoClausola).entries({
        ID: cds.utils.uuid(), contratto_ID: contrattoID, clausola_ID: versione.clausola_ID,
        clausolaVersione_ID: clausolaVersioneID, ordine, rimossa: false
      });

      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('rimuoviClausola', async (req) => {
      const contrattoID = req.params[0] && (typeof req.params[0] === 'object' ? req.params[0].ID : req.params[0]);
      const { contrattoClausolaID } = req.data;
      if (!await _requireBozza(req, contrattoID, Contratto)) return;
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (contratto.bozzaSalvata) return req.reject(409, 'Clausole blindate: salva bozza già eseguita');

      const riga = await SELECT.one.from(ContrattoClausola).where({ ID: contrattoClausolaID, contratto_ID: contrattoID });
      if (!riga) return req.reject(404, 'Riga clausola non trovata su questo contratto');

      await UPDATE(ContrattoClausola, contrattoClausolaID).with({ rimossa: true });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('modificaClausolaTesto', async (req) => {
      const contrattoID = req.params[0] && (typeof req.params[0] === 'object' ? req.params[0].ID : req.params[0]);
      const { contrattoClausolaID, nuovoTesto } = req.data;
      if (!await _requireBozza(req, contrattoID, Contratto)) return;
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (contratto.bozzaSalvata) return req.reject(409, 'Clausole blindate: salva bozza già eseguita');

      const riga = await SELECT.one.from(ContrattoClausola).where({ ID: contrattoClausolaID, contratto_ID: contrattoID });
      if (!riga) return req.reject(404, 'Riga clausola non trovata su questo contratto');

      const versioneAttuale = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
      const numeroVersione = await _prossimoNumeroVersione(ClausolaVersione, riga.clausola_ID);
      const { modificata, dettaglioDelta } = computeDelta(versioneAttuale.testo, nuovoTesto);

      const nuovaVersioneID = cds.utils.uuid();
      await INSERT.into(ClausolaVersione).entries({
        ID: nuovaVersioneID, clausola_ID: riga.clausola_ID, numero: numeroVersione,
        testo: nuovoTesto, dataCreazione: new Date().toISOString(),
        modificata, dettaglioDelta, contrattoOrigine_ID: contrattoID
      });

      await UPDATE(ContrattoClausola, contrattoClausolaID).with({ clausolaVersione_ID: nuovaVersioneID });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.before('READ', 'Clausola', (req) => {
      const orderBy = req.query.SELECT?.orderBy;
      if (orderBy) {
        const idx = orderBy.findIndex(o => o?.ref?.[0] === 'codice');
        if (idx >= 0) {
          orderBy.splice(idx, 0, { func: 'length', args: [{ ref: ['codice'] }], sort: orderBy[idx].sort || 'asc' });
        }
      }
    });

    this.after('READ', this.entities.Clausola, async (data) => {
      const rows = Array.isArray(data) ? data : (data ? [data] : []);
      if (!rows.length) return;
      const usi = await SELECT.from(ContrattoClausola)
        .where({ clausola_ID: rows.map(r => r.ID), rimossa: false })
        .columns('clausola_ID', 'contratto_ID');
      const contrattiPerClausola = new Map();
      for (const u of usi) {
        let set = contrattiPerClausola.get(u.clausola_ID);
        if (!set) { set = new Set(); contrattiPerClausola.set(u.clausola_ID, set); }
        set.add(u.contratto_ID);
      }
      for (const r of rows) {
        r.numContratti = (contrattiPerClausola.get(r.ID) || new Set()).size;
      }

      const clausolaIDs = rows.map(r => r.ID);
      const clausoleBase = await SELECT.from(Clausola).where({ ID: clausolaIDs }).columns('ID', 'template_ID');
      const templateIDByClausola = new Map(clausoleBase.map(c => [c.ID, c.template_ID]));
      const templateIDs = [...new Set(clausoleBase.map(c => c.template_ID).filter(Boolean))];
      const templates = templateIDs.length
        ? await SELECT.from(Template).where({ ID: templateIDs }).columns('ID', 'nome') : [];
      const templateByID = new Map(templates.map(t => [t.ID, t]));

      const versioni = await SELECT.from(ClausolaVersione)
        .where({ clausola_ID: clausolaIDs })
        .columns('clausola_ID', 'numero', 'contrattoOrigine_ID')
        .orderBy('numero desc');
      const contrattoIDPerClausola = new Map();
      for (const v of versioni) {
        if (!v.contrattoOrigine_ID) continue;
        if (!contrattoIDPerClausola.has(v.clausola_ID)) contrattoIDPerClausola.set(v.clausola_ID, v.contrattoOrigine_ID);
      }
      const contrattoOrigineIDs = [...new Set(contrattoIDPerClausola.values())];
      const contratti = contrattoOrigineIDs.length
        ? await SELECT.from(Contratto).where({ ID: contrattoOrigineIDs }).columns('ID', 'intestatario', 'oggetto') : [];
      const contrattoByID = new Map(contratti.map(c => [c.ID, c]));

      for (const r of rows) {
        const oTemplate = templateByID.get(templateIDByClausola.get(r.ID));
        const oContratto = contrattoByID.get(contrattoIDPerClausola.get(r.ID));
        if (oContratto) {
          r.origineTipo = 'Contratto';
          r.origineNome = oContratto.oggetto || oContratto.intestatario;
          r.origineID = oContratto.ID.substring(0, 8).toUpperCase();
        } else if (oTemplate) {
          r.origineTipo = 'Template';
          r.origineNome = oTemplate.nome;
          r.origineID = oTemplate.ID.substring(0, 8).toUpperCase();
        } else {
          r.origineTipo = null;
          r.origineNome = 'Manuale';
          r.origineID = null;
        }
        r.origineDettaglio = r.origineID ? (r.origineNome + ' - ID: ' + r.origineID) : r.origineNome;
      }
    });

    this.on('getContrattiClausola', async (req) => {
      const { clausolaID } = req.data;
      const usi = await SELECT.from(ContrattoClausola)
        .where({ clausola_ID: clausolaID, rimossa: false })
        .columns('contratto_ID', 'clausolaVersione_ID');
      if (!usi.length) return [];
      const contrattoIDs = [...new Set(usi.map(u => u.contratto_ID))];
      const versioneIDs = [...new Set(usi.map(u => u.clausolaVersione_ID))];
      const contratti = await SELECT.from(Contratto).where({ ID: contrattoIDs }).columns('ID', 'intestatario', 'stato');
      const versioni = await SELECT.from(ClausolaVersione).where({ ID: versioneIDs }).columns('ID', 'numero');
      const contrattiMap = new Map(contratti.map(c => [c.ID, c]));
      const versioniMap = new Map(versioni.map(v => [v.ID, v.numero]));
      const seen = new Set();
      const result = [];
      for (const u of usi) {
        const key = u.contratto_ID + ':' + u.clausolaVersione_ID;
        if (seen.has(key)) continue;
        seen.add(key);
        const c = contrattiMap.get(u.contratto_ID);
        if (!c) continue;
        result.push({ contrattoID: c.ID, intestatario: c.intestatario, stato: c.stato, versione: versioniMap.get(u.clausolaVersione_ID) });
      }
      return result;
    });

    this.on('getStoricoClausola', async (req) => {
      const { clausolaID } = req.data;
      const versioni = await SELECT.from(ClausolaVersione).where({ clausola_ID: clausolaID }).orderBy('numero');

      const result = [];
      for (const v of versioni) {
        const tvOrigine = v.templateVersionOrigine_ID
          ? await SELECT.one.from(TemplateVersion, v.templateVersionOrigine_ID)
          : null;
        const usi = await SELECT.from(ContrattoClausola)
          .where({ clausolaVersione_ID: v.ID, rimossa: false })
          .columns('contratto_ID');
        result.push({
          versioneID: v.ID, numero: v.numero, dataCreazione: v.dataCreazione,
          templateOrigine: tvOrigine ? `v${tvOrigine.numero}` : null,
          contrattiCorrenti: usi.map(u => u.contratto_ID),
          testo: v.testo
        });
      }
      return result;
    });

    this.on('confrontaVersioni', async (req) => {
      const { versioneID1, versioneID2 } = req.data;
      const v1 = await SELECT.one.from(ClausolaVersione, versioneID1);
      const v2 = await SELECT.one.from(ClausolaVersione, versioneID2);
      if (!v1 || !v2) return req.error(404, 'Una o entrambe le versioni non trovate');
      const { dettaglioDelta } = computeDelta(v1.testo, v2.testo);
      return { testo1: v1.testo, testo2: v2.testo, delta: dettaglioDelta || '[]' };
    });

    this.on('confrontaContrattoConTemplate', async (req) => {
      const { contrattoID } = req.data;
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (!contratto) return req.error(404, 'Contratto non trovato');

      const righeContratto = await SELECT.from(ContrattoClausola).where({ contratto_ID: contrattoID, rimossa: false });
      const righeTemplate = await SELECT.from(TemplateVersionClausola).where({ templateVersion_ID: contratto.templateVersion_ID });

      const result = [];
      for (const riga of righeContratto) {
        const rigaTemplate = righeTemplate.find(rt => rt.clausola_ID === riga.clausola_ID);
        const clausola = await SELECT.one.from(Clausola, riga.clausola_ID);
        const fuoriSync = !rigaTemplate || rigaTemplate.clausolaVersione_ID !== riga.clausolaVersione_ID;
        result.push({ contrattoClausolaID: riga.ID, clausolaCodice: clausola?.codice, fuoriSync });
      }
      return result;
    });

    this.on('copiaVersioneClausola', async (req) => {
      const { clausolaVersioneID, contrattoDestinazioneID } = req.data;
      await _requireBozza(req, contrattoDestinazioneID, Contratto);

      const versione = await SELECT.one.from(ClausolaVersione, clausolaVersioneID);
      if (!versione) return req.error(404, 'Versione clausola non trovata');

      const rigaEsistente = await SELECT.one.from(ContrattoClausola)
        .where({ contratto_ID: contrattoDestinazioneID, clausola_ID: versione.clausola_ID });

      if (rigaEsistente) {
        await UPDATE(ContrattoClausola, rigaEsistente.ID).with({ clausolaVersione_ID: clausolaVersioneID, rimossa: false });
        return SELECT.one.from(ContrattoClausola, rigaEsistente.ID);
      }

      const esistenti = await SELECT.from(ContrattoClausola).where({ contratto_ID: contrattoDestinazioneID }).orderBy('ordine desc');
      const ordine = esistenti.length ? esistenti[0].ordine + 1 : 1;
      const newID = cds.utils.uuid();
      await INSERT.into(ContrattoClausola).entries({
        ID: newID, contratto_ID: contrattoDestinazioneID, clausola_ID: versione.clausola_ID,
        clausolaVersione_ID: clausolaVersioneID, ordine, rimossa: false
      });
      return SELECT.one.from(ContrattoClausola, newID);
    });

    this.on('inviaARevisione', async (req) => {
      const { contrattoID } = req.data;
      const contratto = await _requireBozza(req, contrattoID, Contratto);
      if (!contratto) return;
      // Owner-only: inviaARevisione requires owner (per spec)
      if (!await _isOwner(req, contrattoID, Contratto)) return;

      const revisore = 'revisore@contrattiattivi.it';

      const revisioneID = cds.utils.uuid();
      await INSERT.into(Revisione).entries({
        ID: revisioneID, contratto_ID: contrattoID,
        stato: 'IN_REVISIONE', revisore,
        dataInvio: new Date().toISOString()
      });

      await UPDATE(Contratto, contrattoID).with({ stato: 'IN_REVISIONE' });
      await _creaSnapshotContratto(contrattoID, cds.tx(req));
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('aggiungiCommento', async (req) => {
      const { contrattoID, contrattoClausolaID, testo } = req.data;
      const revisione = await SELECT.one.from(Revisione)
        .where({ contratto_ID: contrattoID, stato: ['IN_REVISIONE', 'COMMENTATA'] })
        .orderBy('dataInvio desc');
      if (!revisione) return req.reject(409, 'Nessuna revisione attiva per questo contratto');

      const commentoID = cds.utils.uuid();
      await INSERT.into(Commento).entries({
        ID: commentoID, revisione_ID: revisione.ID,
        contrattoClausola_ID: contrattoClausolaID,
        testo, autore: req.user.id
      });

      const commentiEsistenti = await SELECT.from(Commento).where({ revisione_ID: revisione.ID });
      if (commentiEsistenti.length <= 1) {
        await UPDATE(Revisione, revisione.ID).with({ stato: 'COMMENTATA' });
      }

      return SELECT.one.from(Commento, commentoID);
    });

    this.on('risolviCommento', async (req) => {
      const { contrattoID, commentoID } = req.data;
      await _isOwner(req, contrattoID, Contratto);

      const commento = await SELECT.one.from(Commento, commentoID);
      if (!commento) return req.reject(404, 'Commento non trovato');

      await UPDATE(Commento, commentoID).with({ stato: 'RISOLTO' });
      return SELECT.one.from(Commento, commentoID);
    });

    this.on('riaprireBozza', async (req) => {
      const { contrattoID } = req.data;
      await _isOwner(req, contrattoID, Contratto);

      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (contratto.stato !== 'IN_REVISIONE' && contratto.stato !== 'BOZZA') {
        return req.reject(409, 'Il contratto non è in revisione');
      }

      await UPDATE(Contratto, contrattoID).with({ stato: 'BOZZA', bozzaSalvata: false });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('approvaRevisione', async (req) => {
      const { revisioneID } = req.data;
      await _isRevisore(req, revisioneID, Revisione);

      const rev = await SELECT.one.from(Revisione, revisioneID);
      if (rev.stato === 'APPROVATA' || rev.stato === 'RIFIUTATA') {
        return req.reject(409, 'Revisione già completata');
      }

      await UPDATE(Revisione, revisioneID).with({
        stato: 'APPROVATA', dataCompletamento: new Date().toISOString()
      });
      await UPDATE(Contratto, rev.contratto_ID).with({ stato: 'APPROVATO' });
      await _creaSnapshotContratto(rev.contratto_ID, cds.tx(req));
      return SELECT.one.from(Contratto, rev.contratto_ID);
    });

    this.on('rifiutaRevisione', async (req) => {
      const { revisioneID } = req.data;
      await _isRevisore(req, revisioneID, Revisione);

      const rev = await SELECT.one.from(Revisione, revisioneID);
      if (rev.stato === 'APPROVATA' || rev.stato === 'RIFIUTATA') {
        return req.reject(409, 'Revisione già completata');
      }

      await UPDATE(Revisione, revisioneID).with({
        stato: 'RIFIUTATA', dataCompletamento: new Date().toISOString()
      });
      await UPDATE(Contratto, rev.contratto_ID).with({ stato: 'BOZZA' });
      return SELECT.one.from(Contratto, rev.contratto_ID);
    });

    this.on('salvaBozza', async (req) => {
      const { contrattoID } = req.data;
      await _requireBozza(req, contrattoID, Contratto);
      await UPDATE(Contratto, contrattoID).with({ bozzaSalvata: true });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('aggiornaTestata', async (req) => {
      const { contrattoID, testata } = req.data;
      const contratto = await _requireBozza(req, contrattoID, Contratto);
      if (contratto.bozzaSalvata) return req.reject(409, 'Contratto già salvato, impossibile modificare testata');
      const update = {};
      if (testata.intestatario !== undefined) update.intestatario = testata.intestatario;
      if (testata.responsabile !== undefined) update.responsabile = testata.responsabile;
      if (testata.codiceFiscale !== undefined) update.codiceFiscale = testata.codiceFiscale;
      if (testata.dataStipula !== undefined) update.dataStipula = testata.dataStipula;
      if (testata.societaContraente !== undefined) update.societaContraente = testata.societaContraente;
      if (testata.responsabileControparte !== undefined) update.responsabileControparte = testata.responsabileControparte;
      if (testata.emailControparte !== undefined) update.emailControparte = testata.emailControparte;
      if (testata.oggetto !== undefined) update.oggetto = testata.oggetto;
      if (testata.dataDecorrenza !== undefined) update.dataDecorrenza = testata.dataDecorrenza;
      if (testata.dataScadenza !== undefined) update.dataScadenza = testata.dataScadenza;
      if (testata.categoria !== undefined) update.categoria = testata.categoria;
      if (testata.importo !== undefined) update.importo = testata.importo;
      await UPDATE(Contratto, contrattoID).with(update);
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('cancellaClausola', async (req) => {
      const { clausolaID } = req.data;
      const usi = await SELECT.from(ContrattoClausola)
        .where({ clausola_ID: clausolaID, rimossa: false });
      if (usi.length) return req.reject(409, 'Clausola in uso in ' + usi.length + ' contratto/i');
      await DELETE.from(ClausolaVersione).where({ clausola_ID: clausolaID });
      await DELETE.from(TemplateVersionClausola).where({ clausola_ID: clausolaID });
      await DELETE.from(Clausola, clausolaID);
      return true;
    });

    this.on('cancellaTemplate', async (req) => {
      const { templateID } = req.data;
      const contratti = await SELECT.from(Contratto).where({ template_ID: templateID });
      if (contratti.length) return req.reject(409, 'Template in uso in ' + contratti.length + ' contratto/i');
      const versioni = await SELECT.from(TemplateVersion).where({ template_ID: templateID });
      for (const v of versioni) {
        await DELETE.from(TemplateVersionClausola).where({ templateVersion_ID: v.ID });
      }
      const clausole = await SELECT.from(Clausola).where({ template_ID: templateID });
      for (const c of clausole) {
        await DELETE.from(ClausolaVersione).where({ clausola_ID: c.ID });
        await DELETE.from(TemplateVersionClausola).where({ clausola_ID: c.ID });
      }
      const alerts = await SELECT.from(AlertModificaTemplate).where({ template_ID: templateID }).columns('ID');
      if (alerts.length) {
        await DELETE.from(AlertContrattoCoinvolto).where({ alert_ID: alerts.map(a => a.ID) });
        await DELETE.from(AlertModificaTemplate).where({ template_ID: templateID });
      }
      await DELETE.from(Clausola).where({ template_ID: templateID });
      await DELETE.from(TemplateVersion).where({ template_ID: templateID });
      await DELETE.from(Template, templateID);
      return true;
    });

    this.on('classificaAllegatoContratto', async (req) => {
      const { filename, file } = req.data;
      if (!filename || !file) return req.reject(400, 'filename e file obbligatori');

      const buffer = Buffer.from(file, 'base64');
      const mimeType = _mimeTypeDaFilename(filename);

      let testo = '';
      try {
        testo = await extractTextMultiFormato(buffer, mimeType, filename);
      } catch (e) {
        console.warn('[classificaAllegatoContratto] estrazione testo fallita per', filename, ':', e.message);
      }

      const { tipo, confidenza, metodoRiconoscimento } = await classificaAllegato(testo);
      const { metadati, dataScadenza } = await estraiCampiAllegato(tipo, testo);
      return { tipo, confidenza, metodoRiconoscimento, testo, metadati, dataScadenza };
    });

    this.on('aggiungiAllegatoContratto', async (req) => {
      const { contrattoID, filename, file, tipo, confidenza, metodoRiconoscimento, testo, metadati } = req.data;
      if (!filename || !file || !tipo) return req.reject(400, 'filename, file e tipo obbligatori');

      if (!await _isOwner(req, contrattoID, Contratto)) return;

      // i metadati arrivano già verificati/corretti dal wizard lato client (Task 8/9): non si
      // ricalcolano più qui, a differenza del comportamento precedente — a meno che l'utente
      // abbia cambiato il tipo dopo l'estrazione (il <Select> del tipo non ricalcola il wizard):
      // in quel caso i campo-chiave inviati appartengono ancora al tipo vecchio e vanno rifatti.
      let metadatiDaSalvare = metadati;
      let dataScadenzaFinale = null;
      const tipologiaFinale = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
      const campiAttesi = new Set((tipologiaFinale && tipologiaFinale.campiChiave || []).map(c => c.campo));
      const tipoNonCorrisponde = metadatiDaSalvare && metadatiDaSalvare.length &&
        !metadatiDaSalvare.every(m => campiAttesi.has(m.campo));
      if (!metadatiDaSalvare || !metadatiDaSalvare.length || tipoNonCorrisponde) {
        ({ metadati: metadatiDaSalvare, dataScadenza: dataScadenzaFinale } = await estraiCampiAllegato(tipo, testo));
      } else {
        const campoScadenza = metadatiDaSalvare.find(m => m.campo === 'scadenzaValidita' || m.campo === 'dataScadenza');
        dataScadenzaFinale = (campoScadenza && campoScadenza.valore && /^\d{4}-\d{2}-\d{2}$/.test(campoScadenza.valore))
          ? campoScadenza.valore : null;
      }

      const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
      const allegatoID = cds.utils.uuid();
      await cds.tx(req).run(async (tx) => {
        await tx.run(INSERT.into(ContrattoAllegato).entries({
          ID: allegatoID, contratto_ID: contrattoID,
          filename, mimeType: _mimeTypeDaFilename(filename), contenuto: file,
          tipo, confidenza, metodoRiconoscimento, testo, dataScadenza: dataScadenzaFinale
        }));
        await salvaMetadati({ tx, parentType: 'ContrattoAllegato', parentID: allegatoID, metadati: metadatiDaSalvare });
      });
      return SELECT.one.from(ContrattoAllegato, allegatoID);
    });

    this.on('eliminaAllegatoContratto', async (req) => {
      const { allegatoID } = req.data;
      const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
      const allegato = await SELECT.one.from(ContrattoAllegato, allegatoID);
      if (!allegato) return req.reject(404, 'Allegato non trovato');
      if (!await _isOwner(req, allegato.contratto_ID, Contratto)) return;
      await DELETE.from(ContrattoAllegato, allegatoID);
      return true;
    });

    this.on('getVersioniContratto', async (req) => {
      const { contrattoID } = req.data;
      const { ContrattoVersione, ContrattoVersioneClausola } =
        cds.entities('com.reply.contrattiattivi');

      const versioni = await SELECT.from(ContrattoVersione)
        .where({ contratto_ID: contrattoID })
        .orderBy('numero desc');

      const result = [];
      for (const v of versioni) {
        const clausole = await SELECT.from(ContrattoVersioneClausola)
          .where({ contrattoVersione_ID: v.ID });
        const modificate = clausole.filter(c => c.rimossa).length;
        result.push({
          versioneID: v.ID,
          numero: v.numero,
          stato: v.stato,
          dataVersione: v.dataVersione,
          totaleClausole: clausole.length,
          clausoleModificate: modificate
        });
      }
      return result;
    });

    this.on('confrontaVersioniContratto', async (req) => {
      const { versioneID1, versioneID2 } = req.data;
      const { ContrattoVersione, ContrattoVersioneClausola } =
        cds.entities('com.reply.contrattiattivi');

      const v1 = await SELECT.one.from(ContrattoVersione, versioneID1);
      const v2 = await SELECT.one.from(ContrattoVersione, versioneID2);
      if (!v1 || !v2) return req.error(404, 'Versione non trovata');
      if (v1.contratto_ID !== v2.contratto_ID)
        return req.reject(400, 'Le versioni appartengono a contratti diversi');

      const campiTestata = [
        'intestatario', 'responsabile', 'importo', 'codiceFiscale',
        'dataStipula', 'societaContraente', 'responsabileControparte',
        'emailControparte', 'oggetto', 'dataDecorrenza', 'dataScadenza',
        'categoria', 'bozzaSalvata'
      ];
      const diffTestata = [];
      for (const campo of campiTestata) {
        if (String(v1[campo] ?? '') !== String(v2[campo] ?? '')) {
          diffTestata.push({ campo, vecchio: v1[campo], nuovo: v2[campo] });
        }
      }

      const c1 = await SELECT.from(ContrattoVersioneClausola)
        .where({ contrattoVersione_ID: versioneID1 });
      const c2 = await SELECT.from(ContrattoVersioneClausola)
        .where({ contrattoVersione_ID: versioneID2 });

      const map1 = new Map(c1.map(c => [c.clausolaCodice, c]));
      const map2 = new Map(c2.map(c => [c.clausolaCodice, c]));

      let aggiunte = 0, rimosse = 0, modificate = 0;
      const dettaglio = [];

      const tuttiCodici = new Set([...map1.keys(), ...map2.keys()]);
      for (const codice of tuttiCodici) {
        const riga1 = map1.get(codice);
        const riga2 = map2.get(codice);
        if (!riga1) { aggiunte++; dettaglio.push({ codice, titolo: riga2.clausolaTitolo, tipo: 'aggiunta' }); }
        else if (!riga2) { rimosse++; dettaglio.push({ codice, titolo: riga1.clausolaTitolo, tipo: 'rimossa' }); }
        else if (riga1.clausolaVersione_ID !== riga2.clausolaVersione_ID) {
          modificate++;
          dettaglio.push({ codice, titolo: riga2.clausolaTitolo, tipo: 'modificata' });
        }
      }

      dettaglio.sort((a, b) => {
        const order = { rimossa: 0, modificata: 1, aggiunta: 2 };
        return order[a.tipo] - order[b.tipo] || a.codice.localeCompare(b.codice);
      });

      return {
        differenzeTestata: JSON.stringify(diffTestata),
        clausoleAggiunte: aggiunte,
        clausoleRimosse: rimosse,
        clausoleModificate: modificate,
        clausoleDettaglio: JSON.stringify(dettaglio)
      };
    });

    this.on('archiviaContratto', async (req) => {
      const { contrattoID } = req.data;
      const contratto = await _requireApprovato(req, contrattoID, Contratto);
      if (!contratto) return;
      if (!await _isOwner(req, contrattoID, Contratto)) return;

      await UPDATE(Contratto, contrattoID).with({
        stato: 'ARCHIVIATO',
        dataArchiviazione: new Date().toISOString()
      });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('ripristinaContratto', async (req) => {
      const { contrattoID } = req.data;
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (!contratto) return req.error(404, 'Contratto non trovato');
      if (contratto.stato !== 'ARCHIVIATO') return req.reject(409, 'Solo contratti archiviati possono essere ripristinati');
      if (!await _isOwner(req, contrattoID, Contratto)) return;

      await UPDATE(Contratto, contrattoID).with({
        stato: 'APPROVATO',
        dataArchiviazione: null
      });
      return SELECT.one.from(Contratto, contrattoID);
    });

    this.on('duplicaContratto', async (req) => {
      const { contrattoID } = req.data;
      const originale = await SELECT.one.from(Contratto, contrattoID);
      if (!originale) return req.error(404, 'Contratto non trovato');

      const nuovoID = cds.utils.uuid();
      const now = new Date().toISOString();

      await INSERT.into(Contratto).entries({
        ID: nuovoID,
        codice: await prossimoCodiceContratto(cds.tx(req)),
        createdAt: now, createdBy: req.user.id,
        modifiedAt: now, modifiedBy: req.user.id,
        intestatario: originale.intestatario,
        responsabile: originale.responsabile,
        importo: originale.importo,
        codiceFiscale: originale.codiceFiscale,
        dataStipula: originale.dataStipula,
        stato: 'BOZZA',
        societaContraente: originale.societaContraente,
        responsabileControparte: null,
        emailControparte: originale.emailControparte,
        oggetto: originale.oggetto,
        dataDecorrenza: originale.dataDecorrenza,
        dataScadenza: originale.dataScadenza,
        categoria: originale.categoria,
        bozzaSalvata: false,
        template_ID: originale.template_ID,
        templateVersion_ID: originale.templateVersion_ID
      });

      const righe = await SELECT.from(ContrattoClausola)
        .where({ contratto_ID: contrattoID, rimossa: false })
        .orderBy('ordine');

      for (const riga of righe) {
        await INSERT.into(ContrattoClausola).entries({
          ID: cds.utils.uuid(),
          contratto_ID: nuovoID,
          clausola_ID: riga.clausola_ID,
          clausolaVersione_ID: riga.clausolaVersione_ID,
          ordine: riga.ordine,
          rimossa: false
        });
      }

      await _creaSnapshotContratto(nuovoID, cds.tx(req));
      return SELECT.one.from(Contratto, nuovoID);
    });

    this.after('CREATE', 'ClausolaVersione', async (results, req) => {
      const versions = Array.isArray(results) ? results : [results];
      for (const v of versions) {
        computeAndSaveEmbedding(v.ID, v.testo).catch(e =>
          console.warn('[embedding] FAIL clausolaVersione ' + v.ID + ':', e.message)
        );
      }
    });

    return super.init();
  }
};

async function _creaSnapshotContratto(contrattoID, tx) {
  const { Contratto, ContrattoClausola, Clausola, ContrattoVersione, ContrattoVersioneClausola } =
    cds.entities('com.reply.contrattiattivi');

  const contratto = await tx.run(SELECT.one.from(Contratto, contrattoID));
  if (!contratto) throw new Error('Contratto non trovato');

  const existing = await tx.run(SELECT.from(ContrattoVersione)
    .where({ contratto_ID: contrattoID })
    .orderBy('numero desc'));
  const prossimoNumero = existing.length ? existing[0].numero + 1 : 0;

  const now = new Date().toISOString();

  const versioneID = cds.utils.uuid();
  await tx.run(INSERT.into(ContrattoVersione).entries({
    ID: versioneID,
    contratto_ID: contrattoID,
    numero: prossimoNumero,
    stato: contratto.stato,
    dataVersione: now,
    intestatario: contratto.intestatario,
    responsabile: contratto.responsabile,
    importo: contratto.importo,
    codiceFiscale: contratto.codiceFiscale,
    dataStipula: contratto.dataStipula,
    societaContraente: contratto.societaContraente,
    responsabileControparte: contratto.responsabileControparte,
    emailControparte: contratto.emailControparte,
    oggetto: contratto.oggetto,
    dataDecorrenza: contratto.dataDecorrenza,
    dataScadenza: contratto.dataScadenza,
    categoria: contratto.categoria,
    bozzaSalvata: contratto.bozzaSalvata,
    createdAt: now, createdBy: contratto.responsabile,
    modifiedAt: now, modifiedBy: contratto.responsabile
  }));

  const righe = await tx.run(SELECT.from(ContrattoClausola)
    .where({ contratto_ID: contrattoID, rimossa: false })
    .orderBy('ordine'));

  for (const riga of righe) {
    const clausola = await tx.run(SELECT.one.from(Clausola, riga.clausola_ID));
    await tx.run(INSERT.into(ContrattoVersioneClausola).entries({
      ID: cds.utils.uuid(),
      contrattoVersione_ID: versioneID,
      clausolaCodice: clausola ? clausola.codice : '?',
      clausolaTitolo: clausola ? clausola.titolo : '?',
      clausolaVersione_ID: riga.clausolaVersione_ID,
      ordine: riga.ordine,
      rimossa: false
    }));
  }

  return versioneID;
}

async function _requireBozza(req, contrattoID, Contratto) {
  const contratto = await SELECT.one.from(Contratto, contrattoID);
  if (!contratto) return req.reject(404, 'Contratto non trovato');
  if (contratto.stato !== 'BOZZA') return req.reject(409, 'Contratto non modificabile nello stato corrente');
  return contratto;
}

async function _prossimoNumeroVersione(ClausolaVersione, clausolaID) {
  const rows = await SELECT.from(ClausolaVersione).where({ clausola_ID: clausolaID }).orderBy('numero desc');
  return rows.length ? rows[0].numero + 1 : 0;
}

async function _isOwner(req, contrattoID, Contratto) {
  const contratto = await SELECT.one.from(Contratto, contrattoID);
  if (!contratto) return req.reject(404, 'Contratto non trovato');
  if (contratto.responsabile !== req.user.id) return req.reject(403, 'Solo il proprietario del contratto può eseguire questa azione');
  return contratto;
}

async function _requireApprovato(req, contrattoID, Contratto) {
  const contratto = await SELECT.one.from(Contratto, contrattoID);
  if (!contratto) { req.reject(404, 'Contratto non trovato'); return null; }
  if (contratto.stato !== 'APPROVATO') { req.reject(409, 'Solo contratti approvati possono essere archiviati'); return null; }
  return contratto;
}

async function _isRevisore(req, revisioneID, Revisione) {
  const rev = await SELECT.one.from(Revisione, revisioneID);
  if (!rev) return req.reject(404, 'Revisione non trovata');
  if (rev.revisore !== req.user.id) return req.reject(403, 'Solo il revisore può eseguire questa azione');
  return rev;
}
