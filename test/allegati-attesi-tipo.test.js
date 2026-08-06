const { verificaCompletezza } = require('../srv/lib/allegati-attesi');

describe('verificaCompletezza — set allegati in funzione del tipo contratto (obiettivo "Classificazione dei contratti")', () => {
  it('senza contesto usa lo standard completo A-G (comportamento invariato)', () => {
    const { attesi } = verificaCompletezza([], undefined);
    expect(attesi).toHaveLength(9);
    expect(attesi.map(a => a.allegatoAtteso)).toContain('ALLEGATO_E');
  });

  it('Accordo Quadro: set ridotto, C/E/G non richiesti (caso reale Dedacredit BCC Sinergia, doc 04 §2)', () => {
    const allegatiPresenti = [
      { tipo: 'CGC', filename: 'cgc.pdf' },
      { tipo: 'CPC', filename: 'cpc.pdf' },
      { tipo: 'ALLEGATO_A', filename: 'catalogo-servizi.pdf' },
      { tipo: 'ALLEGATO_B', filename: 'tariffe.pdf' },
      { tipo: 'ALLEGATO_D', filename: 'informativa-rischi.pdf' },
      { tipo: 'ALLEGATO_F', filename: 'piano-continuita.pdf' }
    ];
    const { attesi, percentuale } = verificaCompletezza(allegatiPresenti, { accordoQuadroOAutonomo: 'Accordo Quadro' });
    expect(attesi).toHaveLength(6);
    expect(attesi.map(a => a.allegatoAtteso)).not.toContain('ALLEGATO_C');
    expect(attesi.map(a => a.allegatoAtteso)).not.toContain('ALLEGATO_E');
    expect(attesi.map(a => a.allegatoAtteso)).not.toContain('ALLEGATO_G');
    expect(percentuale).toBe(100);
  });

  it('contratto autonomo: resta lo standard completo, C/E/G mancanti abbassano la percentuale', () => {
    const { attesi, percentuale } = verificaCompletezza([
      { tipo: 'CGC', filename: 'cgc.pdf' }, { tipo: 'CPC', filename: 'cpc.pdf' }
    ], { accordoQuadroOAutonomo: 'Contratto autonomo' });
    expect(attesi).toHaveLength(9);
    expect(percentuale).toBeLessThan(100);
  });

  it('ADDENDUM non è un allegato atteso: è un documento post-hoc, non fa parte del set alla firma', () => {
    const { attesi } = verificaCompletezza([{ tipo: 'ADDENDUM', filename: 'dora-addendum.pdf' }], undefined);
    expect(attesi.map(a => a.allegatoAtteso)).not.toContain('ADDENDUM');
  });

  it('dichiara sempre esplicitamente rispetto a quale standard di tipologia sta verificando', () => {
    const standard = verificaCompletezza([], undefined);
    expect(standard.standardApplicato).toMatch(/standard Iccrea/i);

    const accordoQuadro = verificaCompletezza([], { accordoQuadroOAutonomo: 'Accordo Quadro' });
    expect(accordoQuadro.standardApplicato).toMatch(/Accordo Quadro/);
    expect(accordoQuadro.standardApplicato).not.toBe(standard.standardApplicato);
  });
});
