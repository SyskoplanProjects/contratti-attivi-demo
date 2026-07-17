const cds = require('@sap/cds');

// Tips AI: suggerimenti deterministici basati sui dati, non generati da un modello.
// Confronta SEMPRE contro contratti/clausole della stessa tipologia (stesso template),
// mai tra tipologie diverse (es. DORA vs non-DORA), perché una riga Clausola appartiene
// a un'unica linea di template e un Contratto ha un solo template_ID.
async function getTipsAI({ contrattoID, templateID, clausole }) {
  const { Contratto, ContrattoClausola, Clausola, ClausolaVersione } = cds.entities('com.reply.contrattiattivi');

  let templateIDEffettivo = templateID;
  let clausoleUsate;

  if (contrattoID) {
    const contratto = await SELECT.one.from(Contratto, contrattoID);
    if (!contratto) return { errore: 'Contratto non trovato: ' + contrattoID };
    templateIDEffettivo = contratto.template_ID;
    const righe = await SELECT.from(ContrattoClausola).where({ contratto_ID: contrattoID, rimossa: false });
    clausoleUsate = [];
    for (const r of righe) {
      const c = await SELECT.one.from(Clausola, r.clausola_ID);
      const v = await SELECT.one.from(ClausolaVersione, r.clausolaVersione_ID);
      if (c && v) clausoleUsate.push({ clausolaID: c.ID, codice: c.codice, titolo: c.titolo, versione: v.numero, versioneID: v.ID });
    }
  } else {
    clausoleUsate = [];
    for (const item of (clausole || [])) {
      if (!item || !item.clausolaID) continue;
      const c = await SELECT.one.from(Clausola, item.clausolaID);
      const v = await SELECT.one.from(ClausolaVersione).where({ clausola_ID: item.clausolaID, numero: item.versione || 0 });
      if (c) clausoleUsate.push({ clausolaID: c.ID, codice: c.codice, titolo: c.titolo, versione: item.versione || 0, versioneID: v ? v.ID : null });
    }
  }

  const tips = [];

  // 1. Versione più recente della stessa clausola già adottata in un altro contratto
  for (const cu of clausoleUsate) {
    const whereAltre = contrattoID
      ? { clausola_ID: cu.clausolaID, rimossa: false, contratto_ID: { '!=': contrattoID } }
      : { clausola_ID: cu.clausolaID, rimossa: false };
    const altreRighe = await SELECT.from(ContrattoClausola).where(whereAltre);

    let migliore = null;
    for (const altra of altreRighe) {
      const v = await SELECT.one.from(ClausolaVersione, altra.clausolaVersione_ID);
      if (v && v.numero > cu.versione && (!migliore || v.numero > migliore.numero)) {
        migliore = { numero: v.numero, versioneID: v.ID, contrattoID: altra.contratto_ID };
      }
    }
    if (migliore) {
      const altroContratto = await SELECT.one.from(Contratto, migliore.contrattoID);
      const sIDBreve = migliore.contrattoID.substring(0, 8).toUpperCase();
      const sVersioneNuovaID = migliore.versioneID.substring(0, 8).toUpperCase();
      const sVersioneAttualeID = cu.versioneID ? cu.versioneID.substring(0, 8).toUpperCase() : '?';
      tips.push({
        tipo: 'AGGIORNAMENTO',
        codice: cu.codice,
        titolo: cu.titolo,
        messaggio: `Clausola "${cu.codice} - ${cu.titolo}": disponibile versione più recente (v${migliore.numero}, ID: ${sVersioneNuovaID}, vs v${cu.versione}, ID: ${sVersioneAttualeID}) già adottata in un altro contratto` +
          (altroContratto ? ` ("${altroContratto.intestatario}", ID: ${sIDBreve}).` : ` (ID: ${sIDBreve}).`)
      });
    }
  }

  // 2. Clausole usate in altri contratti della stessa tipologia (stesso template) ma assenti qui
  if (templateIDEffettivo) {
    const miCodiciSet = new Set(clausoleUsate.map(c => c.codice));
    const whereAltri = contrattoID
      ? { template_ID: templateIDEffettivo, ID: { '!=': contrattoID } }
      : { template_ID: templateIDEffettivo };
    const altriContratti = await SELECT.from(Contratto).where(whereAltri);

    const conteggio = {};
    for (const altro of altriContratti) {
      const righe = await SELECT.from(ContrattoClausola).where({ contratto_ID: altro.ID, rimossa: false });
      for (const r of righe) {
        const c = await SELECT.one.from(Clausola, r.clausola_ID);
        if (!c || miCodiciSet.has(c.codice)) continue;
        if (!conteggio[c.codice]) conteggio[c.codice] = { titolo: c.titolo, count: 0, esempi: [] };
        conteggio[c.codice].count++;
        if (conteggio[c.codice].esempi.length < 3) {
          conteggio[c.codice].esempi.push(`${altro.intestatario} (ID: ${altro.ID.substring(0, 8).toUpperCase()})`);
        }
      }
    }
    for (const [codice, v] of Object.entries(conteggio)) {
      tips.push({
        tipo: 'MANCANTE',
        codice,
        titolo: v.titolo,
        messaggio: `Clausola "${codice} - ${v.titolo}" non presente qui ma usata in ${v.count} altri contratti dello stesso tipo` +
          (v.esempi.length ? ` (es. ${v.esempi.join(', ')}).` : '.') + ' Valutare se aggiungerla.'
      });
    }
  }

  return tips;
}

module.exports = { getTipsAI };
