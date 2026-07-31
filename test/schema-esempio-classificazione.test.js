const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));

describe('schema EsempioClassificazione', () => {
  it('crea un esempio di correzione e lo rilegge', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');

    const ID = cds.utils.uuid();
    await INSERT.into(EsempioClassificazione).entries({
      ID,
      categoria: 'MAIL',
      sottoTipo: null,
      testo: 'Da: fornitore@acme.it — Oggetto: rinnovo contratto',
      embedding: JSON.stringify([0.1, 0.2, 0.3]),
      fonte: 'correzione',
      categoriaProposta: 'ODA',
      confidenzaProposta: 0.62
    });

    const riga = await SELECT.one.from(EsempioClassificazione, ID);
    expect(riga.categoria).toBe('MAIL');
    expect(riga.fonte).toBe('correzione');
    expect(JSON.parse(riga.embedding)).toEqual([0.1, 0.2, 0.3]);
    expect(riga.categoriaProposta).toBe('ODA');
    expect(riga.confidenzaProposta).toBe(0.62);
  });

  it('accetta sottoTipo per un esempio Contratto/CGC', async () => {
    const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');

    const ID = cds.utils.uuid();
    await INSERT.into(EsempioClassificazione).entries({
      ID,
      categoria: 'CONTRATTO',
      sottoTipo: 'CGC',
      testo: 'Condizioni Generali di Contratto...',
      embedding: JSON.stringify([0.4, 0.5]),
      fonte: 'conferma',
      categoriaProposta: 'CGC',
      confidenzaProposta: 0.91
    });

    const riga = await SELECT.one.from(EsempioClassificazione, ID);
    expect(riga.categoria).toBe('CONTRATTO');
    expect(riga.sottoTipo).toBe('CGC');
    expect(riga.fonte).toBe('conferma');
  });
});
