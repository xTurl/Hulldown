import { ref } from 'vue';

/**
 * Shared load/error/loading pattern for views that fetch a list once and
 * refresh on demand (News, Patches). Tracks when the data was last fetched
 * so the UI can display a "fetched at" hint.
 */
export function useAsyncData<T>(fetchFn: () => Promise<T>, initialValue: T) {
  const data = ref<T>(initialValue) as { value: T };
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetched = ref<number | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchFn();
      lastFetched.value = Date.now();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'An error occurred';
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, error, lastFetched, load };
}
