import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

// Supabase session storage adapter (the canonical "LargeSecureStore" pattern
// from the Supabase docs): the session blob (access JWT + long-lived refresh
// token) is AES-256-CTR encrypted in AsyncStorage, and only the 32-byte key
// lives in SecureStore (Keychain/Keystore). SecureStore alone can't hold the
// session — it caps values at ~2 KB and a Supabase session JSON is bigger.
//
// Migration: pre-existing installs have the session as PLAINTEXT JSON under
// the same AsyncStorage key (supabase-js's sb-<ref>-auth-token). getItem
// detects the missing `enc:v1:` prefix, re-stores the value encrypted in
// place and returns it — existing users stay signed in with no interruption.

const ENC_PREFIX = 'enc:v1:';

// SecureStore keys must match [A-Za-z0-9._-]; the supabase-js key
// (sb-<ref>-auth-token) already does — this is just a safety net.
const secureKeyFor = (key: string) => 'lss.' + key.replace(/[^A-Za-z0-9._-]/g, '_');

async function encryptInPlace(key: string, value: string): Promise<void> {
  const keyBytes = Crypto.getRandomValues(new Uint8Array(32));
  // Counter(1) with a fresh key per write is safe: the key is never reused.
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  const cipherHex = aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));

  // SecureStore first: if the key write fails we must NOT leave AsyncStorage
  // holding ciphertext we can never decrypt.
  await SecureStore.setItemAsync(secureKeyFor(key), aesjs.utils.hex.fromBytes(keyBytes), {
    // Background token refresh must work after a reboot before first unlock
    // would block it — AFTER_FIRST_UNLOCK matches AsyncStorage's availability.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  await AsyncStorage.setItem(key, ENC_PREFIX + cipherHex);
}

async function decrypt(key: string, stored: string): Promise<string | null> {
  const keyHex = await SecureStore.getItemAsync(secureKeyFor(key));
  if (!keyHex) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    new aesjs.Counter(1),
  );
  return aesjs.utils.utf8.fromBytes(
    cipher.decrypt(aesjs.utils.hex.toBytes(stored.slice(ENC_PREFIX.length))),
  );
}

export class LargeSecureStore {
  // supabase-js can issue overlapping getItem calls during init; serialize
  // per-key so the plaintext→encrypted migration runs exactly once.
  private inflight = new Map<string, Promise<string | null>>();

  getItem(key: string): Promise<string | null> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = this._getItem(key).finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, p);
    return p;
  }

  private async _getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;

    // Legacy plaintext session from a pre-encryption build → encrypt in place.
    if (!raw.startsWith(ENC_PREFIX)) {
      try {
        await encryptInPlace(key, raw);
      } catch (err) {
        console.warn('[SecureSession] migration failed, keeping plaintext for now:', err);
      }
      return raw;
    }

    try {
      const value = await decrypt(key, raw);
      if (value != null) return value;
    } catch (err) {
      console.warn('[SecureSession] decrypt failed:', err);
    }
    // Self-heal: lost/corrupted Keystore entry (or ciphertext without a key
    // after an iOS reinstall — Keychain outlives the app, AsyncStorage не).
    // Drop both halves; the user signs in again instead of being stuck.
    await this.removeItem(key);
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await encryptInPlace(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(secureKeyFor(key)).catch(() => {});
  }
}
