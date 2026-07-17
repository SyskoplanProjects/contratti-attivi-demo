const path = require('path');
const cds = require('@sap/cds');

cds.test(path.join(__dirname, '..'));

const { eseguiImportConfermato } = require('../srv/lib/import-commit');
const { seedTemplateConClausole } = require('./helpers/seed');

describe('eseguiImportConfermato', () => {
  it('creates a brand new Template and Clausola when no match is confirmed', async () => {
    const result = await cds.tx(tx => eseguiImportConfermato(tx, null, 'nuovo.docx', [
      { numero: 1, titolo: 'Oggetto', testo: 'Testo nuovo.', matchClausolaVersioneID: null }
    ]));
    expect(result.clausoleCreate).toBe(1);
    expect(result.clausoleRiutilizzate).toBe(0);
    expect(typeof result.templateID).toBe('string');
  });

  it('reuses the confirmed ClausolaVersione when the text is unchanged', async () => {
    const { templateID, versioneClausolaID } = await seedTemplateConClausole();
    const result = await cds.tx(tx => eseguiImportConfermato(tx, templateID, 'doc.docx', [
      { numero: 1, titolo: 'Oggetto del contratto', testo: 'Testo originale della clausola C1.', matchClausolaVersioneID: versioneClausolaID }
    ]));
    expect(result.clausoleRiutilizzate).toBe(1);
    expect(result.clausoleCreate).toBe(0);
  });

  it('creates a new version on the same Clausola with a delta when the confirmed match has different text', async () => {
    const { templateID, versioneClausolaID } = await seedTemplateConClausole();
    const result = await cds.tx(tx => eseguiImportConfermato(tx, templateID, 'doc.docx', [
      { numero: 1, titolo: 'Oggetto del contratto', testo: 'Testo modificato della clausola C1.', matchClausolaVersioneID: versioneClausolaID }
    ]));
    expect(result.clausoleCreate).toBe(1);
    expect(result.clausoleConDelta).toBe(1);
    expect(result.clausoleRiutilizzate).toBe(0);
  });
});
