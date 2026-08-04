const fs = require('fs');
const path = require('path');
const { estraiTestoPosizionato } = require('../srv/lib/pdf-position');

describe('pdf-position', () => {
  it('estrae il testo con bbox per pagina da un PDF di prova con testo noto', async () => {
    const buffer = fs.readFileSync(path.join(__dirname, 'fixtures', 'testo-noto.pdf'));
    const { testo, items } = await estraiTestoPosizionato(buffer);

    expect(testo).toContain('Contratto di prova ACME');
    expect(items.length).toBeGreaterThan(0);

    const item = items.find(i => i.testo.includes('ACME'));
    expect(item).toBeDefined();
    expect(item.pagina).toBe(1);
    expect(typeof item.x).toBe('number');
    expect(typeof item.y).toBe('number');
    expect(typeof item.width).toBe('number');
    expect(typeof item.height).toBe('number');
    expect(item.offsetFine).toBeGreaterThan(item.offsetInizio);
  });

  it('ritorna testo vuoto e items vuoto per un buffer non valido, senza lanciare eccezioni', async () => {
    const { testo, items } = await estraiTestoPosizionato(Buffer.from('non è un PDF'));
    expect(testo).toBe('');
    expect(items).toEqual([]);
  });
});