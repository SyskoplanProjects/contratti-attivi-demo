const path = require('path');
const cds = require('@sap/cds');
cds.test(path.join(__dirname, '..'));

const { TOOLS } = require('../srv/lib/setup-assistant');
const { manageFunction } = require('../srv/modules/db-operation');

describe('setup-assistant tool declarations', () => {
  it('declares at least one tool', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it('every declared tool name is handled by manageFunction', async () => {
    for (const tool of TOOLS) {
      const name = tool.function.name;
      // manageFunction throws only for names it doesn't recognize ("Funzione sconosciuta").
      // Calling with empty args may fail for other reasons (missing required arg), which is fine here.
      try {
        await manageFunction(name, '{}');
      } catch (e) {
        expect(e.message).not.toMatch(/Funzione sconosciuta/);
      }
    }
  });

  it('every declared tool has a non-empty description and valid parameters schema', () => {
    for (const tool of TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe('object');
    }
  });
});
