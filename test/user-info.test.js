const path = require('path');
const cds = require('@sap/cds');

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn(), sendMessage: jest.fn(), deleteThread: jest.fn(),
  chatJSON: jest.fn(), embeddings: jest.fn()
}));

const { GET } = cds.test(path.join(__dirname, '..'));

describe('/user-info', () => {
  it('reports isUtente true for mario.rossi', async () => {
    const res = await GET('/user-info', { auth: { username: 'mario.rossi@contrattiattivi.it', password: 'test' } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ email: 'mario.rossi@contrattiattivi.it', isUtente: true, isRevisore: false });
  });

  it('reports isRevisore true for revisore@contrattiattivi.it', async () => {
    const res = await GET('/user-info', { auth: { username: 'revisore@contrattiattivi.it', password: 'test' } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ email: 'revisore@contrattiattivi.it', isUtente: false, isRevisore: true });
  });
});
