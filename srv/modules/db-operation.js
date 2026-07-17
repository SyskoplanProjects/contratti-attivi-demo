const cds = require('@sap/cds');
const { computeDelta } = require('../lib/diff-utils');
const openai = require('../modules/openai-module');

async function findClausolaByCodice(codice) {
  const { Clausola } = cds.entities('com.reply.contrattiattivi');
  if (!codice) return null;
  const upper = String(codice).trim().toUpperCase();
  let clausola = await SELECT.one.from(Clausola).where({ codice: upper });
  if (!clausola) {
    clausola = await SELECT.one.from(Clausola).where({ codice: { like: upper } });
  }
  return clausola;
}

// Il codice clausola (es. "C1") NON è univoco: ogni template/contratto ha una propria riga
// Clausola con lo stesso codice ma titolo/testo/origine diversi. Determina da dove viene una
// clausola (template di provenienza, oppure contratto se creata ad-hoc) per poterla mostrare
// come criterio di disambiguazione quando più righe condividono lo stesso codice.
async function _origineClausola(clausola) {
  const { Template, ClausolaVersione, Contratto } = cds.entities('com.reply.contrattiattivi');
  if (clausola.template_ID) {
    const template = await SELECT.one.from(Template, clausola.template_ID).columns('nome');
    if (template) return { tipo: 'Template', nome: template.nome };
  }
  const versione = await SELECT.one.from(ClausolaVersione)
    .where({ clausola_ID: clausola.ID }).orderBy('numero').columns('contrattoOrigine_ID');
  if (versione && versione.contrattoOrigine_ID) {
    const contratto = await SELECT.one.from(Contratto, versione.contrattoOrigine_ID).columns('oggetto', 'intestatario');
    if (contratto) return { tipo: 'Contratto', nome: contratto.oggetto || contratto.intestatario };
  }
  return { tipo: null, nome: 'Manuale' };
}

// Risolve una clausola per codice o per ID esplicito (completo o breve a 8 caratteri, come
// _resolveContratto). Se il codice è ambiguo (più righe Clausola con lo stesso codice, es. "C1"
// definito in template diversi) ritorna { ambiguo: true, candidati } invece di sceglierne una a
// caso: il chiamante (l'assistente AI) deve mostrare i candidati e chiedere all'utente di
// specificare l'ID Clausola o l'Oggetto Contratto per disambiguare.
async function _risolviClausola(codice, clausolaID) {
  const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  if (clausolaID) {
    const s = String(clausolaID).trim();
    let c = await SELECT.one.from(Clausola).where({ ID: s });
    if (!c && /^[0-9a-fA-F]{4,8}$/.test(s)) {
      c = await SELECT.one.from(Clausola).where({ ID: { like: s.toLowerCase() + '%' } });
    }
    // Il portale mostra sempre l'ID di ClausolaVersione (non di Clausola) come "ID clausola":
    // se la ricerca su Clausola.ID fallisce, prova a risolvere l'ID come ClausolaVersione.ID.
    if (!c) {
      let v = await SELECT.one.from(ClausolaVersione).where({ ID: s });
      if (!v && /^[0-9a-fA-F]{4,8}$/.test(s)) {
        v = await SELECT.one.from(ClausolaVersione).where({ ID: { like: s.toLowerCase() + '%' } });
      }
      if (v) c = await SELECT.one.from(Clausola).where({ ID: v.clausola_ID });
    }
    return c || { errore: `Clausola con ID "${clausolaID}" non trovata.` };
  }
  if (!codice) return null;
  const upper = String(codice).trim().toUpperCase();
  let candidati = await SELECT.from(Clausola).where({ codice: upper });
  if (!candidati.length) candidati = await SELECT.from(Clausola).where({ codice: { like: upper } });
  if (!candidati.length) return null;
  if (candidati.length === 1) return candidati[0];

  const dettagli = [];
  for (const c of candidati) {
    const origine = await _origineClausola(c);
    dettagli.push({ clausolaID: c.ID.substring(0, 8).toUpperCase(), titolo: c.titolo, oggettoContratto: origine.nome });
  }
  return {
    ambiguo: true,
    messaggio: `Esistono ${candidati.length} clausole con codice "${upper}" (titoli/contesti diversi). Chiedi all'utente di specificare l'ID Clausola o l'Oggetto Contratto tra i candidati, poi richiama il tool passando clausolaID.`,
    candidati: dettagli
  };
}

// Risolve un riferimento a contratto scritto dall'utente (ID completo UUID, ID breve a 8
// caratteri come mostrato nell'interfaccia — badge "shortID" — o nome intestatario parziale)
// nella riga Contratto corrispondente. Ritorna null se non trovato con nessun criterio.
async function _resolveContratto(rif) {
  const { Contratto } = cds.entities('com.reply.contrattiattivi');
  if (!rif) return null;
  const s = String(rif).trim();
  let contratto = await SELECT.one.from(Contratto).where({ ID: s });
  if (contratto) return contratto;
  if (/^[0-9a-fA-F]{4,8}$/.test(s)) {
    contratto = await SELECT.one.from(Contratto).where({ ID: { like: s.toLowerCase() + '%' } });
    if (contratto) return contratto;
  }
  contratto = await SELECT.one.from(Contratto).where({ intestatario: { like: `%${s}%` } });
  return contratto;
}

