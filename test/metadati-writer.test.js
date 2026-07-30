const path = require('path');
const cds = require('@sap/cds');

cds.test(path.join(__dirname, '..'));
const { salvaMetadati } = require('../srv/lib/metadati-writer');

describe('salvaMetadati', () => {
  async function creaContrattoVuoto() {
    const { Contratto, Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
    const templateID = cds.utils.uuid();
    await INSERT.into(Template).entries({ ID: templateID, nome: 'T' });
    const versionID = cds.utils.uuid();
    await INSERT.into(TemplateVersion).entries({
      ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
    });
    const contrattoID = cds.utils.uuid();
    await INSERT.into(Contratto).entries({
      ID: contrattoID, stato: 'BOZZA', intestatario: 'Fallback iniziale',
      template_ID: templateID, templateVersion_ID: versionID
    });
    return contrattoID;
  }

  it('scrive le righe MetadatoDocumento per un Contratto e sincronizza le colonne di testata legacy', async () => {
    const { MetadatoDocumento, Contratto } = cds.entities('com.reply.contrattiattivi');
    const contrattoID = await creaContrattoVuoto();

    await cds.tx(async (tx) => {
      await salvaMetadati({
        tx, parentType: 'Contratto', parentID: contrattoID,
        metadati: [
          { campo: 'titoloContratto', etichetta: 'Titolo Contratto', valore: 'Accordo Quadro ICT', confidenza: 0.9 },
          { campo: 'fornitore', etichetta: 'Fornitore', valore: 'Acme S.p.A.', confidenza: 0.95 },
          { campo: 'oggettoContratto', etichetta: 'Oggetto del Contratto', valore: 'Servizi cloud', confidenza: 0.8 },
          { campo: 'importoContrattuale', etichetta: 'Importo Contrattuale', valore: '120000.50', confidenza: 0.7 },
          { campo: 'dataScadenza', etichetta: 'Data Scadenza', valore: '2027-01-01', confidenza: 0.6 },
          { campo: 'subfornitori', etichetta: 'Subfornitori', valore: null, confidenza: 0 }
        ]
      });
    });

    const righe = await SELECT.from(MetadatoDocumento).where({ contratto_ID: contrattoID });
    expect(righe).toHaveLength(6);

    const contratto = await SELECT.one.from(Contratto, contrattoID);
    expect(contratto.intestatario).toBe('Accordo Quadro ICT'); // titoloContratto ha priorità su fornitore
    expect(contratto.societaContraente).toBe('Acme S.p.A.'); // fornitore -> societaContraente (vecchia semantica)
    expect(contratto.oggetto).toBe('Servizi cloud');
    expect(Number(contratto.importo)).toBeCloseTo(120000.5);
    expect(contratto.dataScadenza).toBe('2027-01-01');
  });

  it('usa fornitore come fallback per intestatario quando titoloContratto è assente', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const contrattoID = await creaContrattoVuoto();

    await cds.tx(async (tx) => {
      await salvaMetadati({
        tx, parentType: 'Contratto', parentID: contrattoID,
        metadati: [{ campo: 'fornitore', etichetta: 'Fornitore', valore: 'Beta S.r.l.', confidenza: 0.9 }]
      });
    });

    const contratto = await SELECT.one.from(Contratto, contrattoID);
    expect(contratto.intestatario).toBe('Beta S.r.l.');
  });

  it('non sovrascrive la colonna se il campo mappato è assente o vuoto (mantiene il fallback esistente)', async () => {
    const { Contratto } = cds.entities('com.reply.contrattiattivi');
    const contrattoID = await creaContrattoVuoto();

    await cds.tx(async (tx) => {
      await salvaMetadati({
        tx, parentType: 'Contratto', parentID: contrattoID,
        metadati: [{ campo: 'oggettoContratto', etichetta: 'Oggetto del Contratto', valore: null, confidenza: 0 }]
      });
    });

    const contratto = await SELECT.one.from(Contratto, contrattoID);
    expect(contratto.intestatario).toBe('Fallback iniziale');
  });

  it('sostituisce (non accumula) le righe metadato su chiamate successive per lo stesso parent', async () => {
    const { MetadatoDocumento } = cds.entities('com.reply.contrattiattivi');
    const contrattoID = await creaContrattoVuoto();

    await cds.tx(async (tx) => {
      await salvaMetadati({ tx, parentType: 'Contratto', parentID: contrattoID, metadati: [{ campo: 'a', etichetta: 'A', valore: '1' }] });
    });
    await cds.tx(async (tx) => {
      await salvaMetadati({ tx, parentType: 'Contratto', parentID: contrattoID, metadati: [{ campo: 'b', etichetta: 'B', valore: '2' }] });
    });

    const righe = await SELECT.from(MetadatoDocumento).where({ contratto_ID: contrattoID });
    expect(righe).toHaveLength(1);
    expect(righe[0].campo).toBe('b');
  });
});
