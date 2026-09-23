// Keep provider traffic bounded and stop scheduling work after a failure.
export async function mapConcurrent(items, limit, action) {
  const results = new Array(items.length);
  let cursor = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await action(items[index], index); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return results;
}
