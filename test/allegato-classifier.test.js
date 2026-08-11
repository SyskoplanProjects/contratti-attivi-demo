const path = require('path');
const cds = require('@sap/cds');

const mockEmbeddings = jest.fn();
const mockChatJSON = jest.fn();

jest.mock('../srv/modules/openai-module', () => ({
  embeddings: (...args) => mockEmbeddings(...args),
  chatJSON: (...args) => mockChatJSON(...args)
}));

const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');

function vettoreOneHot(indice, lunghezza) {
  const v = new Array(lunghezza).fill(0);
  v[indice] = 1;
  return v;
}

describe('allegato-classifier', () => {
  let classificaAllegato;

  beforeEach(() => {
    mockEmbeddings.mockReset();
    mockChatJSON.mockReset();
    // cache interna dei profili di riferimento è a livello di modulo:
    // reset per avere, ad ogni test, la prima chiamata a embeddings() dedicata ai profili.
    jest.resetModules();
    // allegato-classifier ora dipende da classificazione-esempi che usa cds.entities:
    // ri-registrare l'istanza bootstrappata da cds.test() dopo il reset.
    jest.doMock('@sap/cds', () => cds);
    ({ classificaAllegato } = require('../srv/lib/allegato-classifier'));
  });

  it('classifica sopra soglia usando la similarity con i profili di riferimento', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    // prima chiamata: embedding dei testi di riferimento (una per categoria)
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    // seconda chiamata: embedding del testo del documento, identico al profilo CAMERA_COMMERCIO (indice 3)
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(3, n)]);

    const result = await classificaAllegato('Visura camerale ordinaria di Acme S.p.A. con data di estrazione.');

    expect(result.tipo).toBe(TIPOLOGIE_ALLEGATO[3].key);
    expect(result.metodoRiconoscimento).toBe('embedding');
    expect(result.confidenza).toBeGreaterThanOrEqual(0.75);
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('un vero certificato DURC (embedding indovina già DURC) viene confermato, senza forzatura pre-check', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(1, n)]); // embedding indovina DURC

    const result = await classificaAllegato('DOCUMENTO UNICO DI REGOLARITÀ CONTRIBUTIVA. Protocollo INAIL 12345. Denominazione: Acme S.p.A.');

    expect(result.tipo).toBe('DURC');
    expect(result.confidenza).toBeGreaterThanOrEqual(0.75);
    expect(mockEmbeddings).toHaveBeenCalled();
  });

  it('bug reale (contratto NOMIOS): un contratto composito lungo che MENZIONA "DURC" in una clausola di pagamento non viene classificato DURC — segue la classificazione reale del contenuto dominante', async () => {
    // _embeddingsRiferimento filtra CONTRATTO (testoRiferimento: null): il pool inviato a
    // openai.embeddings ha un elemento in meno di TIPOLOGIE_ALLEGATO, quindi gli indici del
    // one-hot vanno costruiti su conRiferimento, non sull'elenco completo.
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const nRef = conRiferimento.length;
    const idxCGC = conRiferimento.findIndex(t => t.key === 'CGC');

    mockEmbeddings.mockResolvedValueOnce(conRiferimento.map((_, i) => vettoreOneHot(i, nRef)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(idxCGC, nRef)]); // profilo CGC

    const testoContrattoConMenzioneDurc =
      'Condizioni Generali di Contratto. Art. 9.9: il pagamento del corrispettivo sarà subordinato ' +
      'alla preventiva consegna alla Committente dei seguenti documenti: DURC (Documento Unico di ' +
      'Regolarità Contributiva) relativo al proprio personale dipendente impiegato nel Contratto.';

    const result = await classificaAllegato(testoContrattoConMenzioneDurc);

    expect(result.tipo).not.toBe('DURC');
    expect(result.tipo).not.toBe('DURF');
    expect(result.tipo).toBe('CGC');
    expect(mockEmbeddings).toHaveBeenCalled();
  });

  it('bug reale (regressione ODA): contratto con frontespizio/riferimenti amministrativi lunghi (>6000 caratteri) prima delle CGC non viene classificato ODA per troncamento eccessivo del testo inviato a embeddings', async () => {
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const nRef = conRiferimento.length;
    const idxCGC = conRiferimento.findIndex(t => t.key === 'CGC');
    const idxODA = conRiferimento.findIndex(t => t.key === 'ODA');

    mockEmbeddings.mockResolvedValueOnce(conRiferimento.map((_, i) => vettoreOneHot(i, nRef)));
    // simula il vero comportamento dell'API: l'embedding riflette il contenuto REALE inviato.
    // Se il testo inviato contiene ancora il marcatore CGC (non è stato troncato via), profilo
    // CGC; se il marcatore è stato tagliato fuori dal troncamento, l'embedding vede solo il
    // frontespizio amministrativo e assomiglia a ODA.
    mockEmbeddings.mockImplementationOnce((testi) => {
      const inviato = testi[0];
      const idx = inviato.includes('MARCATORE_CGC') ? idxCGC : idxODA;
      return Promise.resolve([vettoreOneHot(idx, nRef)]);
    });

    const frontespizioAmministrativo = 'Riferimenti amministrativi SAP Ciclo Passivo. '.repeat(200); // >6000 caratteri
    const testoContratto = frontespizioAmministrativo +
      'MARCATORE_CGC Condizioni Generali di Contratto. Art. 1: oggetto del contratto...';

    const result = await classificaAllegato(testoContratto);

    expect(result.tipo).toBe('CGC');
    expect(result.tipo).not.toBe('ODA');
  });

  it('sigla DURC nel testo con embedding che sbaglia verso DURF -> DURC via regola', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(2, n)]); // embedding dice DURF (sbagliato)

    const result = await classificaAllegato('Richiesta DURC del 12/03/2026. Impresa: Acme S.p.A.');

    expect(result.tipo).toBe('DURC');
    expect(result.metodoRiconoscimento).toBe('nomeEsplicito');
  });

  it('un vero certificato DURF (embedding indovina già DURF) viene confermato, senza forzatura pre-check', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(2, n)]); // embedding indovina DURF

    const result = await classificaAllegato('Documento Unico di Regolarità Fiscale rilasciato dall\'Agenzia delle Entrate.');

    expect(result.tipo).toBe('DURF');
    expect(mockEmbeddings).toHaveBeenCalled();
  });

  it('sigla DURF nel testo con embedding che sbaglia verso DURC -> DURF via regola', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(1, n)]); // embedding dice DURC (sbagliato)

    const result = await classificaAllegato('Certificato DURF periodico emesso dall\'Agenzia delle Entrate.');

    expect(result.tipo).toBe('DURF');
    expect(result.metodoRiconoscimento).toBe('nomeEsplicito');
  });

  it('embedding matcha profilo DURC ma senza nome esplicito -> DURF (regola: altrimenti è durf)', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(1, n)]); // identico al profilo DURC

    const result = await classificaAllegato('Attestazione di regolarità contributiva dell\'impresa Acme S.p.A.');

    expect(result.tipo).toBe('DURF');
    expect(result.metodoRiconoscimento).toBe('nomeEsplicito');
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('LLM propone DURC ma senza nome esplicito nel testo -> DURF', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]); // sotto soglia
    mockChatJSON.mockResolvedValueOnce({ tipo: 'DURC', confidenza: 0.9 });

    const result = await classificaAllegato('Attestazione di regolarità contributiva dell\'impresa Acme S.p.A.');

    expect(result.tipo).toBe('DURF');
    expect(result.metodoRiconoscimento).toBe('nomeEsplicito');
  });

  it('LLM propone DURF senza nome esplicito -> resta DURF (regola conferma)', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]);
    mockChatJSON.mockResolvedValueOnce({ tipo: 'DURF', confidenza: 0.9 });

    const result = await classificaAllegato('Attestazione di regolarità fiscale dell\'impresa Acme S.p.A.');

    expect(result.tipo).toBe('DURF');
    expect(result.metodoRiconoscimento).toBe('llm');
  });

  it('documento non DURC/DURF senza menzioni di sigle non viene toccato dal pre-check', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(3, n)]); // CAMERA_COMMERCIO

    const result = await classificaAllegato('Visura camerale ordinaria con data di estrazione e forma giuridica.');

    expect(result.tipo).toBe('CAMERA_COMMERCIO');
    expect(result.metodoRiconoscimento).toBe('embedding');
  });

  it('usa il fallback LLM quando nessun profilo supera la soglia', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]); // ortogonale a tutti i profili
    mockChatJSON.mockResolvedValueOnce({ tipo: 'CAMERA_COMMERCIO', confidenza: 0.6 });

    const result = await classificaAllegato('Testo generico non riconducibile a nessun profilo noto.');

    expect(mockChatJSON).toHaveBeenCalledTimes(1);
    expect(result.tipo).toBe('CAMERA_COMMERCIO');
    expect(result.metodoRiconoscimento).toBe('llm');
  });

  it('ripiega su ALTRO se anche il fallback LLM non riconosce nulla', async () => {
    const n = TIPOLOGIE_ALLEGATO.length;
    mockEmbeddings.mockResolvedValueOnce(TIPOLOGIE_ALLEGATO.map((_, i) => vettoreOneHot(i, n)));
    mockEmbeddings.mockResolvedValueOnce([new Array(n).fill(0.01)]);
    mockChatJSON.mockResolvedValueOnce({ tipo: 'ALTRO', confidenza: 0.2 });

    const result = await classificaAllegato('Documento non identificabile.');

    expect(result.tipo).toBe('ALTRO');
    expect(result.metodoRiconoscimento).toBe('llm');
  });

  it('ritorna ALTRO senza chiamare le API per testo vuoto', async () => {
    const result = await classificaAllegato('   ');
    expect(result.tipo).toBe('ALTRO');
    expect(mockEmbeddings).not.toHaveBeenCalled();
    expect(mockChatJSON).not.toHaveBeenCalled();
  });

  it('non invia testoRiferimento null/undefined a openai.embeddings', async () => {
    // Verifica che CONTRATTO abbia testoRiferimento: null
    const contratto = TIPOLOGIE_ALLEGATO.find(t => t.key === 'CONTRATTO');
    expect(contratto?.testoRiferimento).toBe(null);

    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const nConRiferimento = conRiferimento.length;

    // Prima chiamata: embedding solo delle tipologie con testoRiferimento
    mockEmbeddings.mockResolvedValueOnce(conRiferimento.map((_, i) => vettoreOneHot(i, nConRiferimento)));
    // Seconda chiamata: embedding del documento
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(0, nConRiferimento)]);
    mockChatJSON.mockResolvedValueOnce({ tipo: 'DURC', confidenza: 0.85 });

    await classificaAllegato('Documento di regolarità contributiva');

    // Verifica che il primo embeddings abbia ricevuto solo i testi che esistono
    const firstCall = mockEmbeddings.mock.calls[0];
    expect(firstCall[0]).toHaveLength(nConRiferimento);
    expect(firstCall[0]).not.toContain(null);
    expect(firstCall[0]).not.toContain(undefined);
  });
});

