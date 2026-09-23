import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultCacheDir = () => process.env.PROVIDER_CACHE_DIR ??
  fileURLToPath(new URL('../data/provider-cache/', import.meta.url));

// Local, content-addressed cache. Delete the directory to discard document-derived data.
export async function cached(provider, input, validate, action) {
  provider.signal?.throwIfAborted();
  const key = createHash('sha256').update(JSON.stringify([2, provider.key, provider.baseUrl, provider.model, input])).digest('hex');
  const path = provider.cacheDir && join(provider.cacheDir, `${key}.json`);
  if (path) {
    try {
      const value = validate(JSON.parse(await readFile(path, 'utf8')));
      provider.stats.cacheHits++;
      return value;
    } catch { /* Missing, stale or corrupt entries are recomputed. */ }
  }
  provider.signal?.throwIfAborted();
  const value = validate(await action());
  if (path) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(provider.cacheDir, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      console.warn('Provider cache write skipped:', error.code);
    }
  }
  return value;
}
