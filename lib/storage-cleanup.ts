import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys holding the signed-in user's data (or person-tied device flows) —
// wiped on sign-out so the next user of a shared salon device can't read the
// previous master's cart, AI chats, PII caches or active cycle. The Supabase
// session key (sb-*-auth-token) is removed by signOut() itself.
const USER_SCOPED_KEYS = [
  'dezik_cart',
  'ai_chat_sessions',
  'ai_chat_consent_v1',
  'active_timer',
  'dezik_post_auth_route',
];

// dezik_cache_* entries holding the shared public catalog — survive logout so
// guests keep instant catalog loads. Everything else under dezik_cache_ is
// per-user (profile/journal/home/solutions) and contains PII.
const GLOBAL_CACHE_KEYS = new Set(['dezik_cache_products', 'dezik_cache_categories']);

// Guest-intent keys: a signed-out guest fills the cart and stashes the
// post-auth route BEFORE logging in, so the user-switch sweep (which runs on
// sign-IN) must not eat them — only an explicit sign-out does.
const GUEST_FLOW_KEYS = new Set(['dezik_cart', 'dezik_post_auth_route']);

const LAST_USER_KEY = 'dezik_last_user_id';

async function sweep(opts: { keepGuestFlowKeys: boolean }): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const doomed = all.filter((k) => {
      if (k === LAST_USER_KEY) return false;
      if (opts.keepGuestFlowKeys && GUEST_FLOW_KEYS.has(k)) return false;
      if (k.startsWith('dezik_cache_')) return !GLOBAL_CACHE_KEYS.has(k);
      return USER_SCOPED_KEYS.includes(k);
    });
    if (doomed.length) await AsyncStorage.multiRemove(doomed);
  } catch (err) {
    console.warn('Storage cleanup failed:', err);
  }
}

/** Full wipe of user-scoped storage. Call on SIGNED_OUT (covers the manual
 *  button, session-expiry sign-outs and post-account-deletion). */
export async function clearUserScopedStorage(): Promise<void> {
  await sweep({ keepGuestFlowKeys: false });
}

/** Belt-and-suspenders for missed sign-out events: if a different account
 *  signs in on this device, purge the previous user's residue (keeping the
 *  guest cart/checkout-resume flow intact). */
export async function checkUserSwitch(userId: string): Promise<void> {
  try {
    const prev = await AsyncStorage.getItem(LAST_USER_KEY);
    if (prev && prev !== userId) {
      await sweep({ keepGuestFlowKeys: true });
    }
    if (prev !== userId) await AsyncStorage.setItem(LAST_USER_KEY, userId);
  } catch (err) {
    console.warn('User switch check failed:', err);
  }
}
