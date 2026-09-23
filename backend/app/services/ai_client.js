import { readFile } from 'node:fs/promises';

export async function analyze(documents, { aiServiceUrl, useMockAi }) {
  if (useMockAi) return { summary: 'Mock analysis completed', findings: [] };

  const body = { before: [], after: [] };
  for (const document of documents) {
    const content = await readFile(document.storage_path);
    body[document.side.toLowerCase()].push({
      id: document.id, name: document.filename, content_base64: content.toString('base64')
    });
  }
  const response = await fetch(`${aiServiceUrl.replace(/\/$/, '')}/analyze`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`AI Service returned HTTP ${response.status}`);
  const result = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI Service returned invalid JSON result');
  }
  return result;
}
