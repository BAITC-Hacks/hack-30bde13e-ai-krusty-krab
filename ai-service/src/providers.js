import { setTimeout as delay } from 'node:timers/promises';
import { cached, defaultCacheDir } from './cache.js';
import { extractionJsonSchema, extractionResponse, judgmentJsonSchema, judgmentResponse } from './schema.js';

const failure = message => Object.assign(new Error(message), { status: 502 });

async function postJson(provider, path, body, stage) {
  const timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS || 120_000);
  for (let attempt = 0; attempt < 2; attempt++) {
    provider.signal?.throwIfAborted();
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(provider.signal ? [provider.signal] : [])]);
    let response, data;
    try {
      provider.stats.requests++;
      response = await fetch(`${provider.baseUrl}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify(body), signal,
      });
      data = await response.json();
    } catch (cause) {
      provider.signal?.throwIfAborted();
      const reason = signal.aborted || cause.name === 'TimeoutError'
        ? `timed out after ${timeoutMs / 1000} seconds`
        : cause instanceof SyntaxError ? 'returned invalid JSON' : `did not respond: ${cause.cause?.code || cause.name}`;
      throw failure(`${stage} provider ${reason}`);
    }
    if (response.ok) return data;
    const quota = data?.error?.code === 'insufficient_quota' || /quota|billing/i.test(data?.error?.message || '');
    if (!attempt && !quota && [429, 502, 503, 504].includes(response.status)) {
      const retryAfter = Number(response.headers?.get('retry-after'));
      if (retryAfter > 5) throw failure(`${stage} provider rate limit (HTTP ${response.status}); retry later`);
      await delay(Math.max(1000, (retryAfter || 1) * 1000), undefined, { signal: provider.signal });
      continue;
    }
    const rejectedKey = [401, 403].includes(response.status);
    const detail = typeof data?.error?.message === 'string'
      ? `: ${data.error.message.replaceAll(provider.key, '[redacted]').slice(0, 300)}` : '';
    throw Object.assign(new Error(rejectedKey
      ? `${stage} provider rejected API key (HTTP ${response.status})${detail}`
      : `${stage} provider request failed with HTTP ${response.status}${detail}`), { status: rejectedKey ? 503 : 502 });
  }
}

export class NoLLM {
  async complete() { return null; }
}

export class OpenAILLM {
  constructor({
    key = process.env.LLM_API_KEY,
    model = process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    signal, cacheDir = defaultCacheDir(),
  } = {}) {
    if (!key) throw new Error('LLM_API_KEY is required for LLM_PROVIDER=openai');
    this.key = key; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, '');
    this.signal = signal; this.cacheDir = cacheDir; this.stats = { requests: 0, cacheHits: 0 };
  }

  async complete(kind, system, user) {
    const schema = kind === 'extraction' ? extractionJsonSchema : judgmentJsonSchema;
    const validator = kind === 'extraction' ? extractionResponse : judgmentResponse;
    const body = {
      model: this.model, temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: kind, strict: true, schema } },
    };
    return cached(this, body, value => validator.parse(value), async () => {
      const data = await postJson(this, '/chat/completions', body, `LLM ${kind}`);
      const choice = data.choices?.[0];
      if (choice?.finish_reason === 'length') throw failure(`LLM ${kind}: response was truncated; reduce document batch size`);
      if (choice?.message?.refusal) throw failure(`LLM ${kind}: provider declined the request`);
      if (!choice?.message?.content) throw failure(`LLM ${kind}: empty structured response`);
      try { return validator.parse(JSON.parse(choice.message.content)); }
      catch { throw failure(`LLM ${kind}: response does not match the required JSON schema`); }
    });
  }
}

export class OpenAIEmbeddings {
  constructor({
    key = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY,
    model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    baseUrl = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
    signal, cacheDir = defaultCacheDir(),
  } = {}) {
    if (!key) throw new Error('EMBEDDING_API_KEY or LLM_API_KEY is required for EMBEDDING_PROVIDER=openai');
    this.key = key; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, '');
    this.signal = signal; this.cacheDir = cacheDir; this.stats = { requests: 0, cacheHits: 0 };
  }

  async embed(texts) {
    if (!texts.length) return [];
    const validate = vectors => {
      if (!Array.isArray(vectors) || vectors.length !== texts.length ||
          vectors.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(value))) ||
          vectors.some(vector => vector.length !== vectors[0].length)) {
        throw failure('Embeddings provider returned invalid vectors');
      }
      return vectors;
    };
    return cached(this, texts, validate, async () => {
      const data = await postJson(this, '/embeddings', { model: this.model, input: texts }, 'Embeddings');
      if (!Array.isArray(data.data) || data.data.some(item =>
          !Number.isInteger(item.index) || item.index < 0 || item.index >= texts.length) ||
          new Set(data.data.map(item => item.index)).size !== texts.length) {
        throw failure('Embeddings provider returned invalid indexes');
      }
      return data.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
    });
  }
}

export function llmProvider(options) {
  const name = (process.env.LLM_PROVIDER || 'none').toLowerCase();
  if (name === 'none') return new NoLLM();
  if (name === 'openai') return new OpenAILLM(options);
  throw new Error(`Unsupported LLM_PROVIDER: ${name}`);
}

export function embeddingProvider(options) {
  const name = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();
  if (name === 'openai') return new OpenAIEmbeddings(options);
  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${name}`);
}