async function getVersioniContratto(contrattoRif) {
  const contratto = await _resolveContratto(contrattoRif);
  if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoRif };

  const { ContrattoVersione, ContrattoVersioneClausola } = cds.entities('com.reply.contrattiattivi');
  const versioni = await SELECT.from(ContrattoVersione)
    .where({ contratto_ID: contratto.ID })
    .orderBy('numero desc');

  const risultato = [];
  for (const v of versioni) {
    const clausole = await SELECT.from(ContrattoVersioneClausola).where({ contrattoVersione_ID: v.ID });
    risultato.push({
      versioneID: v.ID, numero: v.numero, stato: v.stato, dataVersione: v.dataVersione,
      totaleClausole: clausole.length, clausoleModificate: clausole.filter(c => c.rimossa).length
    });
  }

  return { contrattoID: contratto.ID, intestatario: contratto.intestatario, numeroVersioni: risultato.length, versioni: risultato };
}

// Info generali del contratto (intestatario, oggetto, stato, categoria, importo, date). Il campo
// "oggetto" qui è la colonna propria del Contratto (riassunto libero), DA NON CONFONDERE con la
// clausola titolata "Oggetto del Contratto" (codice C1): per domande generiche tipo "di cosa parla
// il contratto X" va usato questo tool, non una ricerca di clausola per codice.
async function getInfoContratto(contrattoRif) {
  const contratto = await _resolveContratto(contrattoRif);
  if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoRif };

  return {
    contrattoID: contratto.ID.substring(0, 8).toUpperCase(),
    intestatario: contratto.intestatario,
    oggetto: contratto.oggetto,
    stato: contratto.stato,
    categoria: contratto.categoria,
    responsabile: contratto.responsabile,
    societaContraente: contratto.societaContraente,
    importo: contratto.importo,
    dataStipula: contratto.dataStipula,
    dataDecorrenza: contratto.dataDecorrenza,
    dataScadenza: contratto.dataScadenza
  };
}

// Elenco completo delle clausole ATTUALMENTE presenti in un contratto specifico (codice, titolo,
// numero versione, testo), scoped by contrattoID via ContrattoClausola — nessuna ambiguità
// possibile. Usato per "riesci a capirlo dalle clausole", "cosa contiene il contratto X" quando
// non c'è un blocco [CONTESTO CONTRATTO] nel messaggio (contratto diverso da quello aperto in UI).
async function getClausoleContratto(contrattoRif) {
  const { ContrattoClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const contratto = await _resolveContratto(contrattoRif);
  if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoRif };

  const righe = await SELECT.from(ContrattoClausola).where({ contratto_ID: contratto.ID, rimossa: false }).orderBy('ordine');
  const clausole = [];
  for (const riga of righe) {
    const clausola = await SELECT.one.from(Clausola, riga.clausola_ID);
    const versione = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
    if (!clausola || !versione) continue;
    clausole.push({
      clausolaID: clausola.ID.substring(0, 8).toUpperCase(),
      codice: clausola.codice,
      titolo: clausola.titolo,
      numero: versione.numero,
      testo: versione.testo
    });
  }
  return { contrattoID: contratto.ID.substring(0, 8).toUpperCase(), intestatario: contratto.intestatario, clausole };
}

// Risolve una clausola per codice DENTRO un contratto specifico: passando per ContrattoClausola
// non c'è mai ambiguità (il codice può ripetersi nel database globale, ma non due volte nello
// stesso contratto), quindi non serve mai il flusso {ambiguo:true, candidati:[...]}.
async function getClausolaContratto(contrattoRif, codice) {
  const { ContrattoClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const contratto = await _resolveContratto(contrattoRif);
  if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoRif };

  const upper = String(codice).trim().toUpperCase();
  const righe = await SELECT.from(ContrattoClausola).where({ contratto_ID: contratto.ID, rimossa: false });
  for (const riga of righe) {
    const clausola = await SELECT.one.from(Clausola).where({ ID: riga.clausola_ID, codice: upper });
    if (!clausola) continue;
    const versione = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
    return {
      contrattoID: contratto.ID.substring(0, 8).toUpperCase(),
      intestatario: contratto.intestatario,
      clausolaID: clausola.ID.substring(0, 8).toUpperCase(),
      codice: clausola.codice,
      titolo: clausola.titolo,
      numero: versione ? versione.numero : null,
      testo: versione ? versione.testo : null
    };
  }
  return { errore: `Nessuna clausola con codice "${upper}" trovata nel contratto ${contratto.ID.substring(0, 8).toUpperCase()}.` };
}

async function getVersioniClausola(codice, clausolaID) {
  const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const clausola = await _risolviClausola(codice, clausolaID);
  if (!clausola) return [];
  if (clausola.ambiguo || clausola.errore) return clausola;

  const versioni = await SELECT.from(ClausolaVersione)
    .where({ clausola_ID: clausola.ID })
    .orderBy('numero');

  return versioni.map(v => ({
    numero: v.numero,
    testo: v.testo,
    dataCreazione: v.dataCreazione,
    modificata: v.modificata
  }));
}

