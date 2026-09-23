import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export function openDb(databaseUrl) {
  if (databaseUrl !== ':memory:') mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
  const db = new DatabaseSync(databaseUrl);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('CREATED','UPLOADING','PROCESSING','COMPLETED','FAILED')),
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('BEFORE','AFTER')),
      file_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS analysis_results (
      analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  if (!db.prepare('PRAGMA table_info(analyses)').all().some(column => column.name === 'error')) {
    db.exec('ALTER TABLE analyses ADD COLUMN error TEXT');
  }

  const transaction = action => {
    db.exec('BEGIN');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const getAnalysis = id => db.prepare('SELECT * FROM analyses WHERE id = ?').get(id);
  const setStatus = (id, status, error = null) => db.prepare("UPDATE analyses SET status = ?, error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(status, error, id);

  return {
    close: () => db.close(),
    getAnalysis,
    listAnalyses: () => db.prepare('SELECT * FROM analyses ORDER BY created_at DESC, id DESC').all(),
    createAnalysis: (id, name) => {
      db.prepare("INSERT INTO analyses (id, name, status) VALUES (?, ?, 'CREATED')").run(id, name);
      return getAnalysis(id);
    },
    deleteAnalysis: id => db.prepare('DELETE FROM analyses WHERE id = ?').run(id),
    listDocuments: id => db.prepare('SELECT * FROM documents WHERE analysis_id = ? ORDER BY created_at, id').all(id),
    addDocument: (id, analysisId, file, side) => transaction(() => {
      db.prepare('INSERT INTO documents (id, analysis_id, filename, side, file_type, storage_path) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, analysisId, file.filename, side, file.file_type, file.storage_path);
      db.prepare('DELETE FROM analysis_results WHERE analysis_id = ?').run(analysisId);
      setStatus(analysisId, 'UPLOADING');
      return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    }),
    beginRun: id => transaction(() => {
      db.prepare('DELETE FROM analysis_results WHERE analysis_id = ?').run(id);
      setStatus(id, 'PROCESSING');
    }),
    completeRun: (id, result) => transaction(() => {
      db.prepare('INSERT INTO analysis_results (analysis_id, result_json) VALUES (?, ?)').run(id, JSON.stringify(result));
      setStatus(id, 'COMPLETED');
      return getAnalysis(id);
    }),
    failRun: (id, error) => setStatus(id, 'FAILED', error),
    getResult: id => {
      const row = db.prepare('SELECT result_json FROM analysis_results WHERE analysis_id = ?').get(id);
      return row ? JSON.parse(row.result_json) : null;
    }
  };
}
