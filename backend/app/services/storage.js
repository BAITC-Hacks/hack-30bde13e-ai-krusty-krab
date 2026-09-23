import { createWriteStream } from 'node:fs';
import { open, rm, stat, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

const signatures = { '.pdf': '%PDF-', '.docx': 'PK\x03\x04', '.xlsx': 'PK\x03\x04' };

export async function storeDocument(part, analysisId, uploadDir) {
  const filename = basename((part.filename || '').replaceAll('\\', '/'));
  const fileType = extname(filename).toLowerCase();
  if (!filename || !signatures[fileType]) {
    part.file.resume();
    const error = new Error('Only PDF, DOCX and XLSX files are supported');
    error.statusCode = 400;
    throw error;
  }

  const dir = join(uploadDir, analysisId);
  await mkdir(dir, { recursive: true });
  const storagePath = join(dir, `${randomUUID()}${fileType}`);
  try {
    await pipeline(part.file, createWriteStream(storagePath, { flags: 'wx' }));
    const size = (await stat(storagePath)).size;
    const handle = await open(storagePath, 'r');
    const bytes = Buffer.alloc(5);
    try { await handle.read(bytes, 0, 5, 0); } finally { await handle.close(); }
    if (!size || !bytes.toString('latin1').startsWith(signatures[fileType])) {
      const error = new Error('File is empty or does not match its extension');
      error.statusCode = 400;
      throw error;
    }
    return { filename, file_type: fileType.slice(1), storage_path: storagePath };
  } catch (error) {
    await rm(storagePath, { force: true });
    throw error;
  }
}