async function getContrattiClausola(codice, clausolaID) {
  const { ContrattoClausola, Contratto } = cds.entities('com.reply.contrattiattivi');
  const clausola = await _risolviClausola(codice, clausolaID);
  if (!clausola) return [];
  if (clausola.ambiguo || clausola.errore) return clausola;

  const usi = await SELECT.from(ContrattoClausola)
    .where({ clausola_ID: clausola.ID, rimossa: false })
    .columns('contratto_ID');
  const contrattoIDs = [...new Set(usi.map(u => u.contratto_ID))];
  if (!contrattoIDs.length) return [];

  const contratti = await SELECT.from(Contratto).where({ ID: contrattoIDs }).columns('ID', 'intestatario', 'stato');
  // contrattoID esposto come shortID (8 char, come mostrato a frontend), non UUID completo:
  // così la risposta dell'assistente combacia col badge ID visto dall'utente nell'interfaccia.
  return contratti.map(c => ({ contrattoID: c.ID.substring(0, 8).toUpperCase(), intestatario: c.intestatario, stato: c.stato }));
}

async function getContrattiClausolaModificata(codice) {
  const { ContrattoClausola, Contratto } = cds.entities('com.reply.contrattiattivi');
  const clausola = await findClausolaByCodice(codice);
  if (!clausola) return [];

  const righe = await SELECT.from(ContrattoClausola)
    .where({ clausola_ID: clausola.ID });

  const result = [];
  for (const riga of righe) {
    const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
    const versione = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
    if (versione && versione.contrattoOrigine_ID) {
      const contratto = await SELECT.one.from(Contratto, riga.contratto_ID);
      result.push({
        contrattoID: contratto.ID,
        intestatario: contratto.intestatario,
        dataModifica: versione.dataCreazione
      });
    }
  }
  return result;
}

async function getContrattiConCommentiAperti() {
  const { Commento, ContrattoClausola, Contratto } = cds.entities('com.reply.contrattiattivi');
  const commentiAperti = await SELECT.from(Commento).where({ stato: 'APERTO' });

  const conteggi = {};
  for (const commento of commentiAperti) {
    const riga = await SELECT.one.from(ContrattoClausola, commento.contrattoClausola_ID);
    if (!riga) continue;
    conteggi[riga.contratto_ID] = (conteggi[riga.contratto_ID] || 0) + 1;
  }

  const result = [];
  for (const contrattoID of Object.keys(conteggi)) {
    const contratto = await SELECT.one.from(Contratto, contrattoID);
    if (contratto) {
      result.push({ contrattoID, intestatario: contratto.intestatario, commentiAperti: conteggi[contrattoID] });
    }
  }
  return result;
}

async function getInfoApprovazioneContratto(intestatario) {
  const { Contratto, Revisione } = cds.entities('com.reply.contrattiattivi');
  const contratto = await SELECT.one.from(Contratto).where({ intestatario: { like: `%${intestatario}%` } });
  if (!contratto) return null;

  const revisione = await SELECT.one.from(Revisione)
    .where({ contratto_ID: contratto.ID, stato: 'APPROVATA' })
    .orderBy('dataCompletamento desc');
  if (!revisione) return null;

  return {
    contrattoID: contratto.ID,
    intestatario: contratto.intestatario,
    revisore: revisione.revisore,
    dataCompletamento: revisione.dataCompletamento
  };
}

async function getStatoContratto(intestatario) {
  const { Contratto } = cds.entities('com.reply.contrattiattivi');
  const contratti = await SELECT.from(Contratto).where({ intestatario: { like: `%${intestatario}%` } });
  return contratti.map(c => ({
    contrattoID: c.ID,
    intestatario: c.intestatario,
    stato: c.stato,
    dataStipula: c.dataStipula
  }));
}

async function getContrattiByStato(stato) {
  const { Contratto } = cds.entities('com.reply.contrattiattivi');
  const validi = ['BOZZA', 'IN_REVISIONE', 'APPROVATO', 'FIRMATO', 'ARCHIVIATO'];
  if (!validi.includes(stato)) throw new Error(`Stato non valido: ${stato}. Validi: ${validi.join(', ')}`);
  const contratti = await SELECT.from(Contratto).where({ stato });
  return contratti.map(c => ({
    contrattoID: c.ID,
    intestatario: c.intestatario,
    stato: c.stato,
    dataStipula: c.dataStipula
  }));
}

