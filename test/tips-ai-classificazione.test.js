const path = require('path');
const cds = require('@sap/cds');

const { POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

async function seedTemplate(tipoRiferimento) {
  const { Template, TemplateVersion } = cds.entities('com.reply.contrattiattivi');
  const templateID = cds.utils.uuid();
  await INSERT.into(Template).entries({ ID: templateID, nome: 'T ' + cds.utils.uuid(), tipoRiferimento });
  const versionID = cds.utils.uuid();
  await INSERT.into(TemplateVersion).entries({
    ID: versionID, template_ID: templateID, numero: 0, dataCreazione: new Date().toISOString()
  });
  return templateID;
}

describe('generaTipsAI — classificazione contratto (cliente/standard, quadro/autonomo)', () => {
  it('template STANDARD + accordoQuadroOAutonomo "Accordo Quadro" -> tip CLASSIFICAZIONE coerente', async () => {
    const templateID = await seedTemplate('STANDARD');
    const resp = await POST('/comparator/generaTipsAI',
      { templateID, clausole: [], accordoQuadroOAutonomo: 'Accordo Quadro' }, { auth: MOCK_USER });
    expect(resp.status).toBe(200);
    const tip = resp.data.value.find(t => t.tipo === 'CLASSIFICAZIONE');
    expect(tip).toBeTruthy();
    expect(tip.messaggio).toMatch(/standard Iccrea/i);
    expect(tip.messaggio).toMatch(/Accordo Quadro/);
  });

  it('template CLIENTE senza metadato quadro -> non determinabile, non un default silenzioso', async () => {
    const templateID = await seedTemplate('CLIENTE');
    const resp = await POST('/comparator/generaTipsAI',
      { templateID, clausole: [], accordoQuadroOAutonomo: null }, { auth: MOCK_USER });
    const tip = resp.data.value.find(t => t.tipo === 'CLASSIFICAZIONE');
    expect(tip.messaggio).toMatch(/contratto cliente/i);
    expect(tip.messaggio).toMatch(/non determinabile/i);
  });
});
