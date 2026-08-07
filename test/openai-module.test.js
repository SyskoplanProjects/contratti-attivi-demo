const mockCreateCompletion = jest.fn();
const mockCreateEmbedding = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreateCompletion } },
    embeddings: { create: mockCreateEmbedding }
  }));
});

process.env.OPENAI_API_KEY = 'test-key';
const { chatJSON, embeddings } = require('../srv/modules/openai-module');

describe('openai-module: chatJSON', () => {
  beforeEach(() => { mockCreateCompletion.mockReset(); });

  it('parses the JSON content of the assistant reply', async () => {
    mockCreateCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"clausole":[{"numero":1,"titolo":"Oggetto","testo":"Testo."}]}' } }]
    });

    const result = await chatJSON('system prompt', 'user prompt');

    expect(result.clausole).toHaveLength(1);
    expect(result.clausole[0].titolo).toBe('Oggetto');
    expect(mockCreateCompletion).toHaveBeenCalledWith(expect.objectContaining({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' }
      ]
    }));
  });
});

describe('openai-module: embeddings', () => {
  beforeEach(() => { mockCreateEmbedding.mockReset(); });

  it('returns one vector per input text, in order', async () => {
    mockCreateEmbedding.mockResolvedValue({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }]
    });

    const result = await embeddings(['testo A', 'testo B']);

    expect(result).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(mockCreateEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      input: ['testo A', 'testo B']
    }));
  });

  it('sostituisce stringhe vuote/whitespace con un placeholder, senza rompere l\'allineamento indice', async () => {
    mockCreateEmbedding.mockResolvedValue({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 0, 0] }, { embedding: [0, 1, 0] }]
    });

    const result = await embeddings(['testo A', '', 'testo B']);

    expect(result).toHaveLength(3);
    expect(mockCreateEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      input: ['testo A', ' ', 'testo B']
    }));
  });

  it('tratta anche whitespace-only e null/undefined come vuoti', async () => {
    mockCreateEmbedding.mockResolvedValue({
      data: [{ embedding: [1, 0, 0] }, { embedding: [0, 0, 0] }, { embedding: [0, 0, 0] }]
    });

    await embeddings(['testo A', '   ', null]);

    expect(mockCreateEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      input: ['testo A', ' ', ' ']
    }));
  });
});

describe('openai-module: API key resolution (destination first, env fallback)', () => {
  const openaiCtor = require('openai');
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.dontMock('@sap-cloud-sdk/connectivity');
  });

  function mockDestination(result) {
    const mockGetDestination = result instanceof Error
      ? jest.fn().mockRejectedValue(result)
      : jest.fn().mockResolvedValue(result);
    jest.doMock('@sap-cloud-sdk/connectivity', () => ({ getDestination: mockGetDestination }));
    return mockGetDestination;
  }

  it('uses the API key from the BTP destination when present (indipendently of NODE_ENV)', async () => {
    const mockGetDestination = mockDestination({ originalProperties: { apiKey: 'dest-key' } });
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '{"clausole":[]}' } }] });

    let freshModule;
    jest.isolateModules(() => {
      freshModule = require('../srv/modules/openai-module');
    });

    await freshModule.chatJSON('sys', 'usr');

    expect(mockGetDestination).toHaveBeenCalledWith({ destinationName: 'contratti-attivi-openai' });
    expect(openaiCtor).toHaveBeenLastCalledWith({ apiKey: 'dest-key' });
  });

  it('falls back to OPENAI_API_KEY env when the destination has no apiKey property', async () => {
    mockDestination({ originalProperties: {} });
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '{"clausole":[]}' } }] });

    let freshModule;
    jest.isolateModules(() => {
      freshModule = require('../srv/modules/openai-module');
    });

    await freshModule.chatJSON('sys', 'usr');

    expect(openaiCtor).toHaveBeenLastCalledWith({ apiKey: 'test-key' });
  });

  it('falls back to OPENAI_API_KEY env when getDestination throws', async () => {
    mockDestination(new Error('no destination service bound'));
    mockCreateCompletion.mockResolvedValue({ choices: [{ message: { content: '{"clausole":[]}' } }] });

    let freshModule;
    jest.isolateModules(() => {
      freshModule = require('../srv/modules/openai-module');
    });

    await freshModule.chatJSON('sys', 'usr');

    expect(openaiCtor).toHaveBeenLastCalledWith({ apiKey: 'test-key' });
  });

  it('throws a clear error when neither destination nor env provide an API key', async () => {
    mockDestination({ originalProperties: {} });
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      let freshModule;
      jest.isolateModules(() => {
        freshModule = require('../srv/modules/openai-module');
      });
      await expect(freshModule.chatJSON('sys', 'usr')).rejects.toThrow(/OPENAI_API_KEY environment variable not set/);
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
