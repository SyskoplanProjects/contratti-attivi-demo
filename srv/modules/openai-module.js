const OpenAI = require('openai');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

let _client = null;

async function _resolveApiKey() {
  if (process.env.NODE_ENV === 'production') {
    const destination = await getDestination({ destinationName: 'contratti-attivi-openai' });
    const apiKey = destination && destination.originalProperties && destination.originalProperties.apiKey;
    if (!apiKey) throw new Error('apiKey property missing on contratti-attivi-openai destination');
    return apiKey;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable not set');
  return apiKey;
}

async function getClient() {
  if (!_client) {
    const apiKey = await _resolveApiKey();
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

async function openThread() {
  const client = await getClient();
  const thread = await client.beta.threads.create();
  return thread.id;
}

async function deleteThread(threadId) {
  const client = await getClient();
  await client.beta.threads.delete(threadId);
  return 'deleted';
}

async function sendMessage(message, threadId, assistantId) {
  const openai = await getClient();

  await _cancelActiveRuns(openai, threadId);

  await openai.beta.threads.messages.create(threadId, { role: 'user', content: message });

  const run = await openai.beta.threads.runs.create(threadId, { assistant_id: assistantId });
  return _pollRun(openai, threadId, run.id);
}

async function _cancelActiveRuns(openai, threadId) {
  const runs = await openai.beta.threads.runs.list(threadId, { limit: 5 });
  for (const run of runs.data) {
    if (['queued', 'in_progress', 'requires_action'].includes(run.status)) {
      try {
        await openai.beta.threads.runs.cancel(run.id, { thread_id: threadId });
      } catch (e) {
        console.warn('[openai] cancel run ' + run.id + ' failed: ' + e.message);
      }
    }
  }
}

async function _pollRun(openai, threadId, runId) {
  let run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });

  while (run.status === 'queued' || run.status === 'in_progress' || run.status === 'requires_action') {
    if (run.status === 'requires_action') {
      const { tool_calls } = run.required_action.submit_tool_outputs;
      delete require.cache[require.resolve('./db-operation')];
      const { manageFunction } = require('./db-operation');
      const outputs = await Promise.all(tool_calls.map(async tc => ({
        tool_call_id: tc.id,
        output: await manageFunction(tc.function.name, tc.function.arguments)
      })));
      await openai.beta.threads.runs.submitToolOutputs(runId, { thread_id: threadId, tool_outputs: outputs });
    }
    await _sleep(500);
    run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
  }

  if (run.status !== 'completed') {
    throw new Error(`Run terminated with status: ${run.status}`);
  }

  const messages = await openai.beta.threads.messages.list(threadId);
  return messages.data
    .filter(m => m.role === 'assistant' && m.run_id === runId)
    .slice(0, 1)
    .flatMap(m => m.content.filter(c => c.type === 'text').map(c => c.text.value));
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function chatJSON(systemPrompt, userPrompt) {
  const client = await getClient();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  return JSON.parse(completion.choices[0].message.content);
}

async function chat(systemPrompt, userPrompt) {
  const client = await getClient();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  return completion.choices[0].message.content;
}

async function embeddings(testi) {
  const client = await getClient();
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: testi
  });
  return response.data.map(d => d.embedding);
}

module.exports = { openThread, sendMessage, deleteThread, chatJSON, chat, embeddings };
