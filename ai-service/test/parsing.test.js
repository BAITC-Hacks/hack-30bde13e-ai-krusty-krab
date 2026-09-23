import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseDocument } from '../src/parsing.js';

function pdf(text) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  output += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

async function docx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Отдел кадров</w:t></w:r></w:p><w:p><w:r><w:t>Выполняет подбор персонала</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('PDF parsing keeps page and exact extracted text', async () => {
  const document = { id: 'pdf', name: 'before.pdf', content_base64: pdf('Hello PDF').toString('base64') };
  const fragments = await parseDocument(document, 'BEFORE');
  assert.ok(fragments.some(item => item.page === 1 && item.text.includes('Hello PDF')));
});

test('DOCX parsing keeps paragraph and exact extracted text', async () => {
  const document = { id: 'docx', name: 'before.docx', content_base64: (await docx()).toString('base64') };
  const fragments = await parseDocument(document, 'BEFORE');
  assert.ok(fragments.some(item => item.paragraph === 1 && item.text === 'Отдел кадров'));
  assert.ok(fragments.some(item => item.paragraph === 2 && item.text === 'Выполняет подбор персонала'));
});
