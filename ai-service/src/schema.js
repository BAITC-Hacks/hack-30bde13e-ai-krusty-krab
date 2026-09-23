import { z } from 'zod';

const document = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  content_base64: z.string().min(1),
}).strict();

export const analyzeRequest = z.object({
  before: z.array(document).min(1),
  after: z.array(document).min(1),
}).strict().refine(value => {
  const ids = [...value.before, ...value.after].map(item => item.id);
  return ids.length === new Set(ids).size;
}, 'Document ids must be unique across BEFORE and AFTER');

export const extractionResponse = z.object({
  departments: z.array(z.object({ fragment_id: z.string(), quote: z.string() }).strict()),
  functions: z.array(z.object({ fragment_id: z.string(), quote: z.string(), department_name: z.string() }).strict()),
}).strict();

export const judgmentResponse = z.object({
  relation: z.enum(['EQUIVALENT', 'PARTIAL', 'UNRELATED']),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
}).strict();

const source = z.object({
  document_id: z.string(), document_name: z.string(), fragment_id: z.string(),
  page: z.number().int().positive().nullable(), sheet: z.string().nullable(),
  section: z.string().nullable(), paragraph: z.number().int().positive().nullable(),
  text: z.string(),
}).strict();
const fragment = z.object({
  id: z.string(), document_id: z.string(), document_name: z.string(), side: z.enum(['BEFORE', 'AFTER']),
  text: z.string(), kind: z.enum(['heading', 'body', 'table']),
  page: z.number().int().positive().nullable(), sheet: z.string().nullable(),
  section: z.string().nullable(), paragraph: z.number().int().positive().nullable(),
  department_hint: z.string().nullable(),
}).strict();
const department = z.object({ id: z.string(), side: z.enum(['BEFORE', 'AFTER']),
  name: z.string(), parent: z.string().nullable(), source }).strict();
const fingerprint = z.object({
  action: z.string(), object: z.string(),
  role: z.enum(['execute', 'control', 'approve', 'audit', 'coordinate', 'create', 'operate', 'other']),
  scope: z.string(),
}).strict();
const func = z.object({ id: z.string(), side: z.enum(['BEFORE', 'AFTER']),
  department: z.string(), text: z.string(), normalized_text: z.string(), fingerprint, source }).strict();
const departmentMatch = z.object({
  before_id: z.string().nullable(), after_id: z.string().nullable(),
  relation: z.enum(['UNCHANGED', 'RENAMED', 'TRANSFORMED', 'CREATED', 'REMOVED', 'UNCERTAIN']),
  confidence: z.number().min(0).max(1), explanation: z.string(),
}).strict();
const functionMatch = z.object({
  before_id: z.string(), after_id: z.string().nullable(),
  relation: z.enum(['EQUIVALENT', 'MOVED', 'PARTIAL', 'MISSING', 'UNRELATED']),
  confidence: z.number().min(0).max(1), similarity: z.number().min(-1).max(1), explanation: z.string(),
}).strict();
const finding = z.object({
  id: z.string(), type: z.enum(['FUNCTION_LOSS', 'FUNCTION_DUPLICATION', 'RESPONSIBILITY_CONFLICT']),
  severity: z.enum(['low', 'medium', 'high']), confidence: z.number().min(0).max(1),
  title: z.string(), explanation: z.string(), evidence: z.array(source).min(1),
  function_ids: z.array(z.string()).min(1),
}).strict();

export const analysisResult = z.object({
  summary: z.object({
    before_documents: z.number().int(), after_documents: z.number().int(),
    before_departments: z.number().int(), after_departments: z.number().int(),
    before_functions: z.number().int(), after_functions: z.number().int(),
    findings: z.number().int(), limitations: z.array(z.string()),
  }).strict(),
  departments: z.array(department), functions: z.array(func),
  fragments: z.array(fragment),
  department_matches: z.array(departmentMatch), function_matches: z.array(functionMatch),
  findings: z.array(finding),
}).strict();

// OpenAI Structured Outputs accepts this restricted JSON Schema subset.
export const extractionJsonSchema = {
  type: 'object', additionalProperties: false, required: ['departments', 'functions'],
  properties: {
    departments: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['fragment_id', 'quote'], properties: { fragment_id: { type: 'string' }, quote: { type: 'string' } } } },
    functions: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['fragment_id', 'quote', 'department_name'], properties: {
        fragment_id: { type: 'string' }, quote: { type: 'string' }, department_name: { type: 'string' },
      } } },
  },
};

export const judgmentJsonSchema = {
  type: 'object', additionalProperties: false, required: ['relation', 'confidence', 'explanation'],
  properties: {
    relation: { type: 'string', enum: ['EQUIVALENT', 'PARTIAL', 'UNRELATED'] },
    confidence: { type: 'number' }, explanation: { type: 'string' },
  },
};
