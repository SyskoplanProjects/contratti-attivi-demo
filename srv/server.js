const cds = require('@sap/cds');
const express = require('express');
const multer = require('multer');
const { parseFile } = require('./import-handler');
const { eseguiImport } = require('./lib/import-commit');
const { estraiClausoleConFallback, trovaMatch, buildCandidatiPerCodice, extractTextMultiFormato } = require('./lib/ai-import');
const previewStore = require('./lib/preview-store');
const { calcolaCoverage } = require('./lib/comparator-engine');
const { estraiCampiAllegato } = require('./lib/allegato-extractor');
const { generaDocxContratto } = require('./lib/export-docx');

const upload = multer({ storage: multer.memoryStorage() });
const rawParser = express.raw({ type: '*/*', limit: '10mb' });

cds.on('bootstrap', (app) => {
  app.get('/', (req, res) => res.redirect('/cockpit/webapp/index.html'));

  app.get('/user-info', cds.middlewares.context(), ...cds.middlewares.auth(), (req, res) => {
    const user = req.user;
    if (!user) return res.set('www-authenticate', 'Basic realm="Users"').status(401).json({ error: { code: '401', message: 'Unauthorized' } });
    res.json({
      email: user.id || '',
      isUtente: !!user.is('Utente'),
      isRevisore: !!user.is('Revisore')
    });
  });

  // cds.middlewares.auth's ctx_auth stage writes into cds.context, which only
  // exists once cds.middlewares.context() has run first (these routes bypass
  // CDS's own request pipeline that normally sets this up). The dev/basic auth
  // strategy also lets unauthenticated requests through as anonymous unless
  // login is explicitly required, so role enforcement (matching this app's
  // @(requires:'InternalUser') services) has to happen explicitly here too.
  const requireAuth = (allowedRoles) => [
    cds.middlewares.context(), ...cds.middlewares.auth(), (req, res, next) => {
      if (!req.user || !allowedRoles.some(role => req.user.is(role))) {
        return res.set('www-authenticate', 'Basic realm="Users"').status(401).json({ error: { code: '401', message: 'Unauthorized' } });
      }
      next();
    }
  ];

  app.post('/contratti/importTemplate', requireAuth(['Utente']), (req, res, next) => {
    if (req.is('multipart/form-data')) {
      upload.single('file')(req, res, next);
    } else {
      rawParser(req, res, next);
    }
  }, async (req, res) => {
    const buffer = req.file ? req.file.buffer : req.body;
    const filename = req.file ? req.file.originalname : req.headers['x-filename'];
    const mimeType = req.file ? req.file.mimetype : req.headers['content-type'];
    const templateID = req.file ? req.body.templateID : req.headers['x-template-id'] || null;

    if (!buffer || !buffer.length) {
      return res.status(400).json({ code: 'NO_FILE', message: 'Nessun file ricevuto' });
    }

    let clausoleEstratte;
    try {
      clausoleEstratte = await parseFile(buffer, filename, mimeType);
    } catch (e) {
      return res.status(400).json({ code: e.code || 'PARSE_ERROR', message: e.message });
    }

    try {
      const result = await cds.tx(tx => eseguiImport(tx, templateID, filename, clausoleEstratte));
      res.status(200).json(JSON.parse(JSON.stringify(result)));
    } catch (e) {
      res.status(e.code && Number.isInteger(e.code) ? e.code : 500).json({ code: 'IMPORT_FAILED', message: e.message });
    }
  });

  app.get('/contratti/esportaContratto/:contrattoID', requireAuth(['Utente', 'Revisore']), async (req, res) => {
    const { contrattoID } = req.params;
    try {
      const { Contratto, ContrattoClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
      const contratto = await SELECT.one.from(Contratto, contrattoID);
      if (!contratto) return res.status(404).json({ code: 'NOT_FOUND', message: 'Contratto non trovato' });

      const righe = await SELECT.from(ContrattoClausola)
        .where({ contratto_ID: contrattoID, rimossa: false })
        .orderBy('ordine');

      const clausole = [];
      for (const riga of righe) {
        const clausola = await SELECT.one.from(Clausola, riga.clausola_ID);
        const versione = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
        clausole.push({ titolo: clausola.titolo, testo: versione.testo });
      }

      const buffer = await generaDocxContratto(contratto, clausole);
      const filename = `${(contratto.intestatario || 'contratto').replace(/[^\w-]+/g, '_')}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ code: 'EXPORT_FAILED', message: e.message });
    }
  });

  app.get('/contratti/scaricaAllegato/:allegatoID', requireAuth(['Utente', 'Revisore']), async (req, res) => {
    const { allegatoID } = req.params;
    try {
      const { ContrattoAllegato } = cds.entities('com.reply.contrattiattivi');
      const allegato = await SELECT.one.from(ContrattoAllegato, allegatoID);
      if (!allegato) return res.status(404).json({ code: 'NOT_FOUND', message: 'Allegato non trovato' });

      const MIME_ALLOWLIST = new Set([
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream'
      ]);
      const mimeType = MIME_ALLOWLIST.has(allegato.mimeType) ? allegato.mimeType : 'application/octet-stream';
      const safeFilename = String(allegato.filename || 'download').replace(/[\r\n"]/g, '_');

      const buffer = Buffer.from(allegato.contenuto, 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition',
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ code: 'DOWNLOAD_FAILED', message: e.message });
    }
  });

  app.post('/contratti/previewImportAI', requireAuth(['Utente']), upload.single('file'), async (req, res) => {
    const buffer = req.file ? req.file.buffer : null;
    const filename = req.file ? req.file.originalname : null;
    const mimeType = req.file ? req.file.mimetype : null;
    const templateID = req.body.templateID || null;

    if (!buffer || !buffer.length) {
      return res.status(400).json({ code: 'NO_FILE', message: 'Nessun file ricevuto' });
    }

    try {
      const clausoleEstratte = await estraiClausoleConFallback(buffer, filename, mimeType);
      const candidati = await cds.tx(tx => buildCandidatiPerCodice(tx, templateID));
      const clausoleConMatch = await trovaMatch(clausoleEstratte, candidati);
      const previewID = previewStore.put({ templateID, filename, clausole: clausoleConMatch });
      res.status(200).json({ previewID, clausole: clausoleConMatch });
    } catch (e) {
      res.status(400).json({ code: e.code || 'PREVIEW_FAILED', message: e.message });
    }
  });

  app.post('/comparator/uploadCoverage', requireAuth(['Utente']), upload.single('file'), async (req, res) => {
    const buffer = req.file ? req.file.buffer : null;
    const filename = req.file ? req.file.originalname : null;
    const mimeType = req.file ? req.file.mimetype : null;
    const templateID = req.body.templateID || null;
    if (!buffer || !buffer.length || !templateID) {
      return res.status(400).json({ code: 'MISSING_DATA', message: 'File e templateID obbligatori' });
    }
    const base64 = buffer.toString('base64');
    try {
      const result = await cds.tx(tx =>
        calcolaCoverage(buffer, filename, mimeType, templateID, tx)
      );

      // Estrai metadati del contratto (tipo CONTRATTO, con confidenza per campo) dal testo del documento,
      // simmetrico a ComparatorService.calcolaCoverage in comparator-service.js
      let metadati = [];
      let testo = '';
      try {
        testo = await extractTextMultiFormato(buffer, mimeType, filename);
        ({ metadati } = await estraiCampiAllegato('CONTRATTO', testo));
      } catch (e) {
        console.warn('[uploadCoverage] estrazione metadati fallita, uso fallback:', e.message);
      }

      const previewID = previewStore.put({ templateID, filename, clausole: result.clausole, coveragePercent: result.coveragePercent, metadati, testo });
      res.status(200).json({ previewID, coveragePercent: result.coveragePercent, clausole: result.clausole, metadati, testo });
    } catch (e) {
      res.status(500).json({ code: 'COVERAGE_FAILED', message: e.message });
    }
  });
});
