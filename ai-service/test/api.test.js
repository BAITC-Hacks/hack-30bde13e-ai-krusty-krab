import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { app } from '../src/server.js';

test('internal API exposes health and rejects invalid analysis input', async () => {
  const server = app().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const invalid = await fetch(`${base}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before: [], after: [] }),
    });
    assert.equal(invalid.status, 422);
  } finally {
    server.close();
  }
});

test('example documents complete through HTTP and report embedding provider failures', async () => {
  const previous = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL: process.env.EMBEDDING_BASE_URL,
  };
  process.env.LLM_PROVIDER = 'none';
  process.env.EMBEDDING_API_KEY = 'test';
  let failProvider = false;
  const provider = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString()).input;
    response.writeHead(failProvider ? 429 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(failProvider
      ? { error: { message: 'Insufficient quota' } }
      : { data: input.map((text, index) => ({ index, embedding: [text.length + 1, 1] })) }));
  }).listen(0, '127.0.0.1');
  await once(provider, 'listening');
  process.env.EMBEDDING_BASE_URL = `http://127.0.0.1:${provider.address().port}`;
  const server = app().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const documents = await Promise.all(['before', 'after'].map(async side => ({
      id: side, name: `${side}.xlsx`,
      content_base64: (await readFile(new URL(`../../examples/${side}.xlsx`, import.meta.url))).toString('base64'),
    })));
    const url = `http://127.0.0.1:${server.address().port}/analyze`;
    const request = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: [documents[0]], after: [documents[1]] }) });
    const success = await request();
    assert.equal(success.status, 200);
    assert.equal((await success.json()).summary.before_documents, 1);
    failProvider = true;
    const failure = await request();
    assert.equal(failure.status, 502);
    assert.match((await failure.json()).error, /Embeddings provider request failed with HTTP 429: Insufficient quota/);
  } finally {
    server.close();
    provider.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
