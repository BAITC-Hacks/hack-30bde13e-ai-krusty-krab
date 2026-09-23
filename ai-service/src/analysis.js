import { analysisResult } from './schema.js';
import { parseDocument } from './parsing.js';
import { extract, stableId } from './extraction.js';
import { embeddingProvider, llmProvider } from './providers.js';

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) throw new Error('Embedding vectors have incompatible dimensions');
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const length = Math.hypot(...a) * Math.hypot(...b);
  return length ? dot / length : 0;
}

function compatible(a, b) {
  return a === b || a === 'other' || b === 'other' ||
    (['execute', 'operate'].includes(a) && ['execute', 'operate'].includes(b));
}

function conflict(a, b) {
  return ['execute:control', 'create:approve', 'operate:audit']
    .some(pair => pair === `${a}:${b}` || pair === `${b}:${a}`);
}

function departmentMatches(before, after, functions, vectors) {
  const matches = [];
  const available = new Set(after.map(item => item.id));
  for (const old of before) {
    const oldFunctions = functions.filter(item => item.department === old.id);
    const candidates = after.filter(item => available.has(item.id)).map(next => {
      const newFunctions = functions.filter(item => item.department === next.id);
      const nameSimilarity = cosine(vectors.get(old.id), vectors.get(next.id));
      const overlap = Math.max(0, ...oldFunctions.flatMap(a => newFunctions.map(b =>
        cosine(vectors.get(a.id), vectors.get(b.id)))));
      const score = oldFunctions.length && newFunctions.length ?
        0.6 * nameSimilarity + 0.4 * overlap : nameSimilarity;
      return { next, score, nameSimilarity, overlap };
    }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) {
      matches.push({ before_id: old.id, after_id: null,
        relation: after.length ? 'REMOVED' : 'UNCERTAIN', confidence: after.length ? 0.8 : 0.5,
        explanation: after.length ? 'Подразделение не обнаружено среди AFTER подразделений.' :
          'AFTER подразделения не извлечены; сопоставление ненадёжно.' });
      continue;
    }
    let relation;
    if (old.name.toLowerCase() === best.next.name.toLowerCase()) relation = 'UNCHANGED';
    else if (best.overlap >= 0.72 && best.nameSimilarity >= 0.65) relation = 'RENAMED';
    else if (best.overlap >= 0.78 && best.nameSimilarity >= 0.45) relation = 'TRANSFORMED';
    else if (best.score >= 0.56) relation = 'UNCERTAIN';
    else relation = 'REMOVED';
    if (relation !== 'REMOVED') available.delete(best.next.id);
    matches.push({ before_id: old.id, after_id: relation === 'REMOVED' ? null : best.next.id,
      relation, confidence: Number((relation === 'UNCERTAIN' ? best.score :
        relation === 'REMOVED' ? Math.max(0.5, 1 - best.score) : Math.min(0.99, Math.max(best.score, 0.75))).toFixed(3)),
      explanation: `Сходство названия ${best.nameSimilarity.toFixed(2)}; сходство функций ${best.overlap.toFixed(2)}.` });
  }
  for (const next of after) if (available.has(next.id)) {
    matches.push({ before_id: null, after_id: next.id,
      relation: before.length ? 'CREATED' : 'UNCERTAIN', confidence: before.length ? 0.8 : 0.5,
      explanation: before.length ? 'Соответствие среди BEFORE подразделений не найдено.' :
        'BEFORE подразделения не извлечены; сопоставление ненадёжно.' });
  }
  return matches;
}