async function analizzaCoperturaContratto(contractID) {
  const { Contratto, ContrattoClausola, TemplateVersionClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');

  // Risolve anche ID brevi a 8 caratteri (come dichiarato all'assistente nel prompt): una
  // SELECT keyed diretta con contractID non normalizzato accetterebbe solo l'UUID completo.
  const contratto = await _resolveContratto(contractID);
  if (!contratto) throw new Error('Contratto non trovato');

  const templateVersions = await SELECT.from('com.reply.contrattiattivi.TemplateVersion')
    .where({ template_ID: contratto.template_ID })
    .orderBy('numero desc');
  if (!templateVersions.length) throw new Error('Template senza versioni');
  const templateVersionID = templateVersions[0].ID;

  const righeTemplate = await SELECT.from(TemplateVersionClausola)
    .where({ templateVersion_ID: templateVersionID })
    .orderBy('ordine');
  const templateMap = {};
  for (const r of righeTemplate) {
    const c = await SELECT.one.from(Clausola, r.clausola_ID);
    const v = await SELECT.one.from(ClausolaVersione, r.clausolaVersione_ID);
    if (c && v) templateMap[c.codice] = { clausolaID: c.ID, versioneID: v.ID, testo: v.testo, titolo: c.titolo, versione: v.numero };
  }
  const templateEntries = Object.entries(templateMap);
  if (!templateEntries.length) throw new Error('Template senza clausole');

  const righeContratto = await SELECT.from(ContrattoClausola)
    .where({ contratto_ID: contratto.ID, rimossa: false })
    .orderBy('ordine');
  const clausoleContratto = [];
  for (const riga of righeContratto) {
    const cv = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
    if (cv) {
      const c = await SELECT.one.from(Clausola, riga.clausola_ID);
      clausoleContratto.push({ codice: c ? c.codice : null, titolo: c ? c.titolo : '', testo: cv.testo });
    }
  }
  if (!clausoleContratto.length) throw new Error('Contratto senza clausole');

  const { cosineSimilarity } = require('../lib/ai-import');
  const openai = require('./openai-module');
  const testiDaEmbeddare = [
    ...clausoleContratto.map(c => c.testo),
    ...templateEntries.map(([, t]) => t.testo)
  ];
  const vettori = await openai.embeddings(testiDaEmbeddare);

  const SOGLIA_MATCH = 0.92;
  const SOGLIA_VARIANTE = 0.75;
  const embClausole = vettori.slice(0, clausoleContratto.length);
  const embTemplate = {};
  templateEntries.forEach(([codice], i) => { embTemplate[codice] = vettori[clausoleContratto.length + i]; });

  const matchedTemplateCodici = new Set();
  const results = clausoleContratto.map((c, i) => {
    let bestSim = 0, bestMatch = null, bestCodice = null;
    templateEntries.forEach(([codice, t]) => {
      const sim = cosineSimilarity(embClausole[i], embTemplate[codice]);
      if (sim > bestSim) { bestSim = sim; bestMatch = t; bestCodice = codice; }
    });
    bestSim = Math.round(bestSim * 10000) / 10000;
    if (bestSim >= SOGLIA_MATCH) {
      matchedTemplateCodici.add(bestCodice);
      return { codiceContratto: c.codice, codiceTemplate: bestCodice, titolo: c.titolo, testo: c.testo.substring(0, 300), templateTesto: bestMatch.testo.substring(0, 300), stato: 'MATCH_TEMPLATE', similarity: bestSim };
    }
    if (bestSim >= SOGLIA_VARIANTE) {
      matchedTemplateCodici.add(bestCodice);
      return { codiceContratto: c.codice, codiceTemplate: bestCodice, titolo: c.titolo, testo: c.testo.substring(0, 300), templateTesto: bestMatch.testo.substring(0, 300), stato: 'VARIANTE', similarity: bestSim };
    }
    return { codiceContratto: c.codice, codiceTemplate: bestCodice, titolo: c.titolo, testo: c.testo.substring(0, 300), templateTesto: bestMatch ? bestMatch.testo.substring(0, 300) : '', stato: 'NUOVA', similarity: bestSim };
  });

  templateEntries.forEach(([codice, t]) => {
    if (!matchedTemplateCodici.has(codice)) {
      results.push({ codiceContratto: null, codiceTemplate: codice, titolo: t.titolo, testo: '', templateTesto: t.testo.substring(0, 300), stato: 'NON_PRESENTE', similarity: 0 });
    }
  });

  const coverage = templateEntries.length > 0
    ? Math.round((matchedTemplateCodici.size / templateEntries.length) * 10000) / 100
    : 0;

  return { contrattoID: contratto.ID.substring(0, 8).toUpperCase(), intestatario: contratto.intestatario, clausole: results, coveragePercent: coverage };
}

async function getRisultatiCopertura(previewID) {
  const previewStore = require('../lib/preview-store');
  const data = previewStore.get(previewID);
  if (!data) throw new Error('Preview non trovata o scaduta');
  return data;
}

// Stessa logica di confronto usata dall'action confrontaContrattoConTemplate (srv/contratti-service.js),
// applicata a tutti i contratti per permettere all'agente di individuare in blocco quelli con
// clausole non allineate al template di provenienza.
async function getContrattiFuoriSyncConTemplate() {
  const { Contratto, ContrattoClausola, TemplateVersionClausola } = cds.entities('com.reply.contrattiattivi');
  const contratti = await SELECT.from(Contratto).where({ stato: { in: ['BOZZA', 'IN_REVISIONE'] } });

  const result = [];
  for (const contratto of contratti) {
    const righeContratto = await SELECT.from(ContrattoClausola).where({ contratto_ID: contratto.ID, rimossa: false });
    const righeTemplate = await SELECT.from(TemplateVersionClausola).where({ templateVersion_ID: contratto.templateVersion_ID });

    const clausoleFuoriSync = righeContratto.filter(riga => {
      const rigaTemplate = righeTemplate.find(rt => rt.clausola_ID === riga.clausola_ID);
      return !rigaTemplate || rigaTemplate.clausolaVersione_ID !== riga.clausolaVersione_ID;
    });

    if (clausoleFuoriSync.length) {
      result.push({ contrattoID: contratto.ID, intestatario: contratto.intestatario, clausoleFuoriSync: clausoleFuoriSync.length });
    }
  }
  return result;
}

// Per un contratto, trova le clausole per cui ESISTE una versione più recente
// già adottata in un ALTRO contratto (stessa clausola base, numero versione
// maggiore) rispetto a quella attualmente usata da questo contratto. Diverso
// da getContrattiFuoriSyncConTemplate: quello confronta contro il template
// "ufficiale", questo confronta contro i "pari" — altri contratti che hanno
// già recepito una modifica (via modificaClausolaTesto) non ancora arrivata
// al template.
async function getClausolePiuAggiornateAltrove(contrattoRif) {
  const { Contratto, ContrattoClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const contratto = await _resolveContratto(contrattoRif);
  if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoRif };
  const contrattoID = contratto.ID;

  const righeContratto = await SELECT.from(ContrattoClausola).where({ contratto_ID: contrattoID, rimossa: false });

  const risultati = [];
  for (const riga of righeContratto) {
    const versioneAttuale = await SELECT.one.from(ClausolaVersione, riga.clausolaVersione_ID);
    const clausola = await SELECT.one.from(Clausola, riga.clausola_ID);
    if (!versioneAttuale || !clausola) continue;

    const altreRighe = await SELECT.from(ContrattoClausola)
      .where({ clausola_ID: riga.clausola_ID, rimossa: false, contratto_ID: { '!=': contrattoID } });

    let migliore = null;
    for (const altra of altreRighe) {
      const altraVersione = await SELECT.one.from(ClausolaVersione, altra.clausolaVersione_ID);
      if (altraVersione && altraVersione.numero > versioneAttuale.numero) {
        if (!migliore || altraVersione.numero > migliore.versione.numero) {
          migliore = { versione: altraVersione, contrattoID: altra.contratto_ID };
        }
      }
    }

    if (migliore) {
      const altroContratto = await SELECT.one.from(Contratto, migliore.contrattoID);
      risultati.push({
        codice: clausola.codice,
        titolo: clausola.titolo,
        versioneAttualeID: versioneAttuale.ID.substring(0, 8).toUpperCase(),
        versioneAttuale: versioneAttuale.numero,
        testoAttuale: versioneAttuale.testo,
        versionePiuRecenteDisponibileID: migliore.versione.ID.substring(0, 8).toUpperCase(),
        versionePiuRecenteDisponibile: migliore.versione.numero,
        testoPiuRecente: migliore.versione.testo,
        contrattoConVersionePiuRecenteID: migliore.contrattoID.substring(0, 8).toUpperCase(),
        contrattoConVersionePiuRecente: altroContratto ? altroContratto.intestatario : null
      });
    }
  }

  return risultati;
}

async function confrontaVersioniClausola(codice, numero1, numero2, clausolaID) {
  const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const clausola = await _risolviClausola(codice, clausolaID);
  if (!clausola) return { errore: `Nessuna clausola con codice ${codice}` };
  if (clausola.ambiguo || clausola.errore) return clausola;

  const v1 = await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola.ID, numero: numero1 });
  const v2 = await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola.ID, numero: numero2 });
  if (!v1 || !v2) return { errore: 'Una o entrambe le versioni richieste non esistono per questa clausola' };

  const { modificata, dettaglioDelta } = computeDelta(v1.testo, v2.testo);
  const differenze = dettaglioDelta
    ? JSON.parse(dettaglioDelta).filter(p => p.added || p.removed).map(p => ({ tipo: p.added ? 'aggiunto' : 'rimosso', testo: p.value }))
    : [];

  return { codice: clausola.codice, numero1, numero2, testo1: v1.testo, testo2: v2.testo, modificata, differenze };
}

