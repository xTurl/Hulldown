/**
 * JSON.parse that survives corrupted DB rows: logs and returns null instead of
 * crashing the IPC handler. Callers treat null as a cache miss.
 */
export function safeJsonParse<T>(json: string, context: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    console.error(`[cache] Corrupted JSON in ${context}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
