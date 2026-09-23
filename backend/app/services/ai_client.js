import { readFile } from 'node:fs/promises';

const serviceError = message => Object.assign(new Error(message), { publicMessage: message });

export async function analyze(documents, { aiServiceUrl, useMockAi }) {
  if (useMockAi) return { summary: 'Mock analysis completed', findings: [] };

  const input = { before: [], after: [] };
  for (const document of documents) input[document.side.toLowerCase()].push({
    id: document.id,
    name: document.filename,
    content_base64: (await readFile(document.storage_path)).toString('base64'),
  });
  let response;
  try {
    response = await fetch(`${aiServiceUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(600_000)
    });
  } catch (error) {
    throw serviceError(error.name === 'TimeoutError'
      ? 'AI Service не ответил за 600 секунд'
      : `AI Service недоступен по адресу ${aiServiceUrl}. Запустите его или установите USE_MOCK_AI=true`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw serviceError(`AI Service вернул HTTP ${response.status}${typeof body?.error === 'string' ? `: ${body.error}` : ''}`);
  }
  const result = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI Service returned invalid JSON result');
  }
  return result;
}
