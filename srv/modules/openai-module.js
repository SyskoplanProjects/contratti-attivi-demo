const OpenAI = require('openai');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

let _client = null;

async function _resolveApiKey() {
  // 1) Destination BTP se disponibile (API key esposta in originalProperties.apiKey).
  try {
    const destination = await getDestination({ destinationName: 'contratti-attivi-openai' });
    const apiKey = destination && destination.originalProperties && destination.originalProperties.apiKey;
    if (apiKey) return apiKey;
  } catch (e) {
    console.warn('[openai] getDestination fallita, fallback a OPENAI_API_KEY: ' + e.message);
  }
  // 2) Fallback su .env / variabili locali.
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

// text-embedding-3-small rifiuta input oltre 8191 token (400 "maximum input length").
// Rapporto caratteri/token osservato su testo giuridico italiano reale è più basso del
// previsto (~2 char/token, non ~3-4 come per l'inglese semplice): un tentativo precedente
// di troncare a 24000 caratteri a monte (allegato-classifier.js) ha comunque superato il
// limite su un input reale. Guardia qui, nel punto unico da cui passano tutte le chiamate
// embeddings(), così ogni chiamante (batch di clausole, esempi, classificazione) è protetto
// senza dover applicare lo stesso taglio in ciascun punto di chiamata.
const MAX_CHARS_PER_INPUT = 16000;

async function embeddings(testi) {
  const client = await getClient();
  // L'API rifiuta stringhe vuote nell'array `input` (400 "input cannot be an empty string"):
  // capita con clausole/testi vuoti prodotti dallo split di documenti reali (es. intestazioni
  // senza corpo). Placeholder neutro per non rompere l'array di ritorno, su cui tutti i
  // chiamanti assumono testi[i] <-> vettori[i] allineati per indice.
  const testiSicuri = testi.map(t => {
    const s = (t && String(t).trim()) ? String(t) : ' ';
    return s.length > MAX_CHARS_PER_INPUT ? s.slice(0, MAX_CHARS_PER_INPUT) : s;
  });
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: testiSicuri
  });
  return response.data.map(d => d.embedding);
}

module.exports = { openThread, sendMessage, deleteThread, chatJSON, chat, embeddings };
