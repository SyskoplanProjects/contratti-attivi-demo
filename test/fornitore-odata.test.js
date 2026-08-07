const path = require('path');
const cds = require('@sap/cds');
const { GET } = cds.test(path.join(__dirname, '..'));
const { seed } = require('../srv/lib/seed-fornitori');
const { MOCK_USER } = require('./helpers/auth');

describe('fornitore odata', () => {
  beforeAll(async () => { await seed(cds); });

  it('GET /contratti/Fornitore returns seeded rows', async () => {
    const res = await GET('/contratti/Fornitore?$top=5000', { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value.length).toBeGreaterThan(4000);
  });

  it('supports $filter contains', async () => {
    const res = await GET('/contratti/Fornitore?$filter=contains(nomeFornitore,%27APP%27)', { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value.length).toBeGreaterThan(0);
  });

  it('rejects without auth', async () => {
    await expect(GET('/contratti/Fornitore')).rejects.toMatchObject({ response: { status: 401 } });
  });
});