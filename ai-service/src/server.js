import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { analyzeRequest } from './schema.js';
import { analyze } from './analysis.js';

function send(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) {
      const error = new Error('Request exceeds 100 MB');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
}

export function app() {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      send(response, 200, { status: 'ok' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/analyze') {
      send(response, 404, { error: 'Not found' });
      return;
    }
    const controller = new AbortController();
    const requestId = randomUUID();
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      const input = analyzeRequest.parse(await readJson(request));
      send(response, 200, await analyze(input, { signal: controller.signal,
        onProgress: progress => console.log(JSON.stringify({ requestId, ...progress })) }));
    } catch (error) {
      controller.abort();
      console.error(JSON.stringify({ requestId, error: error.status ? error.message : error.name }));
      if (response.destroyed) return;
      if (error instanceof ZodError) send(response, 422, { error: 'Invalid request or result schema', details: error.issues });
      else if (error.status) send(response, error.status, { error: error.message });
      else if (/invalid base64|file must be|cannot parse|supported formats/.test(error.message)) {
        send(response, 422, { error: error.message });
      } else if (/API_KEY is required/.test(error.message)) {
        send(response, 503, { error: error.message });
      } else {
        console.error(error);
        send(response, 502, { error: 'Analysis provider or pipeline failed' });
      }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 8001);
  app().listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`AI Service listening on ${process.env.HOST || '127.0.0.1'}:${port}`);
  });
}
