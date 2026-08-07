// Popola l'app con dati di esempio per demo: un template di servizi ICT bancari
// conforme DORA e alcuni contratti in stati diversi (bozza, in revisione, approvato).
// Idempotente: se template/contratti con lo stesso nome esistono già, non li ricrea.
//
// Uso (server già avviato con `cds watch` / `npm run dev`):
//   node srv/lib/seed-demo.js
//   BASE_URL=http://localhost:4004 AUTH_USER=mario.rossi@contrattiattivi.it AUTH_PASS=test node srv/lib/seed-demo.js

const { TEMPLATE, CONTRATTI } = require('./demo-data');
const { TIPOLOGIE_ALLEGATO } = require('./tipologie-allegato');

// Set standard atteso da allegati-attesi.js (CGC/CPC + Allegati A-G): senza questi allegati
// "Completezza allegati contrattuali" resta 0% per ogni contratto creato via creaDaTemplate,
// che non passa mai dal wizard di upload/classificazione.
const TIPI_ALLEGATI_STANDARD = ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G'];

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

// Idempotente: aggiunge solo i tipi CGC/CPC/A-G ancora mancanti sul contratto. Il contenuto è
// segnaposto (testoRiferimento della tipologia) — basta a soddisfare la verifica di completezza
// e, per ALLEGATO_E, i suoi campiChiave arrivano già valorizzati per evitare l'estrazione AI
// (gli altri tipi non hanno campiChiave: allegato-extractor.js ritorna subito senza chiamare l'LLM).
async function assicuraAllegati(contrattoID) {
  const esistenti = await api(`ContrattoAllegato?$filter=contratto_ID eq ${contrattoID}&$select=tipo`);
  const tipiPresenti = new Set((esistenti.value || []).map(a => a.tipo));
  for (const tipo of TIPI_ALLEGATI_STANDARD) {
    if (tipiPresenti.has(tipo)) continue;
    const tipologia = TIPOLOGIE_ALLEGATO.find(t => t.key === tipo);
    const testo = tipologia.testoRiferimento;
    const metadati = tipo === 'ALLEGATO_E'
      ? [{ campo: 'subfornitori', etichetta: 'Subfornitori', valore: '' }, { campo: 'subresponsabili', etichetta: 'Sub-responsabili', valore: '' }]
      : [];
    await api('aggiungiAllegatoContratto', {
      method: 'POST',
      body: JSON.stringify({
        contrattoID, filename: `${tipologia.label}.pdf`, file: Buffer.from(testo).toString('base64'),
        tipo, metodoRiconoscimento: 'MANUALE', testo, metadati
      })
    });
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
        // aggiungiAllegatoContratto (come inviaARevisione) richiede responsabile === utente che
        // esegue l'azione: se un run precedente ha già impostato l'etichetta finale, va rimesso
        // temporaneamente sul proprietario reale prima di avanzare stato/allegati.
        if (esistente.responsabile !== AUTH_USER) {
          await api(`Contratto(${esistente.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: AUTH_USER }) });
        }
        if (esistente.stato !== dati.statoFinale) {
          await portaAlloStato(esistente.ID, dati.statoFinale);
        }
        await assicuraAllegati(esistente.ID);
        if (dati.responsabile) {
          await api(`Contratto(${esistente.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile }) });
        }
        console.log(`Contratto già presente: "${dati.intestatario}" (${esistente.ID}, ${esistente.stato} -> ${dati.statoFinale})`);
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
      // responsabile guida l'autorizzazione di inviaARevisione/aggiungiAllegatoContratto (deve
      // combaciare con l'utente che esegue le azioni di workflow), quindi va cambiato solo a
      // fine ciclo vita, come etichetta.
      await portaAlloStato(contratto.ID, dati.statoFinale);
      await assicuraAllegati(contratto.ID);
      if (dati.responsabile) {
        await api(`Contratto(${contratto.ID})`, { method: 'PATCH', body: JSON.stringify({ responsabile: dati.responsabile }) });
      }
      console.log(`Contratto creato: "${dati.intestatario}" (${contratto.ID}) -> ${dati.statoFinale}`);
    } catch (e) {
      console.error(`Errore su "${dati.intestatario}": ${e.message || e}`);
    }
  }

  await preparaScenarioTipsAI(templateID);
}

// Tips AI (srv/lib/tips-ai.js) suggerisce solo quando c'è varianza tra contratti sullo stesso
// template: con tutti i 43 contratti demo fermi alla v0 delle clausole, il pannello resta
// sempre vuoto. Qui si aggiorna la clausola C1 (Oggetto del Contratto) su UN contratto BOZZA
// del set demo, creando una v1: ogni altro contratto sul template, ancora in v0, mostrerà da
// quel momento il tip "AGGIORNAMENTO" (versione più recente disponibile altrove). Idempotente:
// se la clausola ha già più di una versione, non ripete la modifica.
async function preparaScenarioTipsAI(templateID) {
  const NOME_CONTRATTO_DEMO = 'Banca Alpha S.p.A.';
  const target = await trovaContrattoPerIntestatario(NOME_CONTRATTO_DEMO);
  if (!target) return;
  if (target.stato !== 'BOZZA') {
    console.log(`Scenario Tips AI: "${NOME_CONTRATTO_DEMO}" non è più in BOZZA, salto (già preparato o stato avanzato manualmente).`);
    return;
  }

  const clausole = await api(`Clausola?$filter=template_ID eq ${templateID} and codice eq 'C1'`);
  const clausola = clausole.value[0];
  if (!clausola) return;

  const versioni = await api(`ClausolaVersione?$filter=clausola_ID eq ${clausola.ID}&$orderby=numero desc`);
  if (versioni.value.length > 1) {
    console.log('Scenario Tips AI già preparato (clausola C1 già aggiornata).');
    return;
  }

  const righe = await api(`ContrattoClausola?$filter=contratto_ID eq ${target.ID} and clausola_ID eq ${clausola.ID}`);
  const riga = righe.value[0];
  if (!riga) return;

  const testoAttuale = versioni.value[0].testo;
  const nuovoTesto = testoAttuale + ' A integrazione di quanto sopra, il Fornitore si impegna a sottoporsi annualmente, su richiesta dell\'Istituto, a test di resilienza operativa digitale basati sulla minaccia (Threat-Led Penetration Testing), in conformità all\'art. 26 del Regolamento DORA.';

  await api(`Contratto(${target.ID})/ContrattiService.modificaClausolaTesto`, {
    method: 'POST',
    body: JSON.stringify({ contrattoClausolaID: riga.ID, nuovoTesto })
  });
  console.log(`Scenario Tips AI preparato: clausola C1 aggiornata su "${NOME_CONTRATTO_DEMO}". Gli altri contratti sul template DORA mostreranno ora il suggerimento AGGIORNAMENTO.`);
}

if (require.main === module) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}

module.exports = { main };
