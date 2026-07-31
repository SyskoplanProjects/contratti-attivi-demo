const { TIPOLOGIE_ALLEGATO } = require('../srv/lib/tipologie-allegato');

describe('tipologie-allegato — tipo CONTRATTO', () => {
  const contratto = TIPOLOGIE_ALLEGATO.find(t => t.key === 'CONTRATTO');

  it('esiste ed ha 31 campiChiave', () => {
    expect(contratto).toBeDefined();
    expect(contratto.campiChiave).toHaveLength(31);
  });

  it('ogni campoChiave ha campo, etichetta e sezione', () => {
    contratto.campiChiave.forEach(c => {
      expect(typeof c.campo).toBe('string');
      expect(typeof c.etichetta).toBe('string');
      expect(typeof c.sezione).toBe('string');
      expect(c.descrizione || c.staticValue || c.dynamic).toBeTruthy();
    });
  });

  it('templateContrattuale è marcato dynamic (riconoscimento per similarity, non chiesto al modello LLM)', () => {
    const campo = contratto.campiChiave.find(c => c.campo === 'templateContrattuale');
    expect(campo.dynamic).toBe('riconosciTemplateContrattuale');
    expect(campo.staticValue).toBeUndefined();
    expect(campo.descrizione).toBeUndefined();
  });

  it('dataScadenza è marcato scadenza:true', () => {
    const campo = contratto.campiChiave.find(c => c.campo === 'dataScadenza');
    expect(campo.scadenza).toBe(true);
  });

  it('include i campi extra non presenti nel foglio Metadati ufficiale', () => {
    const chiavi = contratto.campiChiave.map(c => c.campo);
    expect(chiavi).toContain('partitaIvaFornitore');
    expect(chiavi).toContain('emailControparte');
  });

  it('le tipologie esistenti (DURC) hanno anche etichetta e sezione sui campiChiave', () => {
    const durc = TIPOLOGIE_ALLEGATO.find(t => t.key === 'DURC');
    durc.campiChiave.forEach(c => {
      expect(typeof c.etichetta).toBe('string');
      expect(typeof c.sezione).toBe('string');
    });
  });

  it('ha testoRiferimento === null', () => {
    expect(contratto.testoRiferimento).toBe(null);
  });
});

describe('tipologie-allegato — tassonomia estesa (RF2/RF5)', () => {
  const chiavi = TIPOLOGIE_ALLEGATO.map(t => t.key);

  it('include le 5 macro-categorie', () => {
    ['CONTRATTO', 'MAIL', 'ODA', 'OFFERTA', 'FATTURA', 'ALTRO'].forEach(k => {
      expect(chiavi).toContain(k);
    });
  });

  it('include le sotto-tipologie Contratto', () => {
    ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_B', 'ALLEGATO_C', 'ALLEGATO_D', 'ALLEGATO_E', 'ALLEGATO_F', 'ALLEGATO_G', 'ALBERO_DECISIONALE'].forEach(k => {
      expect(chiavi).toContain(k);
    });
  });

  it('marca le sotto-tipologie con sottoTipologia:true', () => {
    const sotto = TIPOLOGIE_ALLEGATO.filter(t => t.sottoTipologia).map(t => t.key);
    ['CGC', 'CPC', 'ALLEGATO_A', 'ALLEGATO_E', 'ALBERO_DECISIONALE'].forEach(k => {
      expect(sotto).toContain(k);
    });
  });

  it('marca le macro-categorie con macro:true', () => {
    const macro = TIPOLOGIE_ALLEGATO.filter(t => t.macro).map(t => t.key);
    ['CONTRATTO', 'MAIL', 'ODA', 'OFFERTA', 'FATTURA', 'ALTRO'].forEach(k => {
      expect(macro).toContain(k);
    });
  });

  it('nessuna chiave è insieme macro e sottoTipologia', () => {
    TIPOLOGIE_ALLEGATO.forEach(t => {
      expect(!(t.macro && t.sottoTipologia)).toBe(true);
    });
  });

  it('ALLEGATO_E ha campiChiave subfornitori e subresponsabili (RF5)', () => {
    const allegatoE = TIPOLOGIE_ALLEGATO.find(t => t.key === 'ALLEGATO_E');
    const campi = allegatoE.campiChiave.map(c => c.campo);
    expect(campi).toContain('subfornitori');
    expect(campi).toContain('subresponsabili');
  });

  it('ogni sotto-tipologia e macro-categoria ha testoRiferimento non-null (CONTRATTO escluso: volutamente null)', () => {
    TIPOLOGIE_ALLEGATO.filter(t => (t.macro || t.sottoTipologia) && t.key !== 'CONTRATTO').forEach(t => {
      expect(typeof t.testoRiferimento).toBe('string');
      expect(t.testoRiferimento.length).toBeGreaterThan(30);
    });
  });
});
