import { extractionJsonSchema, extractionResponse, judgmentJsonSchema, judgmentResponse } from './schema.js';

async function postJson(url, key, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Provider request failed with HTTP ${response.status}`);
  return response.json();
}

export class NoLLM {
  async complete() { return null; }
}

export class OpenAILLM {
  constructor({
    key = process.env.LLM_API_KEY,
    model = process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  } = {}) {
    if (!key) throw new Error('LLM_API_KEY is required for LLM_PROVIDER=openai');
    this.key = key; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async complete(kind, system, user) {
    const schema = kind === 'extraction' ? extractionJsonSchema : judgmentJsonSchema;
    const validator = kind === 'extraction' ? extractionResponse : judgmentResponse;
    const data = await postJson(`${this.baseUrl}/chat/completions`, this.key, {
      model: this.model, temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: kind, strict: true, schema } },
    });
    const message = data.choices?.[0]?.message;
    if (!message?.content || message.refusal) throw new Error('LLM did not return structured output');
    return validator.parse(JSON.parse(message.content));
  }
}

export class OpenAIEmbeddings {
  constructor({
    key = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY,
    model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    baseUrl = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
  } = {}) {
    if (!key) throw new Error('EMBEDDING_API_KEY or LLM_API_KEY is required for EMBEDDING_PROVIDER=openai');
    this.key = key; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async embed(texts) {
    if (!texts.length) return [];
    const data = await postJson(`${this.baseUrl}/embeddings`, this.key, { model: this.model, input: texts });
    const vectors = data.data?.sort((a, b) => a.index - b.index).map(item => item.embedding);
    if (!Array.isArray(vectors) || vectors.length !== texts.length ||
        vectors.some(vector => !Array.isArray(vector) || vector.some(value => !Number.isFinite(value)))) {
      throw new Error('Embedding provider returned invalid vectors');
    }
    return vectors;
  }
}

export function llmProvider() {
  const name = (process.env.LLM_PROVIDER || 'none').toLowerCase();
  if (name === 'none') return new NoLLM();
  if (name === 'openai') return new OpenAILLM();
  throw new Error(`Unsupported LLM_PROVIDER: ${name}`);
}

export function embeddingProvider() {
  const name = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();
  if (name === 'openai') return new OpenAIEmbeddings();
  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${name}`);
}
