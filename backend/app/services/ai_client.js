import { readFile } from 'node:fs/promises';

const mime = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export async function analyze(analysisId, documents, { aiServiceUrl, useMockAi }) {
  if (useMockAi) return { summary: 'Mock analysis completed', findings: [] };

  const form = new FormData();
  form.set('analysis_id', analysisId);
  for (const document of documents) {
    const content = await readFile(document.storage_path);
    form.append(document.side.toLowerCase(), new Blob([content], { type: mime[document.file_type] }), document.filename);
  }
  const response = await fetch(`${aiServiceUrl.replace(/\/$/, '')}/analyze`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`AI Service returned HTTP ${response.status}`);
  const result = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI Service returned invalid JSON result');
  }
  return result;
}
