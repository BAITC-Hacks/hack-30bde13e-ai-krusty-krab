import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIEmbeddings } from '../src/providers.js';

test('provider authentication failure explains the missing analysis', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(new OpenAIEmbeddings({ key: 'test' }).embed(['test']), error => {
      assert.equal(error.status, 503);
      assert.match(error.message, /Provider rejected API key \(HTTP 401\)/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
