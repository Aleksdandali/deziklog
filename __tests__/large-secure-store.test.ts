import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LargeSecureStore } from '../lib/large-secure-store';

const asMock = AsyncStorage as unknown as {
  __store: Record<string, string>;
  __reset: () => void;
};
const ssMock = SecureStore as unknown as {
  __store: Record<string, string>;
  __reset: () => void;
};

const KEY = 'sb-csshbetufyocutdislkn-auth-token';
const SESSION = JSON.stringify({ access_token: 'jwt-abc', refresh_token: 'rt-xyz', user: { id: 'u1' } });

beforeEach(() => {
  asMock.__reset();
  ssMock.__reset();
});

describe('LargeSecureStore', () => {
  it('round-trips a value, storing only ciphertext in AsyncStorage', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION);

    const onDisk = asMock.__store[KEY];
    expect(onDisk.startsWith('enc:v1:')).toBe(true);
    expect(onDisk).not.toContain('jwt-abc');
    expect(onDisk).not.toContain('rt-xyz');
    // Only the 32-byte key (64 hex chars) goes to SecureStore — never the blob.
    expect(ssMock.__store['lss.' + KEY]).toHaveLength(64);

    expect(await store.getItem(KEY)).toBe(SESSION);
  });

  it('migrates a legacy plaintext session in place without logging the user out', async () => {
    asMock.__store[KEY] = SESSION; // pre-encryption build left plaintext JSON

    const store = new LargeSecureStore();
    // First read returns the session (user stays signed in)…
    expect(await store.getItem(KEY)).toBe(SESSION);
    // …and the stored value is now ciphertext.
    expect(asMock.__store[KEY].startsWith('enc:v1:')).toBe(true);
    expect(asMock.__store[KEY]).not.toContain('jwt-abc');

    // Subsequent reads decrypt to the same session.
    expect(await store.getItem(KEY)).toBe(SESSION);
  });

  it('self-heals when the SecureStore key is gone (iOS reinstall, Keystore loss)', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION);
    delete ssMock.__store['lss.' + KEY];

    expect(await store.getItem(KEY)).toBeNull();
    // Orphaned ciphertext is dropped so the next launch starts clean.
    expect(asMock.__store[KEY]).toBeUndefined();
  });

  it('removeItem clears both halves', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION);
    await store.removeItem(KEY);

    expect(asMock.__store[KEY]).toBeUndefined();
    expect(ssMock.__store['lss.' + KEY]).toBeUndefined();
  });

  it('returns null when nothing is stored', async () => {
    const store = new LargeSecureStore();
    expect(await store.getItem(KEY)).toBeNull();
  });
});
