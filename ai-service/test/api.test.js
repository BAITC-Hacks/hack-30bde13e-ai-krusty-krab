import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
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
