import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { buildApp } from '../app/main.js';

const pdf = new Blob(['%PDF-1.7\nexample'], { type: 'application/pdf' });
const office = new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])]);

test('upload, AI handoff, evidence preservation, failure and mock flow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hackalem-backend-'));
  let failAi = false;
  let received = '';
  const evidence = { document: 'before.pdf', page: 3, section: '2.1', text: 'Исходная обязанность' };
  const aiResult = { summary: 'Changes found', findings: [{ type: 'lost_function', evidence: [evidence] }], extra: { source: 'AI' } };
  const ai = createServer(async (req, res) => {
    received = '';
    for await (const chunk of req) received += chunk.toString('latin1');
    res.writeHead(failAi ? 500 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(failAi ? { error: 'unavailable' } : aiResult));
  });
  await new Promise(resolve => ai.listen(0, '127.0.0.1', resolve));
  const app = await buildApp({
    databaseUrl: join(dir, 'app.sqlite'), uploadDir: join(dir, 'uploads'),
    aiServiceUrl: `http://127.0.0.1:${ai.address().port}`, useMockAi: false,
    corsOrigins: 'http://localhost:5173', logger: false
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const json = async (path, options) => {
    const response = await fetch(base + path, options);
    return [response.status, response.status === 204 ? null : await response.json()];
  };
  const upload = async (id, side, filename) => {
    const form = new FormData();
    form.set('side', side);
    form.set('file', pdf, filename);
    return json(`/api/analyses/${id}/documents`, { method: 'POST', body: form });
  };

  try {
    assert.deepEqual(await json('/health'), [200, { status: 'ok' }]);
    assert.equal((await fetch(base + '/health', { headers: { origin: 'http://localhost:5173' } })).headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal((await fetch(base + '/docs/')).status, 200);
    const [createdStatus, analysis] = await json('/api/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test' })
    });
    assert.equal(createdStatus, 201);
    assert.equal((await json(`/api/analyses/${analysis.id}/run`, { method: 'POST' }))[0], 409);
    assert.equal((await upload(analysis.id, 'before', 'bad.txt'))[0], 400);
    assert.equal((await upload(analysis.id, 'wrong', 'wrong.pdf'))[0], 400);
    assert.equal((await upload(analysis.id, 'before', 'before.pdf'))[0], 201);
    assert.equal((await upload(analysis.id, 'after', 'after.pdf'))[0], 201);
    assert.equal((await json(`/api/analyses/${analysis.id}/documents`))[1].length, 2);
    assert.equal((await json(`/api/analyses/${analysis.id}/run`, { method: 'POST' }))[1].status, 'COMPLETED');
    assert.match(received, /name="before"/);
    assert.match(received, /name="after"/);
    assert.deepEqual((await json(`/api/analyses/${analysis.id}/result`))[1], aiResult);
    failAi = true;
    assert.equal((await json(`/api/analyses/${analysis.id}/run`, { method: 'POST' }))[0], 502);
    assert.equal((await json(`/api/analyses/${analysis.id}`))[1].status, 'FAILED');
    assert.equal((await json(`/api/analyses/${analysis.id}/result`))[0], 409);
    assert.equal((await json(`/api/analyses/${analysis.id}`, { method: 'DELETE' }))[0], 204);
    assert.equal((await json(`/api/analyses/${analysis.id}`))[0], 404);

    const mock = await buildApp({ databaseUrl: join(dir, 'mock.sqlite'), uploadDir: join(dir, 'mock-uploads'), useMockAi: true, logger: false });
    try {
      await mock.listen({ host: '127.0.0.1', port: 0 });
      const mockBase = `http://127.0.0.1:${mock.server.address().port}`;
      const created = await fetch(mockBase + '/api/analyses', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mock' })
      });
      const id = (await created.json()).id;
      for (const side of ['before', 'after']) {
        const form = new FormData();
        form.set('side', side);
        form.set('file', office, `${side}.${side === 'before' ? 'docx' : 'xlsx'}`);
        const response = await fetch(`${mockBase}/api/analyses/${id}/documents`, { method: 'POST', body: form });
        assert.equal(response.status, 201);
      }
      const run = await fetch(`${mockBase}/api/analyses/${id}/run`, { method: 'POST' });
      assert.equal((await run.json()).status, 'COMPLETED');
      const result = await fetch(`${mockBase}/api/analyses/${id}/result`);
      assert.deepEqual(await result.json(), { summary: 'Mock analysis completed', findings: [] });
    } finally { await mock.close(); }
  } finally {
    await app.close();
    await new Promise(resolve => ai.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
