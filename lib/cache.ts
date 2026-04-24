import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  value: T;
  savedAt: number;
}

/**
 * Read-through/write-through JSON cache for small per-user payloads.
 * Keys should already be namespaced by the caller (e.g. `echo:home:<userId>`).
 */
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed?.value ?? null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { value, savedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* non-fatal */
  }
}
