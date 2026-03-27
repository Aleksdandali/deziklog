import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'dezik_cache_';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch (err) {
    console.warn('Cache: failed to write:', key, err);
  }
}
