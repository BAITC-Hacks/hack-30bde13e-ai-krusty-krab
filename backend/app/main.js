import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { storeDocument } from './services/storage.js';
import { analyze } from './services/ai_client.js';

const idParam = { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } };
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export async function buildApp(config = {}) {
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL ?? './data/app.sqlite';
  const uploadDir = resolve(config.uploadDir ?? process.env.UPLOAD_DIR ?? './data/uploads');
  const aiServiceUrl = config.aiServiceUrl ?? process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
  const useMockAi = config.useMockAi ?? process.env.USE_MOCK_AI?.toLowerCase() === 'true';
  const corsOrigins = config.corsOrigins ?? process.env.CORS_ORIGINS ?? '';
  const app = Fastify({ logger: config.logger ?? true });
  const db = openDb(databaseUrl);
  // One backend process owns this SQLite database and its running analyses.
  db.recoverInterrupted();
  const activeRuns = new Map();
  app.addHook('onClose', async () => {
    for (const { controller } of activeRuns.values()) controller.abort();
    await Promise.allSettled([...activeRuns.values()].map(run => run.job));
    db.close();
  });

  await app.register(cors, { origin: corsOrigins ? corsOrigins.split(',').map(x => x.trim()) : false });
  await app.register(multipart, { limits: { files: 1, fields: 1, parts: 2, fileSize: 20 * 1024 * 1024 } });
  await app.register(swagger, { openapi: { info: { title: 'Hackalem Analysis API', version: '1.0.0' } } });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) request.log.error(error);
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : error.message });
  });

  const analysisById = id => {
    const row = db.getAnalysis(id);
    if (!row) throw fail(404, 'Analysis not found');
    return row;
  };

  app.get('/health', { schema: { tags: ['Health'], response: { 200: { type: 'object', properties: { status: { type: 'string' } } } } } }, () => ({ status: 'ok' }));

  app.post('/api/analyses', {
    schema: { tags: ['Analyses'], body: { type: 'object', required: ['name'], additionalProperties: false,
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } } } }
  }, (request, reply) => {
    const name = request.body.name.trim();
    if (!name) throw fail(400, 'Name must not be blank');
    const id = randomUUID();
    return reply.code(201).send(db.createAnalysis(id, name));
  });

  app.get('/api/analyses', { schema: { tags: ['Analyses'] } }, () => db.listAnalyses());

  app.get('/api/analyses/:id', { schema: { ...idParam, tags: ['Analyses'] } }, request =>
    analysisById(request.params.id));

  app.delete('/api/analyses/:id', { schema: { ...idParam, tags: ['Analyses'] } }, async (request, reply) => {
    const analysis = analysisById(request.params.id);
    if (analysis.status === 'PROCESSING') throw fail(409, 'Analysis is processing');
    db.deleteAnalysis(analysis.id);
    await rm(resolve(uploadDir, analysis.id), { recursive: true, force: true });
    return reply.code(204).send();
  });

  app.post('/api/analyses/:id/documents', {
    schema: { ...idParam, tags: ['Documents'], consumes: ['multipart/form-data'],
      body: { type: 'object', required: ['side', 'file'], properties: {
        side: { type: 'string', enum: ['before', 'after'] }, file: { type: 'string', format: 'binary' }
      } } }, attachValidation: true
  }, async (request, reply) => {
    const analysis = analysisById(request.params.id);
    if (analysis.status === 'PROCESSING') throw fail(409, 'Analysis is processing');
    if (!request.isMultipart()) throw fail(415, 'Expected multipart/form-data');
    let side;
    let file;
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname !== 'side') throw fail(400, 'Expected side field');
          side = part.value;
        } else {
          if (part.fieldname !== 'file') { part.file.resume(); throw fail(400, 'Expected file field'); }
          file = await storeDocument(part, analysis.id, uploadDir);
        }
      }
      if (!['before', 'after'].includes(side) || !file) throw fail(400, 'One file and side=before|after are required');
      const id = randomUUID();
      return reply.code(201).send(db.addDocument(id, analysis.id, file, side.toUpperCase()));
    } catch (error) {
      if (file) await rm(file.storage_path, { force: true });
      throw error;
    }
  });

  app.get('/api/analyses/:id/documents', { schema: { ...idParam, tags: ['Documents'] } }, request => {
    analysisById(request.params.id);
    return db.listDocuments(request.params.id);
  });

  app.post('/api/analyses/:id/run', { schema: { ...idParam, tags: ['Analyses'] } }, async (request, reply) => {
    const analysis = analysisById(request.params.id);
    if (analysis.status === 'PROCESSING') throw fail(409, 'Analysis is processing');
    const documents = db.listDocuments(analysis.id);
    if (!documents.some(x => x.side === 'BEFORE') || !documents.some(x => x.side === 'AFTER')) {
      throw fail(409, 'At least one BEFORE and one AFTER document are required');
    }
    db.beginRun(analysis.id);
    const controller = new AbortController();
    const job = (async () => {
      try {
        const result = await analyze(documents, { aiServiceUrl, useMockAi, signal: controller.signal });
        return { analysis: db.completeRun(analysis.id, result) };
      } catch (error) {
        request.log.error(error);
        const message = error.publicMessage ?? 'AI Service analysis failed';
        db.failRun(analysis.id, message);
        return { error: message };
      } finally {
        activeRuns.delete(analysis.id);
      }
    })();
    activeRuns.set(analysis.id, { controller, job });
    // Web clients acknowledge the start and poll; existing Telegram clients may wait for completion.
    if (request.query.background === 'true') return reply.code(202).send(db.getAnalysis(analysis.id));
    const outcome = await job;
    return outcome.error ? reply.code(502).send({ error: outcome.error }) : reply.send(outcome.analysis);
  });

  app.get('/api/analyses/:id/result', { schema: { ...idParam, tags: ['Results'] } }, request => {
    const analysis = analysisById(request.params.id);
    if (analysis.status !== 'COMPLETED') throw fail(409, 'Analysis result is not ready');
    const result = db.getResult(analysis.id);
    if (!result) throw fail(404, 'Analysis result not found');
    return result;
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await buildApp();
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
