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