const { POST } = cds.test(path.join(__dirname, '..'));

describe('classificaAllegato — pool esteso con esempi reali', () => {
  beforeEach(() => {
    mockEmbeddings.mockReset();
    jest.resetModules();
    // jest.resetModules() svuota anche @sap/cds dal registry: lo ri-registriamo
    // con doMock così classificazione-esempi.js riusa l'istanza bootstrappata da
    // cds.test() (entity EsempioClassificazione + DB in-memory già deployati).
    jest.doMock('@sap/cds', () => cds);
  });

  it('un esempio reale salvato per MAIL vince sul best-match statico quando più simile', async () => {
    // Baseline statica: ogni testoRiferimento riceve un embedding "neutro" [0,0,1]
    // (nessuno supera la soglia 0.75 da solo). L'esempio reale per MAIL riceve [1,0,0],
    // identico al documento da classificare: deve vincere lui.
    mockEmbeddings.mockImplementation((testi) => Promise.resolve(testi.map(() => [0, 0, 1])));

    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);

    const { salvaEsempio } = require('../srv/lib/classificazione-esempi');
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve([[1, 0, 0]])); // embedding esempio salvato
    await salvaEsempio({
      categoria: 'MAIL', sottoTipo: null, testo: 'Da: mario@acme.it Oggetto: rinnovo',
      fonte: 'correzione', categoriaProposta: 'ODA', confidenzaProposta: 0.5
    });

    const { classificaAllegato } = require('../srv/lib/allegato-classifier');
    // Ordine chiamate dentro classificaAllegato: prima i testiRiferimento statici (pool),
    // poi il documento. Quindi: once per i riferimenti statici, poi once per il documento.
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve(conRiferimento.map(() => [0, 0, 1]))); // embedding riferimenti statici
    mockEmbeddings.mockImplementationOnce(() => Promise.resolve([[1, 0, 0]])); // embedding documento da classificare
    const risultato = await classificaAllegato('Da: luigi@fornitore.it Oggetto: proroga contratto');

    expect(risultato.tipo).toBe('MAIL');
    expect(risultato.metodoRiconoscimento).toBe('embedding');
  });
});

