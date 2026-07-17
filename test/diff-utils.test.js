const { normalizeText, computeDelta } = require('../srv/lib/diff-utils');

describe('diff-utils', () => {
  it('normalizes whitespace and trims', () => {
    expect(normalizeText('  Ciao   mondo  \n')).toBe('Ciao mondo');
  });

  it('detects identical text as not modified', () => {
    const result = computeDelta('Testo uguale.', 'Testo   uguale.');
    expect(result.modificata).toBe(false);
    expect(result.dettaglioDelta).toBeNull();
  });

  it('detects different text as modified and returns delta', () => {
    const result = computeDelta('Il termine e di 30 giorni.', 'Il termine e di 60 giorni.');
    expect(result.modificata).toBe(true);
    const parts = JSON.parse(result.dettaglioDelta);
    expect(parts.some(p => p.removed)).toBe(true);
    expect(parts.some(p => p.added)).toBe(true);
  });
});