async function confrontaClausole(codice1, codice2, numero1, numero2, clausolaID1, clausolaID2) {
  const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');

  const clausola1 = await _risolviClausola(codice1, clausolaID1);
  if (!clausola1) return { errore: `Nessuna clausola con codice ${codice1}` };
  if (clausola1.ambiguo || clausola1.errore) return clausola1;
  const clausola2 = await _risolviClausola(codice2, clausolaID2);
  if (!clausola2) return { errore: `Nessuna clausola con codice ${codice2}` };
  if (clausola2.ambiguo || clausola2.errore) return clausola2;

  const v1 = Number.isInteger(numero1)
    ? await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola1.ID, numero: numero1 })
    : await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola1.ID }).orderBy('numero desc');
  if (!v1) return { errore: `Versione richiesta non trovata per la clausola ${codice1}` };

  const v2 = Number.isInteger(numero2)
    ? await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola2.ID, numero: numero2 })
    : await SELECT.one.from(ClausolaVersione).where({ clausola_ID: clausola2.ID }).orderBy('numero desc');
  if (!v2) return { errore: `Versione richiesta non trovata per la clausola ${codice2}` };

  const { modificata, dettaglioDelta } = computeDelta(v1.testo, v2.testo);
  const differenze = dettaglioDelta
    ? JSON.parse(dettaglioDelta).filter(p => p.added || p.removed).map(p => ({ tipo: p.added ? 'aggiunto' : 'rimosso', testo: p.value }))
    : [];

  return {
    codice1: clausola1.codice, codice2: clausola2.codice, numero1: v1.numero, numero2: v2.numero,
    testo1: v1.testo, testo2: v2.testo, modificata, differenze
  };
}

