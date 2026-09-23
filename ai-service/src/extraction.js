import { createHash } from 'node:crypto';
import { source } from './parsing.js';

const departmentPattern = /(?<![\p{L}\p{N}])(?:Департамент|Управление|Отдел|Служба|Дирекция|Сектор|Комитет|Центр|Дивизион)\s+[А-ЯЁа-яёA-Za-z0-9][^.;:()\n]{2,100}/iu;
const functionPattern = /(?<![\p{L}\p{N}])(?:осуществляет|осуществляют|обеспечивает|обеспечивают|организует|организуют|выполняет|выполняют|контролирует|контролируют|утверждает|утверждают|проверяет|проверяют|разрабатывает|разрабатывают|создаёт|создает|создают|ведёт|ведет|ведут|согласовывает|согласовывают|координирует|координируют|управляет|управляют|проводит|проводят|анализирует|анализируют|эксплуатирует|эксплуатируют|аудитирует|аудитируют|осуществление|обеспечение|организация|выполнение|контроль|утверждение|проверка|разработка|создание|ведение|согласование|координация|управление|проведение|анализ|эксплуатация|аудит)(?![\p{L}\p{N}])/iu;
const roles = [
  ['control', /(?:^|\s)(?:контрол|надзор|мониторинг)/],
  ['approve', /(?:^|\s)(?:утвержд|одобр|согласован)/],
  ['audit', /(?:^|\s)(?:аудит|ревизи|провер[кя])/],
  ['coordinate', /(?:^|\s)(?:координир|организаци|организу)/],
  ['create', /(?:^|\s)(?:созда|разработ|формир|составля)/],
  ['operate', /(?:^|\s)(?:эксплуат|обслужива|вед[её]|управля)/],
  ['execute', /(?:^|\s)(?:выполня|осуществля|провод|обеспечива|реализу)/],
];

export function stableId(prefix, ...parts) {
  return prefix + createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

export function normalize(text) {
  return text.toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function fingerprint(text) {
  const normalized = normalize(text);
  const role = roles.find(([, pattern]) => pattern.test(normalized))?.[0] || 'other';
  const verb = functionPattern.exec(text);
  const action = verb?.[0].toLowerCase() || normalized.split(' ')[0] || '';
  const object = (verb ? text.slice(verb.index + verb[0].length) : text)
    .replace(/^[\s.,:;—–-]+/, '').replace(/^(?:деятельность по|работы по|функции по)\s+/i, '') || text;
  const scope = object.match(/(?:^|\s)(?:в рамках|в отношении|на территории)(?:\s|$).*/i)?.[0]?.trim() || '';
  return { action, object, role, scope };
}

function departmentName(text) {
  const name = departmentPattern.exec(text)?.[0].replace(/[\s.,:;—–-]+$/, '');
  return name && name.split(/\s+/).length >= 2 ? name : null;
}

export async function extract(fragments, llm) {
  const byId = new Map(fragments.map(fragment => [fragment.id, fragment]));
  const departments = new Map();
  const functions = new Map();
  const current = new Map();

  function addDepartment(fragment, quote) {
    if (!fragment || !quote || !fragment.text.includes(quote)) return;
    const name = departmentName(quote) ||
      (fragment.kind === 'heading' && fragment.department_hint === quote ? quote.trim() : null);
    if (!name) return;
    const key = `${fragment.side}:${normalize(name)}`;
    if (!departments.has(key)) departments.set(key, {
      id: stableId('d_', fragment.side, fragment.document_id, normalize(name)),
      side: fragment.side, name, parent: null, source: source(fragment, name),
    });
    current.set(fragment.document_id, name);
  }

  function addFunction(fragment, quote, departmentNameText) {
    if (!fragment || !quote || !fragment.text.includes(quote) || normalize(quote).split(' ').length < 3) return;
    const department = departments.get(`${fragment.side}:${normalize(departmentNameText)}`);
    if (!department) return;
    if (department.source.document_id !== fragment.document_id &&
      !fragments.some(item => item.document_id === fragment.document_id && item.text.includes(departmentNameText))) return;
    const key = `${fragment.side}:${fragment.id}:${quote}`;
    if (!functions.has(key)) functions.set(key, {
      id: stableId('f_', fragment.side, fragment.id, quote),
      side: fragment.side, department: department.id, text: quote,
      normalized_text: normalize(quote), fingerprint: fingerprint(quote), source: source(fragment, quote),
    });
  }

  // Ground all department names in source fragments before assigning any functions.
  for (const fragment of fragments) {
    if (fragment.department_hint) {
      const evidence = fragments.find(candidate => candidate.document_id === fragment.document_id &&
        candidate.text === fragment.department_hint);
      if (evidence) addDepartment(evidence, evidence.text);
    }
    const name = departmentName(fragment.text);
    if (name && (fragment.kind === 'heading' ||
      (fragment.kind === 'body' && fragment.text.length < 120 && !functionPattern.test(fragment.text) &&
       normalize(fragment.text).startsWith(normalize(name))))) {
      addDepartment(fragment, name);
    }
  }

  const chunks = [];
  for (let start = 0; start < fragments.length; start += 64) chunks.push(fragments.slice(start, start + 64));
  const responses = [];
  for (let start = 0; start < chunks.length; start += 4) {
    responses.push(...await Promise.all(chunks.slice(start, start + 4).map(async chunk => {
      const response = await llm.complete('extraction',
        'Extract explicit organizational departments and individual functions from Russian documents. ' +
        'Return fragment_id and exact verbatim quote copied from that fragment. Never infer names or rewrite text. ' +
        'Each function department_name must be an explicit department name in these fragments. Return empty arrays if absent.',
        JSON.stringify(chunk.map(item => ({ id: item.id, text: item.text, kind: item.kind,
          department_hint: item.department_hint }))));
      return { chunk, response };
    })));
  }
  for (const { chunk, response } of responses) {
    if (!response) continue;
    const allowed = new Set(chunk.map(item => item.id));
    for (const mention of response.departments) {
      if (allowed.has(mention.fragment_id)) addDepartment(byId.get(mention.fragment_id), mention.quote);
    }
  }
  for (const { chunk, response } of responses) {
    if (!response) continue;
    const allowed = new Set(chunk.map(item => item.id));
    for (const mention of response.functions) {
      if (allowed.has(mention.fragment_id)) addFunction(byId.get(mention.fragment_id), mention.quote, mention.department_name);
    }
  }

  for (const fragment of fragments) {
    if (fragment.department_hint) current.set(fragment.document_id, fragment.department_hint);
    else if (fragment.kind === 'heading') {
      const name = departmentName(fragment.text);
      if (name && departments.has(`${fragment.side}:${normalize(name)}`)) current.set(fragment.document_id, name);
    }
    const name = current.get(fragment.document_id);
    if (!name || !['body', 'table'].includes(fragment.kind)) continue;
    for (const rawClause of fragment.text.split(';')) {
      const clause = rawClause.trim();
      if (functionPattern.test(clause) || (fragment.kind === 'table' && fragment.department_hint &&
        normalize(clause).split(' ').length >= 3)) addFunction(fragment, clause, name);
    }
  }

  return { departments: [...departments.values()], functions: [...functions.values()] };
}
