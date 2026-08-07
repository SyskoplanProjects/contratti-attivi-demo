// Popola l'app con dati di esempio per demo: un template di servizi ICT bancari
// conforme DORA e alcuni contratti in stati diversi (bozza, in revisione, approvato).
// Idempotente: se template/contratti con lo stesso nome esistono già, non li ricrea.
//
// Uso (server già avviato con `cds watch` / `npm run dev`):
//   node srv/lib/seed-demo.js
//   BASE_URL=http://localhost:4004 AUTH_USER=mario.rossi@contrattiattivi.it AUTH_PASS=test node srv/lib/seed-demo.js

const { TEMPLATE, CONTRATTI } = require('./demo-data');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4004';
const AUTH_USER = process.env.AUTH_USER || 'mario.rossi@contrattiattivi.it';
const AUTH_PASS = process.env.AUTH_PASS || 'test';
const AUTH_HEADER = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');
// approvaRevisione/rifiutaRevisione richiedono il revisore assegnato da inviaARevisione
// (hardcoded lato server su 'revisore@contrattiattivi.it'), diverso dal proprietario del contratto.
const AUTH_HEADER_REVISORE = 'Basic ' + Buffer.from('revisore@contrattiattivi.it:test').toString('base64');

async function api(path, options = {}) {
  const resp = await fetch(`${BASE_URL}/contratti/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER, ...options.headers }
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${options.method || 'GET'} ${path} -> HTTP ${resp.status}: ${body}`);
  }
  return resp.status === 204 ? null : resp.json();
}

async function trovaTemplatePerNome(nome) {
  const data = await api(`Template?$filter=nome eq '${nome.replace(/'/g, "''")}'`);
  return data.value[0] || null;
}

async function trovaContrattoPerIntestatario(intestatario) {
  const data = await api(`Contratto?$filter=intestatario eq '${intestatario.replace(/'/g, "''")}'`);
  return data.value[0] || null;
}

async function portaAlloStato(contrattoID, statoFinale) {
  if (statoFinale === 'BOZZA') return;

  const contratto = await api(`Contratto(${contrattoID})`);
  if (contratto.stato === 'BOZZA') {
    await api('inviaARevisione', { method: 'POST', body: JSON.stringify({ contrattoID }) });
  }
  if (statoFinale === 'IN_REVISIONE') return;

  const revisioni = await api(`Revisione?$filter=contratto_ID eq ${contrattoID}&$orderby=dataInvio desc`);
  const revisione = revisioni.value[0];
  if ((statoFinale === 'APPROVATO' || statoFinale === 'FIRMATO') && revisione.stato !== 'APPROVATA') {
    await api('approvaRevisione', {
      method: 'POST',
      body: JSON.stringify({ revisioneID: revisione.ID }),
      headers: { Authorization: AUTH_HEADER_REVISORE }
    });
  }
  if (statoFinale === 'FIRMATO') {
    await api(`Contratto(${contrattoID})`, { method: 'PATCH', body: JSON.stringify({ stato: 'FIRMATO' }) });
  }
}

async function main() {
  let template = await trovaTemplatePerNome(TEMPLATE.nome);
  let templateID;
  if (template) {
    templateID = template.ID;
    console.log(`Template già presente: "${TEMPLATE.nome}" (${templateID})`);
  } else {
    const res = await api('creaTemplateManuale', {
      method: 'POST',
      body: JSON.stringify({
        nome: TEMPLATE.nome, tipoServizio: TEMPLATE.tipoServizio,
        descrizione: TEMPLATE.descrizione, tipoRiferimento: 'STANDARD', clausole: TEMPLATE.clausole,
        testata: { intestatario: 'Seed DORA' }
      })
    });
    templateID = res.template_ID;
    console.log(`Template creato: "${TEMPLATE.nome}" (${templateID}), ${TEMPLATE.clausole.length} clausole`);
  }

  for (const dati of CONTRATTI) {
    try {
      const esistente = await trovaContrattoPerIntestatario(dati.intestatario);
      if (esistente) {
        // Backfill campi dati anche su contratti già esistenti (run precedenti di versioni più
        // vecchie dello script potrebbero averli lasciati null): idempotente, sempre riallineato.
        await api(`Contratto(${esistente.ID})`, {
          method: 'PATCH',
          body: JSON.stringify({
            importo: dati.importo, codiceFiscale: dati.codiceFiscale, dataStipula: dati.dataStipula,
            dataScadenza: dati.dataScadenza, categoria: dati.categoria, esitoVerifica: dati.esitoVerifica,
            oggetto: dati.oggetto
          })
        });
        if (esistente.stato === dati.statoFinale) {
          if (dati.responsabile && esistente.responsabile !== dati.responsabile) {
            await api(`Contratto(${esistente.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile }) });
          }
          console.log(`Contratto già presente: "${dati.intestatario}" (${esistente.ID}, ${esistente.stato})`);
        } else {
          // inviaARevisione richiede responsabile === utente che esegue l'azione: se un run
          // precedente ha lasciato il responsabile "etichetta" già impostato, va rimesso
          // temporaneamente sul proprietario reale prima di avanzare lo stato.
          if (esistente.stato === 'BOZZA' && esistente.responsabile !== AUTH_USER) {
            await api(`Contratto(${esistente.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: AUTH_USER }) });
          }
          await portaAlloStato(esistente.ID, dati.statoFinale);
          if (dati.responsabile) {
            await api(`Contratto(${esistente.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile }) });
          }
          console.log(`Contratto già presente, stato avanzato: "${dati.intestatario}" (${esistente.ID}) -> ${dati.statoFinale}`);
        }
        continue;
      }

      const contratto = await api('creaDaTemplate', { method: 'POST', body: JSON.stringify({ templateID }) });
      await api(`Contratto(${contratto.ID})`, {
        method: 'PATCH',
        body: JSON.stringify({
          intestatario: dati.intestatario,
          importo: dati.importo, codiceFiscale: dati.codiceFiscale, dataStipula: dati.dataStipula,
          dataScadenza: dati.dataScadenza, categoria: dati.categoria, esitoVerifica: dati.esitoVerifica,
          oggetto: dati.oggetto
        })
      });
      // responsabile guida l'autorizzazione di inviaARevisione (deve combaciare con l'utente che
      // esegue le azioni di workflow), quindi va cambiato solo a fine ciclo vita, come etichetta.
      await portaAlloStato(contratto.ID, dati.statoFinale);
      if (dati.responsabile) {
        await api(`Contratto(${contratto.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile }) });
      }
      console.log(`Contratto creato: "${dati.intestatario}" (${contratto.ID}) -> ${dati.statoFinale}`);
    } catch (e) {
      console.error(`Errore su "${dati.intestatario}": ${e.message || e}`);
    }
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

module.exports = { main };
