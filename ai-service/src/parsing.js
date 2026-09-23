import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { load as loadHtml } from 'cheerio';
import ExcelJS from 'exceljs';

const departmentHeader = /подразделени|департамент|управлени|отдел|служб|дирекци|сектор/i;
const functionHeader = /функци|обязанност|полномочи|задач|ответственност/i;
const sectionNumber = /^\s*\d+(?:\.\d+)*(?:\.|\))?\s+/;

function fragment(document, side, location, text, extra = {}) {
  return {
    id: createHash('sha256').update(`${document.id}:${location}`).digest('hex').slice(0, 16),
    document_id: document.id, document_name: document.name, side,
    text: text.trim(), kind: extra.kind || 'body',
    page: extra.page ?? null, sheet: extra.sheet ?? null,
    section: extra.section ?? null, paragraph: extra.paragraph ?? null,
    department_hint: extra.department_hint ?? null,
  };
}

export function source(fragment, quote = fragment.text) {
  return {
    document_id: fragment.document_id, document_name: fragment.document_name,
    fragment_id: fragment.id, page: fragment.page, sheet: fragment.sheet,
    section: fragment.section, paragraph: fragment.paragraph, text: quote,
  };
}

function tableFragments(document, side, rows, location, extra = {}) {
  if (!rows.length) return [];
  const first = rows[0].values.map(value => String(value ?? '').trim());
  const departmentColumn = first.findIndex(value => departmentHeader.test(value));
  const functionColumn = first.findIndex(value => functionHeader.test(value));
  const start = departmentColumn >= 0 || functionColumn >= 0 ? 1 : 0;
  const result = [];
  for (const row of rows.slice(start)) {
    const department = departmentColumn >= 0 ? String(row.values[departmentColumn] ?? '').trim() : null;
    row.values.forEach((value, column) => {
      const text = String(value ?? '').trim();
      if (!text) return;
      result.push(fragment(document, side, `${location}:r${row.number}:c${column + 1}`, text, {
        ...extra, paragraph: row.number,
        kind: column === departmentColumn ? 'heading' : 'table',
        department_hint: column === functionColumn || column === departmentColumn ? department : null,
      }));
    });
  }
  return result;
}

async function parsePdf(document, side, buffer) {
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true });
  const pdf = await task.promise;
  const result = [];
  let section = null;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      let line = '';
      let paragraph = 0;
      const emit = () => {
        const text = line.trim();
        line = '';
        if (!text) return;
        paragraph++;
        const heading = text.length < 120 && sectionNumber.test(text);
        if (heading) section = text;
        result.push(fragment(document, side, `p${pageNumber}:l${paragraph}`, text, {
          kind: heading ? 'heading' : 'body', page: pageNumber, section, paragraph,
        }));
      };
      for (const item of items) {
        if (!('str' in item)) continue;
        line += (line && item.str ? ' ' : '') + item.str;
        if (item.hasEOL) emit();
      }
      emit();
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return result;
}

async function parseDocx(document, side, buffer) {
  const converted = await mammoth.convertToHtml({ buffer });
  const $ = loadHtml(converted.value);
  const result = [];
  let section = null;
  let paragraph = 0;
  let tableNumber = 0;
  $('body').find('h1,h2,h3,h4,h5,h6,p,li,table').each((_, element) => {
    const node = $(element);
    if (node.parents('table').length || (element.tagName === 'li' && node.find('p').length)) return;
    if (element.tagName === 'table') {
      tableNumber++;
      const rows = [];
      node.find('tr').each((index, row) => {
        rows.push({ number: index + 1, values: $(row).children('th,td').map((__, cell) => $(cell).text().trim()).get() });
      });
      result.push(...tableFragments(document, side, rows, `table${tableNumber}`, { section }));
      return;
    }
    const text = node.text().trim();
    if (!text) return;
    paragraph++;
    const heading = /^h[1-6]$/.test(element.tagName) || (text.length < 120 && sectionNumber.test(text));
    if (heading) section = text;
    result.push(fragment(document, side, `paragraph${paragraph}`, text, {
      kind: heading ? 'heading' : 'body', section, paragraph,
    }));
  });
  return result;
}

async function parseXlsx(document, side, buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const result = [];
  workbook.eachSheet(sheet => {
    const rows = [];
    sheet.eachRow((row, number) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cell.text; });
      rows.push({ number, values });
    });
    result.push(...tableFragments(document, side, rows, `sheet:${sheet.name}`, { sheet: sheet.name }));
  });
  return result;
}

export async function parseDocument(document, side) {
  const encoded = document.content_base64;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`${document.name}: invalid base64`);
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) {
    throw new Error(`${document.name}: file must be between 1 byte and 25 MB`);
  }
  const extension = extname(document.name).toLowerCase();
  try {
    if (extension === '.pdf') return await parsePdf(document, side, buffer);
    if (extension === '.docx') return await parseDocx(document, side, buffer);
    if (extension === '.xlsx') return await parseXlsx(document, side, buffer);
  } catch (error) {
    throw new Error(`${document.name}: cannot parse ${extension}: ${error.message}`);
  }
  throw new Error(`${document.name}: supported formats are PDF, DOCX and XLSX`);
}
