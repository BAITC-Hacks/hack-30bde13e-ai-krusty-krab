import { readFile } from 'node:fs/promises';

const serviceError = message => Object.assign(new Error(message), { publicMessage: message });

export async function analyze(documents, { aiServiceUrl, useMockAi, signal }) {
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
      body: JSON.stringify(input), signal: AbortSignal.any([AbortSignal.timeout(600_000), ...(signal ? [signal] : [])])
    });
  } catch (error) {
    if (signal?.aborted) throw serviceError('Анализ прерван при остановке backend. Можно повторить запуск.');
    throw serviceError(error.name === 'TimeoutError'
      ? 'AI Service не ответил за 600 секунд'
      : `AI Service недоступен по адресу ${aiServiceUrl}. Запустите его или установите USE_MOCK_AI=true`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw serviceError(`AI Service вернул HTTP ${response.status}${typeof body?.error === 'string' ? `: ${body.error}` : ''}`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw serviceError('AI Service прервал передачу результата или вернул некорректный JSON.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI Service returned invalid JSON result');
  }
  return result;
}