async function judge(old, next, similarity, objectSimilarity, llm) {
  if (!compatible(old.fingerprint.role, next.fingerprint.role)) {
    return { relation: 'UNRELATED', confidence: Math.min(0.95, Math.max(similarity, objectSimilarity)),
      explanation: 'Роли действий различаются.' };
  }
  if (similarity < 0.54 || objectSimilarity < 0.5) {
    return { relation: 'UNRELATED', confidence: Math.max(0.5, 1 - Math.min(similarity, objectSimilarity)),
      explanation: 'Недостаточное смысловое сходство.' };
  }
  if (similarity >= 0.6 && similarity <= 0.9) {
    const answer = await llm.complete('judgment',
      'Compare two organizational functions. Distinguish executing, controlling, approving and auditing. ' +
      'EQUIVALENT requires the same action, object and scope. PARTIAL means material overlap. ' +
      'UNRELATED means no sufficient functional match. Do not invent facts.',
      `BEFORE: ${old.text}\nAFTER: ${next.text}\nBEFORE role: ${old.fingerprint.role}; AFTER role: ${next.fingerprint.role}`);
    if (answer) {
      if (answer.relation === 'EQUIVALENT' && objectSimilarity < 0.72) {
        return { relation: 'PARTIAL', confidence: Math.min(answer.confidence, 0.65),
          explanation: 'Объект функции совпадает не полностью.' };
      }
      return { relation: answer.relation, confidence: Math.min(answer.confidence, 0.95),
        explanation: answer.explanation };
    }
  }
  if ((old.fingerprint.role === 'other' || next.fingerprint.role === 'other') &&
    old.normalized_text !== next.normalized_text) {
    return { relation: similarity >= 0.66 && objectSimilarity >= 0.58 ? 'PARTIAL' : 'UNRELATED',
      confidence: Math.min(0.65, Math.max(0.5, similarity)),
      explanation: 'Роль действия определена неуверенно; полная эквивалентность не подтверждена.' };
  }
  if (similarity >= 0.82 && objectSimilarity >= 0.75) {
    return { relation: 'EQUIVALENT', confidence: Math.min(similarity, objectSimilarity, 0.9),
      explanation: 'Сходны действие, объект и роль.' };
  }
  if (similarity >= 0.66 && objectSimilarity >= 0.58) {
    return { relation: 'PARTIAL', confidence: Math.min(similarity, objectSimilarity, 0.75),
      explanation: 'Обнаружено существенное пересечение.' };
  }
  return { relation: 'UNRELATED', confidence: Math.max(0.5, 1 - similarity),
    explanation: 'Сходство недостаточно для соответствия.' };
}

async function functionMatches(before, after, departments, vectors, llm) {
  const mappedDepartments = new Map(departments.filter(item => item.after_id &&
    item.relation !== 'UNCERTAIN').map(item => [item.before_id, item.after_id]));
  const matches = [];
  for (const old of before) {
    const candidates = after.map(next => ({ next, similarity: cosine(vectors.get(old.id), vectors.get(next.id)) }))
      .sort((a, b) => b.similarity - a.similarity).slice(0, 3);
    const assessed = [];
    for (const { next, similarity } of candidates) {
      const objectSimilarity = cosine(vectors.get(`${old.id}:object`), vectors.get(`${next.id}:object`));
      const verdict = await judge(old, next, similarity, objectSimilarity, llm);
      const moved = verdict.relation === 'EQUIVALENT' && mappedDepartments.get(old.department) !== next.department;
      assessed.push({ before_id: old.id, after_id: next.id,
        relation: moved ? 'MOVED' : verdict.relation,
        confidence: Number(verdict.confidence.toFixed(3)), similarity: Number(similarity.toFixed(3)),
        explanation: moved ? `Эквивалентная функция обнаружена в другом подразделении. ${verdict.explanation}` :
          verdict.explanation });
    }
    const adequate = ['EQUIVALENT', 'MOVED', 'PARTIAL']
      .map(relation => assessed.find(item => item.relation === relation)).find(Boolean);
    if (adequate) matches.push(adequate);
    else if (assessed[0]?.similarity >= 0.6) matches.push(assessed[0]);
    else matches.push({ before_id: old.id, after_id: null, relation: 'MISSING',
      confidence: Number(Math.max(0.5, 1 - (assessed[0]?.similarity || 0)).toFixed(3)),
      similarity: assessed[0]?.similarity || 0,
      explanation: 'Достаточного соответствия в предоставленных AFTER документах не обнаружено.' });
  }
  return matches;
}

function verifiedSource(func, fragments, documents) {
  const evidence = func.source;
  const fragment = fragments.get(evidence.fragment_id);
  const document = documents.get(evidence.document_id);
  return Boolean(fragment && document && document.name === evidence.document_name &&
    fragment.document_id === evidence.document_id && fragment.document_name === evidence.document_name &&
    fragment.side === func.side && fragment.page === evidence.page && fragment.sheet === evidence.sheet &&
    fragment.section === evidence.section && fragment.paragraph === evidence.paragraph &&
    evidence.text === func.text && fragment.text.includes(evidence.text));
}

