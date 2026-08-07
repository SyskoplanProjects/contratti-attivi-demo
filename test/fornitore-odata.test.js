const path = require('path');
const cds = require('@sap/cds');
const { GET } = cds.test(path.join(__dirname, '..'));
const { seed } = require('../srv/lib/seed-fornitori');
const { MOCK_USER } = require('./helpers/auth');

describe('fornitore odata', () => {
  beforeAll(async () => { await seed(cds); });

  it('GET /contratti/Fornitore returns seeded rows', async () => {
    let total = 0, skip = 0;
    while (true) {
      const res = await GET(`/contratti/Fornitore?$top=1000&$skip=${skip}`, { auth: MOCK_USER });
      expect(res.status).toBe(200);
      const rows = res.data.value;
      total += rows.length;
      if (rows.length < 1000) break;
      skip += 1000;
    }
    expect(total).toBeGreaterThan(4000);
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