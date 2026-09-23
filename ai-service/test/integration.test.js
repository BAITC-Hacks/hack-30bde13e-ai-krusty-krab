import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { analyze } from '../src/analysis.js';
import { parseDocument } from '../src/parsing.js';

async function workbook(id, rows) {
  const excel = new ExcelJS.Workbook();
  const sheet = excel.addWorksheet('Функции');
  sheet.addRow(['Подразделение', 'Функция']);
  rows.forEach(row => sheet.addRow(row));
  return { id, name: `${id}.xlsx`, content_base64: Buffer.from(await excel.xlsx.writeBuffer()).toString('base64') };
}

test('XLSX analysis distinguishes role conflicts, duplication and missing functions with anchored evidence', async () => {
  const before = await workbook('before', [
    ['Отдел закупок', 'Выполняет обработку заявок на закупки'],
    ['Отдел закупок', 'Ведет реестр договоров аренды'],
  ]);
  const after = await workbook('after', [
    ['Отдел снабжения', 'Осуществляет обработку заявок на закупки'],
    ['Отдел логистики', 'Выполняет обработку заявок на закупки'],
    ['Отдел контроля', 'Контролирует обработку заявок на закупки'],
    ['HR', 'Кадровое делопроизводство сотрудников'],
  ]);
  const embeddings = { async embed(texts) { return texts.map(text => {
    if (text.includes('заявок на закупки')) return [1, 0, 0];
    if (text.includes('договоров аренды')) return [0, 1, 0];
    return [0, 0, 1];
  }); } };
  const llm = { async complete() { return null; } };
  const result = await analyze({ before: [before], after: [after] }, { llm, embeddings });
  assert.equal(result.summary.before_functions, 2);
  assert.equal(result.summary.after_functions, 4);
  assert.ok(result.departments.some(item => item.name === 'HR'));
  assert.ok(result.function_matches.some(item => ['EQUIVALENT', 'MOVED'].includes(item.relation)));
  assert.ok(result.function_matches.some(item => item.relation === 'MISSING'));
  for (const type of ['FUNCTION_LOSS', 'FUNCTION_DUPLICATION', 'RESPONSIBILITY_CONFLICT']) {
    assert.ok(result.findings.some(item => item.type === type), `${type} should be detected`);
  }
  const fragments = new Map([
    ...await parseDocument(before, 'BEFORE'), ...await parseDocument(after, 'AFTER'),
  ].map(item => [item.id, item]));
  for (const finding of result.findings) for (const evidence of finding.evidence) {
    assert.ok(fragments.get(evidence.fragment_id)?.text.includes(evidence.text));
    assert.ok(['before', 'after'].includes(evidence.document_id));
  }
});

test('identical embeddings do not equate executing with controlling', async () => {
  const before = await workbook('role-before', [
    ['Отдел операций', 'Выполняет обработку заявок на закупки'],
  ]);
  const after = await workbook('role-after', [
    ['Отдел контроля', 'Контролирует обработку заявок на закупки'],
  ]);
  const embeddings = { async embed(texts) { return texts.map(() => [1, 0]); } };
  const llm = { async complete() { return null; } };
  const result = await analyze({ before: [before], after: [after] }, { llm, embeddings });
  assert.equal(result.function_matches[0].relation, 'UNRELATED');
  assert.ok(result.findings.some(item => item.type === 'FUNCTION_LOSS'));
});