describe('rilevaTipiPresenti — fascicolo con più tipologie concatenate in un unico file', () => {
  let rilevaTipiPresenti;

  beforeEach(() => {
    mockEmbeddings.mockReset();
    mockChatJSON.mockReset();
    jest.resetModules();
    jest.doMock('@sap/cds', () => cds);
    ({ rilevaTipiPresenti } = require('../srv/lib/allegato-classifier'));
  });

  // conRiferimento è l'elenco filtrato usato da _embeddingsRiferimento (testoRiferimento != null,
  // esclude CONTRATTO che ha testoRiferimento: null). Gli indici dei vettori one-hot vanno
  // costruiti su questo elenco, non su TIPOLOGIE_ALLEGATO per intero (stesso pattern usato nel
  // test NOMIOS di classificaAllegato più sopra).
  function _setupProfili() {
    const conRiferimento = TIPOLOGIE_ALLEGATO.filter(t => t.testoRiferimento != null);
    const n = conRiferimento.length;
    mockEmbeddings.mockResolvedValueOnce(conRiferimento.map((_, i) => vettoreOneHot(i, n)));
    return { conRiferimento, n, idx: key => conRiferimento.findIndex(t => t.key === key) };
  }

  it('ritorna le tipologie il cui contenuto reale (per blocco) somiglia abbastanza al profilo (caso reale: OdA+CGC+CPC+Allegati in un solo PDF)', async () => {
    const { n, idx } = _setupProfili();
    // documento > 3000 caratteri: si spezza in 2 chunk, uno per tipologia
    const chunkCgc = 'Condizioni Generali di Contratto. '.repeat(100);
    const chunkCpc = 'Condizioni Particolari di Contratto. '.repeat(100);
    mockEmbeddings.mockResolvedValueOnce([vettoreOneHot(idx('CGC'), n), vettoreOneHot(idx('CPC'), n)]);

    const risultato = await rilevaTipiPresenti(chunkCgc + chunkCpc);

    expect(risultato.sort()).toEqual(['CGC', 'CPC']);
  });

  it('bug reale (Contratto_ADAM.pdf): un chunk che si limita a CITARE gli allegati in un indice non somiglia abbastanza al contenuto reale di nessuna tipologia', async () => {
    const { n } = _setupProfili();
    // vettore diffuso, nessuna similarity forte con alcun profilo (tutti sotto SOGLIA_TIPO_ALLEGATO)
    const vettoreDiffuso = new Array(n).fill(1 / Math.sqrt(n));
    mockEmbeddings.mockResolvedValueOnce([vettoreDiffuso]);

    const risultato = await rilevaTipiPresenti('Ai fini dell’erogazione dei Servizi sono allegati: A) Allegati Tecnici B) Allegati Economici G) Indirizzi delle Parti e PEC.');

    expect(risultato).toEqual([]);
  });

  it('testo vuoto -> nessuna chiamata, array vuoto', async () => {
    const risultato = await rilevaTipiPresenti('');
    expect(risultato).toEqual([]);
    expect(mockEmbeddings).not.toHaveBeenCalled();
  });

  it('fallback ad array vuoto se la chiamata embeddings fallisce', async () => {
    _setupProfili();
    mockEmbeddings.mockRejectedValueOnce(new Error('rete non disponibile'));
    const risultato = await rilevaTipiPresenti('Testo.');
    expect(risultato).toEqual([]);
  });
});
