import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAIEmbeddings, OpenAILLM } from '../src/providers.js';

test('invalid LLM responses are not cached; successful responses survive a new provider instance', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'provider-cache-'));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let content = '{invalid';
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, async json() { return { choices: [{ message: { content } }] }; } };
  };
  const provider = () => new OpenAILLM({ key: 'test', cacheDir });
  try {
    await assert.rejects(provider().complete('extraction', 'system', 'document'), /LLM extraction: response does not match/);
    content = JSON.stringify({ departments: [], functions: [] });
    await provider().complete('extraction', 'system', 'document');
    const warm = provider();
    assert.deepEqual(await warm.complete('extraction', 'system', 'document'), { departments: [], functions: [] });
    assert.equal(calls, 2);
    assert.equal(warm.stats.cacheHits, 1);
    await provider().complete('extraction', 'system', 'changed document');
    assert.equal(calls, 3);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(new OpenAILLM({ key: 'test', cacheDir, signal: controller.signal }).complete('extraction', 'system', 'document'), { name: 'AbortError' });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('provider authentication failure explains the missing analysis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, async json() { return {}; } });
  try {
    await assert.rejects(new OpenAIEmbeddings({ key: 'test', cacheDir: '' }).embed(['test']), error => {
      assert.equal(error.status, 503);
      assert.match(error.message, /Embeddings provider rejected API key \(HTTP 401\)/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failure reports the upstream reason to the analysis caller', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 429,
    async json() { return { error: { message: 'Insufficient quota' } }; },
  });
  try {
    await assert.rejects(new OpenAIEmbeddings({ key: 'test', cacheDir: '' }).embed(['test']), error => {
      assert.equal(error.status, 502);
      assert.match(error.message, /Embeddings provider request failed with HTTP 429: Insufficient quota/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider timeout identifies the failing stage and duration', async () => {
  const originalFetch = globalThis.fetch;
  const previousTimeout = process.env.PROVIDER_TIMEOUT_MS;
  process.env.PROVIDER_TIMEOUT_MS = '90000';
  globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
  try {
    await assert.rejects(new OpenAIEmbeddings({ key: 'test', cacheDir: '' }).embed(['test']), error => {
      assert.equal(error.status, 502);
      assert.equal(error.message, 'Embeddings provider timed out after 90 seconds');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousTimeout === undefined) delete process.env.PROVIDER_TIMEOUT_MS;
    else process.env.PROVIDER_TIMEOUT_MS = previousTimeout;
  }
});