function findings(before, after, matches, vectors, fragments, documents) {
  const output = [];
  const beforeById = new Map(before.map(item => [item.id, item]));
  if (after.length) for (const match of matches) {
    const old = beforeById.get(match.before_id);
    if (!['MISSING', 'UNRELATED'].includes(match.relation) || !verifiedSource(old, fragments, documents)) continue;
    output.push({ id: stableId('finding_', 'loss', old.id), type: 'FUNCTION_LOSS', severity: 'medium',
      confidence: Number(Math.min(0.8, Math.max(0.5, match.confidence)).toFixed(3)),
      title: 'Потенциальная потеря функции',
      explanation: 'Эквивалент функции не обнаружен в предоставленных AFTER документах. Требуется проверка полноты документов.',
      evidence: [old.source], function_ids: [old.id] });
  }
  for (let index = 0; index < after.length; index++) {
    const first = after[index];
    if (!verifiedSource(first, fragments, documents)) continue;
    for (const second of after.slice(index + 1)) {
      if (first.department === second.department || !verifiedSource(second, fragments, documents)) continue;
      const similarity = cosine(vectors.get(first.id), vectors.get(second.id));
      const objectSimilarity = cosine(vectors.get(`${first.id}:object`), vectors.get(`${second.id}:object`));
      if (conflict(first.fingerprint.role, second.fingerprint.role) && objectSimilarity >= 0.78) {
        output.push({ id: stableId('finding_', 'conflict', first.id, second.id),
          type: 'RESPONSIBILITY_CONFLICT', severity: 'medium',
          confidence: Number(Math.min(0.85, objectSimilarity).toFixed(3)),
          title: 'Потенциальный риск пересечения ответственности',
          explanation: `В разных подразделениях указаны роли ${first.fingerprint.role} и ${second.fingerprint.role} для сходного объекта. Это требует экспертной проверки.`,
          evidence: [first.source, second.source], function_ids: [first.id, second.id] });
      } else if (first.fingerprint.role === second.fingerprint.role && first.fingerprint.role !== 'other' &&
        similarity >= 0.86 && objectSimilarity >= 0.8) {
        output.push({ id: stableId('finding_', 'duplicate', first.id, second.id),
          type: 'FUNCTION_DUPLICATION', severity: 'medium',
          confidence: Number(Math.min(similarity, objectSimilarity, 0.9).toFixed(3)),
          title: 'Потенциальное дублирование функции',
          explanation: 'Разные подразделения имеют существенно совпадающие функции в предоставленных AFTER документах.',
          evidence: [first.source, second.source], function_ids: [first.id, second.id] });
      }
    }
  }
  return output;
}

export async function analyze(request, { llm = llmProvider(), embeddings = embeddingProvider() } = {}) {
  const fragments = [];
  for (const [side, documents] of [['BEFORE', request.before], ['AFTER', request.after]]) {
    for (const document of documents) fragments.push(...await parseDocument(document, side));
  }
  const { departments, functions } = await extract(fragments, llm);
  const beforeDepartments = departments.filter(item => item.side === 'BEFORE');
  const afterDepartments = departments.filter(item => item.side === 'AFTER');
  const beforeFunctions = functions.filter(item => item.side === 'BEFORE');
  const afterFunctions = functions.filter(item => item.side === 'AFTER');
  const items = [
    ...departments.map(item => [item.id, item.name]),
    ...functions.map(item => [item.id, item.normalized_text]),
    ...functions.map(item => [`${item.id}:object`, item.fingerprint.object]),
  ];
  const embedded = await embeddings.embed(items.map(([, text]) => text));
  if (embedded.length !== items.length) throw new Error('Embedding provider returned an unexpected number of vectors');
  const vectors = new Map(items.map(([key], index) => [key, embedded[index]]));
  const department_matches = departmentMatches(beforeDepartments, afterDepartments, functions, vectors);
  const function_matches = await functionMatches(beforeFunctions, afterFunctions, department_matches, vectors, llm);
  const detected = findings(beforeFunctions, afterFunctions, function_matches, vectors,
    new Map(fragments.map(item => [item.id, item])),
    new Map([...request.before, ...request.after].map(item => [item.id, item])));
  const limitations = [];
  if ((process.env.LLM_PROVIDER || 'none').toLowerCase() === 'none') {
    limitations.push('LLM extraction and semantic judging disabled; rule-based extraction has limited recall.');
  }
  if (!beforeFunctions.length || !afterFunctions.length) {
    limitations.push('Functions were not extracted from at least one side; scanned PDFs need OCR and loss findings are suppressed when AFTER is empty.');
  }
  return analysisResult.parse({
    summary: { before_documents: request.before.length, after_documents: request.after.length,
      before_departments: beforeDepartments.length, after_departments: afterDepartments.length,
      before_functions: beforeFunctions.length, after_functions: afterFunctions.length,
      findings: detected.length, limitations },
    fragments, departments, functions, department_matches, function_matches, findings: detected,
  });
}
