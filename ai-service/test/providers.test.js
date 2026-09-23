import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIEmbeddings } from '../src/providers.js';

test('provider authentication failure explains the missing analysis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, async json() { return {}; } });
  try {
    await assert.rejects(new OpenAIEmbeddings({ key: 'test' }).embed(['test']), error => {
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
    await assert.rejects(new OpenAIEmbeddings({ key: 'test' }).embed(['test']), error => {
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
    await assert.rejects(new OpenAIEmbeddings({ key: 'test' }).embed(['test']), error => {
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
