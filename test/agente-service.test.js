const path = require('path');
const cds = require('@sap/cds');

process.env.ASSISTANT_ID = process.env.ASSISTANT_ID || 'mock-assistant';

jest.mock('../srv/modules/openai-module', () => ({
  openThread: jest.fn().mockResolvedValue('mock-thread-123'),
  sendMessage: jest.fn().mockResolvedValue(['Questa è una risposta simulata.']),
  deleteThread: jest.fn().mockResolvedValue('deleted')
}));

const { GET, POST } = cds.test(path.join(__dirname, '..'));
const { MOCK_USER } = require('./helpers/auth');

describe('agenteService', () => {
  it('exposes /agente/$metadata', async () => {
    const res = await GET('/agente/$metadata', { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data).toContain('openThread');
    expect(res.data).toContain('sendMessage');
    expect(res.data).toContain('deleteThread');
  });

  it('openThread returns a thread ID', async () => {
    const res = await POST('/agente/openThread', {}, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(typeof res.data.value).toBe('string');
  });

  it('sendMessage returns an array of replies (mocked)', async () => {
    const threadId = 'mock-thread-456';
    const res = await POST('/agente/sendMessage', { message: 'Ciao', thread_id: threadId }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.value)).toBe(true);
  });

  it('deleteThread returns deleted confirmation', async () => {
    const res = await POST('/agente/deleteThread', { thread_id: 'mock-thread-789' }, { auth: MOCK_USER });
    expect(res.status).toBe(200);
    expect(res.data.value).toBe('deleted');
  });
});
