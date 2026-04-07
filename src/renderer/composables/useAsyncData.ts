import { ref } from 'vue';

export function useAsyncData<T>(fetchFn: () => Promise<T>, initialValue: T) {
  const data = ref<T>(initialValue) as { value: T };
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchFn();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'An error occurred';
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, error, load };
}
