import { readFile } from 'node:fs/promises';

export async function analyze(documents, { aiServiceUrl, useMockAi }) {
  if (useMockAi) return { summary: 'Mock analysis completed', findings: [] };

  const input = { before: [], after: [] };
  for (const document of documents) input[document.side.toLowerCase()].push({
    id: document.id,
    name: document.filename,
    content_base64: (await readFile(document.storage_path)).toString('base64'),
  });
  const response = await fetch(`${aiServiceUrl.replace(/\/$/, '')}/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`AI Service returned HTTP ${response.status}`);
  const result = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI Service returned invalid JSON result');
  }
  return result;
}