async function cercaClausole(testoCercato) {
  const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  if (!testoCercato || testoCercato.trim().length === 0) return [];

  const escaped = testoCercato.replace(/'/g, "''").replace(/[%_]/g, '\\$&');

  const clausoleCodiceTitolo = await SELECT.from(Clausola)
    .where(`codice like '%${escaped}%' or titolo like '%${escaped}%'`);

  const clausoleTesto = await SELECT.from(ClausolaVersione)
    .where(`testo like '%${escaped}%'`)
    .columns('clausola_ID');

  const clausolaIDs = new Set(clausoleCodiceTitolo.map(c => c.ID));
  for (const v of clausoleTesto) clausolaIDs.add(v.clausola_ID);

  if (!clausolaIDs.size) return [];

  const clausole = [...clausoleCodiceTitolo];
  const existingIDs = new Set(clausoleCodiceTitolo.map(c => c.ID));
  const extraIDs = [...clausolaIDs].filter(id => !existingIDs.has(id));
  if (extraIDs.length) {
    const extra = await SELECT.from(Clausola).where({ ID: extraIDs });
    clausole.push(...extra);
  }

  const result = [];
  for (const c of clausole) {
    const ultimaVersione = await SELECT.one.from(ClausolaVersione)
      .where({ clausola_ID: c.ID })
      .orderBy('numero desc');
    result.push({
      codice: c.codice,
      titolo: c.titolo,
      snippet: ultimaVersione ? ultimaVersione.testo.substring(0, 200) : ''
    });
  }
  return result;
}

async function getClausolaRecente(codice, clausolaID) {
  const { ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const clausola = await _risolviClausola(codice, clausolaID);
  if (!clausola) return null;
  if (clausola.ambiguo || clausola.errore) return clausola;

  const ultimaVersione = await SELECT.one.from(ClausolaVersione)
    .where({ clausola_ID: clausola.ID })
    .orderBy('numero desc');

  return {
    codice: clausola.codice,
    titolo: clausola.titolo,
    numeroVersione: ultimaVersione ? ultimaVersione.numero : null,
    testo: ultimaVersione ? ultimaVersione.testo : null
  };
}

async function listClausole() {
  const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  const clausole = await SELECT.from(Clausola).orderBy('codice');
  if (!clausole.length) return { totale: 0, clausole: [] };

  const versaCounts = new Map();
  const gruppi = await SELECT.from(ClausolaVersione)
    .columns('clausola_ID', 'count(numero) as cnt')
    .groupBy('clausola_ID');
  for (const g of gruppi) versaCounts.set(g.clausola_ID, g.cnt);

  return {
    totale: clausole.length,
    clausole: clausole.map(c => ({
      codice: c.codice,
      titolo: c.titolo,
      versioni: versaCounts.get(c.ID) || 0
    }))
  };
}

async function getClausoleUtilizzo() {
  const { Clausola, ContrattoClausola } = cds.entities('com.reply.contrattiattivi');
  const clausole = await SELECT.from(Clausola).orderBy('codice');
  if (!clausole.length) return [];

  const usi = await SELECT.from(ContrattoClausola)
    .where({ rimossa: false })
    .columns('clausola_ID');
  const countPerClausola = new Map();
  for (const u of usi) {
    countPerClausola.set(u.clausola_ID, (countPerClausola.get(u.clausola_ID) || 0) + 1);
  }

  return clausole.map(c => ({
    codice: c.codice,
    titolo: c.titolo,
    numContratti: countPerClausola.get(c.ID) || 0,
    utilizzata: (countPerClausola.get(c.ID) || 0) > 0
  }));
}

const ENTITY_WHITELIST = [
  'Clausola', 'ClausolaVersione', 'Template', 'TemplateVersion', 'TemplateVersionClausola',
  'Contratto', 'ContrattoClausola', 'ContrattoImportato', 'ClausolaImportata',
  'Revisione', 'Commento', 'ContrattoVersione', 'ContrattoVersioneClausola',
  'AlertModificaTemplate', 'AlertContrattoCoinvolto'
];

async function eseguiQueryDB(entity, select, where, orderBy, limit) {
  if (!entity) return { error: 'entity richiesto. Valori: ' + ENTITY_WHITELIST.join(', ') };
  if (!ENTITY_WHITELIST.includes(entity)) return { error: `Entità sconosciuta: ${entity}. Valide: ${ENTITY_WHITELIST.join(', ')}` };

  const ent = cds.entities('com.reply.contrattiattivi')[entity];
  if (!ent) return { error: `Entità ${entity} non trovata nel modello` };

  let q = SELECT.from(ent);

  if (select && Array.isArray(select) && select.length) {
    q = q.columns(...select);
  }

  if (where && Array.isArray(where)) {
    for (const cond of where) {
      const { field, op, value } = cond;
      if (!field || !op) continue;
      switch (op.toLowerCase()) {
        case 'eq': q = q.where(field, '=', value); break;
        case 'ne': q = q.where(field, '!=', value); break;
        case 'gt': q = q.where(field, '>', value); break;
        case 'ge': q = q.where(field, '>=', value); break;
        case 'lt': q = q.where(field, '<', value); break;
        case 'le': q = q.where(field, '<=', value); break;
        case 'like':
        case 'contains': q = q.where(`${field} like`, `%${value}%`); break;
      }
    }
  }

  if (orderBy) q = q.orderBy(orderBy);
  if (limit && Number.isInteger(limit)) q = q.limit(limit);

  const rows = await q;
  return { entity, totale: rows.length, rows };
}

async function cercaClausoleSemantiche(testo, soglia = 0.75) {
  const { Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');
  if (!testo || testo.trim().length === 0) return [];

  soglia = Math.max(0, Math.min(1, soglia));

  const embeddings = await openai.embeddings([testo]);
  if (!embeddings || embeddings.length === 0) return [];
  const queryEmbedding = embeddings[0];

  const versioni = await SELECT.from(ClausolaVersione)
    .where('embedding IS NOT NULL');
  if (!versioni.length) return [];

  const scored = [];
  for (const v of versioni) {
    let stored;
    try { stored = JSON.parse(v.embedding); } catch { continue; }
    const sim = cosineSimilarity(queryEmbedding, stored);
    if (sim >= soglia) {
      scored.push({ clausola_ID: v.clausola_ID, similarity: sim, snippet: v.testo.substring(0, 200) });
    }
  }

  if (!scored.length) return [];
  scored.sort((a, b) => b.similarity - a.similarity);

  const clausolaIDs = [...new Set(scored.map(s => s.clausola_ID))];
  const clausole = await SELECT.from(Clausola).where({ ID: clausolaIDs });
  const clausolaMap = new Map(clausole.map(c => [c.ID, c]));

  return scored.map(s => ({
    codice: clausolaMap.get(s.clausola_ID)?.codice || '?',
    titolo: clausolaMap.get(s.clausola_ID)?.titolo || '?',
    similarity: Math.round(s.similarity * 10000) / 10000,
    snippet: s.snippet
  }));
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function findClausolaInPreview(clausole, query) {
  if (!clausole || !clausole.length) return null;
  if (!query) return clausole[0];

  const qRaw = String(query).trim().toLowerCase();
  const qNorm = qRaw.replace(/\b(clausola|clausole|articolo|art|n\.|numero)\b/gi, '').trim();

  // 1. Ricerca per testo completo o normalizzato
  for (const c of clausole) {
    const searchTarget = [c.titolo, c.templateTitolo, c.codice, c.codiceContratto, c.codiceTemplate]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (qNorm && searchTarget.includes(qNorm)) return c;
    if (searchTarget.includes(qRaw)) return c;
  }

  // 2. Ricerca per numero clausola (es. C13, 13)
  const numMatch = qRaw.match(/\b(?:c|clausola)?\s*(\d+)\b/i);
  if (numMatch) {
    const numStr = numMatch[1];
    const numRegex = new RegExp(`\\bC?${numStr}\\b`, 'i');

    for (const c of clausole) {
      const searchTarget = [c.titolo, c.templateTitolo, c.codice, c.codiceContratto, c.codiceTemplate]
        .filter(Boolean)
        .join(' ');
      if (numRegex.test(searchTarget)) return c;
    }

    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < clausole.length) {
      return clausole[idx];
    }
  }

  // 3. Ricerca per parole
  const words = qNorm.split(/\s+/).filter(w => w.length > 2);
  if (words.length) {
    for (const c of clausole) {
      const searchTarget = [c.titolo, c.templateTitolo, c.codice, c.codiceContratto, c.codiceTemplate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (words.every(w => searchTarget.includes(w))) return c;
    }
  }

  return null;
}

async function getDiffClausola(previewID, titoloClausola) {
  const previewStore = require('../lib/preview-store');
  const data = previewStore.get(previewID);
  if (!data) return { errore: 'Preview non trovata o scaduta. L\'analisi di copertura potrebbe essere scaduta (TTL 30 min): ripetere l\'analisi.' };
  if (!data.clausole || !data.clausole.length) return { errore: 'Nessuna clausola nella preview' };

  const clausola = findClausolaInPreview(data.clausole, titoloClausola);
  if (!clausola) {
    const titoli = data.clausole.map(c => c.templateTitolo || c.titolo || c.codice).join(', ');
    return { errore: `Clausola "${titoloClausola}" non trovata nella preview. Clausole disponibili: ${titoli}` };
  }

  const testoDoc = clausola.testo || null;
  const testoTpl = clausola.testoTemplate || clausola.templateTesto || null;

  const result = {
    titolo: clausola.titolo || clausola.templateTitolo,
    templateTitolo: clausola.templateTitolo || null,
    stato: clausola.stato,
    similarity: clausola.similarity,
    testoDocumento: testoDoc,
    testoTemplate: testoTpl,
    diff: null
  };

  if (testoDoc && testoTpl) {
    try {
      const { computeDelta } = require('../lib/diff-utils');
      const { dettaglioDelta } = computeDelta(testoTpl, testoDoc);
      if (dettaglioDelta) {
        result.diff = JSON.parse(dettaglioDelta)
          .filter(p => p.added || p.removed)
          .map(p => ({ tipo: p.added ? 'aggiunto_nel_documento' : 'rimosso_rispetto_template', testo: p.value }));
      }
    } catch (e) {
      result.diffErrore = 'Impossibile calcolare il diff: ' + e.message;
    }
  } else if (clausola.stato === 'NUOVA') {
    result.nota = 'Clausola presente solo nel documento, senza corrispondente nel template.';
  } else if (clausola.stato === 'NON_PRESENTE') {
    result.nota = 'Clausola presente solo nel template, assente nel documento analizzato.';
  }

  return result;
}

const KNOWN_FUNCTIONS = new Set([
  'getVersioniClausola', 'getContrattiClausola', 'getContrattiClausolaModificata',
  'getContrattiConCommentiAperti', 'getInfoApprovazioneContratto', 'getStatoContratto',
  'getContrattiByStato', 'analizzaCoperturaContratto', 'getRisultatiCopertura',
  'getContrattiFuoriSyncConTemplate', 'getClausolePiuAggiornateAltrove', 'confrontaVersioniClausola', 'confrontaClausole',
  'cercaClausole', 'getClausolaRecente', 'cercaClausoleSemantiche', 'getDiffClausola',
  'listClausole', 'getClausoleUtilizzo', 'eseguiQueryDB', 'getVersioniContratto',
  'getInfoContratto', 'getClausolaContratto', 'getClausoleContratto'
]);

async function manageFunction(name, argsJSON) {
  if (!KNOWN_FUNCTIONS.has(name)) {
    throw new Error(`Funzione sconosciuta: ${name}`);
  }
  const args = JSON.parse(argsJSON);
  console.log(`[AI TOOL REQUEST] -> Function: ${name}, Args:`, args);
  let result;
  try {
    switch (name) {
      case 'getVersioniClausola':
        result = await getVersioniClausola(args.codice, args.clausolaID); break;
      case 'getContrattiClausola':
        result = await getContrattiClausola(args.codice, args.clausolaID); break;
      case 'getContrattiClausolaModificata':
        result = await getContrattiClausolaModificata(args.codice); break;
      case 'getContrattiConCommentiAperti':
        result = await getContrattiConCommentiAperti(); break;
      case 'getInfoApprovazioneContratto':
        result = await getInfoApprovazioneContratto(args.intestatario); break;
      case 'getStatoContratto':
        result = await getStatoContratto(args.intestatario); break;
      case 'getContrattiByStato':
        result = await getContrattiByStato(args.stato); break;
      case 'analizzaCoperturaContratto':
        result = await analizzaCoperturaContratto(args.contractID); break;
      case 'getRisultatiCopertura':
        result = await getRisultatiCopertura(args.previewID); break;
      case 'getContrattiFuoriSyncConTemplate':
        result = await getContrattiFuoriSyncConTemplate(); break;
      case 'getClausolePiuAggiornateAltrove':
        result = await getClausolePiuAggiornateAltrove(args.contrattoID); break;
      case 'confrontaVersioniClausola':
        result = await confrontaVersioniClausola(args.codice, args.numero1, args.numero2, args.clausolaID); break;
      case 'confrontaClausole':
        result = await confrontaClausole(args.codice1, args.codice2, args.numero1, args.numero2, args.clausolaID1, args.clausolaID2); break;
      case 'cercaClausole':
        result = await cercaClausole(args.testoCercato); break;
      case 'getClausolaRecente':
        result = await getClausolaRecente(args.codice, args.clausolaID); break;
      case 'cercaClausoleSemantiche':
        result = await cercaClausoleSemantiche(args.testo, args.soglia); break;
      case 'getDiffClausola':
        result = await getDiffClausola(args.previewID, args.titoloClausola); break;
      case 'listClausole':
        result = await listClausole(); break;
      case 'getClausoleUtilizzo':
        result = await getClausoleUtilizzo(); break;
      case 'eseguiQueryDB':
        result = await eseguiQueryDB(args.entity, args.select, args.where, args.orderBy, args.limit); break;
      case 'getVersioniContratto':
        result = await getVersioniContratto(args.contrattoID); break;
      case 'getInfoContratto':
        result = await getInfoContratto(args.contrattoID); break;
      case 'getClausolaContratto':
        result = await getClausolaContratto(args.contrattoID, args.codice); break;
      case 'getClausoleContratto':
        result = await getClausoleContratto(args.contrattoID); break;
      default:
        throw new Error(`Funzione sconosciuta: ${name}`);
    }
  } catch (err) {
    console.error(`[AI TOOL ERROR] Function: ${name}:`, err);
    result = { errore: err.message };
  }
  const serialized = JSON.stringify(result);
  console.log(`[AI TOOL RESPONSE] <- Function: ${name}, Output: ${serialized.substring(0, 300)}...`);
  return serialized;
}

module.exports = {
  manageFunction,
  getVersioniClausola,
  getContrattiClausola,
  getContrattiClausolaModificata,
  getContrattiConCommentiAperti,
  getInfoApprovazioneContratto,
  getStatoContratto,
  getContrattiByStato,
  analizzaCoperturaContratto,
  getRisultatiCopertura,
  getContrattiFuoriSyncConTemplate,
  getClausolePiuAggiornateAltrove,
  confrontaVersioniClausola,
  confrontaClausole,
  cercaClausole,
  getClausolaRecente,
  cercaClausoleSemantiche,
  getDiffClausola,
  listClausole,
  getClausoleUtilizzo,
  eseguiQueryDB,
  getVersioniContratto,
  getInfoContratto,
  getClausolaContratto,
  getClausoleContratto
};
