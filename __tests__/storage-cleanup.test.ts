import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearUserScopedStorage, checkUserSwitch } from '../lib/storage-cleanup';

const mock = AsyncStorage as unknown as {
  __store: Record<string, string>;
  __reset: () => void;
};

function seed(keys: Record<string, string>) {
  mock.__reset();
  Object.entries(keys).forEach(([k, v]) => { mock.__store[k] = v; });
}

const FULL_SET = {
  dezik_cart: '[{"product":{"id":"p1"}}]',
  ai_chat_sessions: '[{"messages":[]}]',
  ai_chat_consent_v1: '1',
  active_timer: '{"sessionId":"s1"}',
  dezik_post_auth_route: '/cart',
  'dezik_cache_profile_user-a': '{"phone":"+380..."}',
  'dezik_cache_journal_user-a': '[]',
  'dezik_cache_home_sessions_user-a': '[]',
  dezik_cache_products: '[{"id":"p1"}]',
  dezik_cache_categories: '[{"id":"c1"}]',
  'sb-csshbetufyocutdislkn-auth-token': '{"access_token":"..."}',
};

describe('clearUserScopedStorage (sign-out wipe)', () => {
  it('removes user data but keeps the global catalog cache', async () => {
    seed(FULL_SET);
    await clearUserScopedStorage();

    expect(mock.__store.dezik_cart).toBeUndefined();
    expect(mock.__store.ai_chat_sessions).toBeUndefined();
    expect(mock.__store.ai_chat_consent_v1).toBeUndefined();
    expect(mock.__store.active_timer).toBeUndefined();
    expect(mock.__store.dezik_post_auth_route).toBeUndefined();
    expect(mock.__store['dezik_cache_profile_user-a']).toBeUndefined();
    expect(mock.__store['dezik_cache_journal_user-a']).toBeUndefined();
    expect(mock.__store['dezik_cache_home_sessions_user-a']).toBeUndefined();

    // Public catalog survives so guests keep instant loads.
    expect(mock.__store.dezik_cache_products).toBeDefined();
    expect(mock.__store.dezik_cache_categories).toBeDefined();
    // Supabase's own session key is signOut()'s job, not ours.
    expect(mock.__store['sb-csshbetufyocutdislkn-auth-token']).toBeDefined();
  });
});

describe('checkUserSwitch (sign-in guard)', () => {
  it('first sign-in just records the user id without wiping', async () => {
    seed(FULL_SET);
    await checkUserSwitch('user-a');

    expect(mock.__store.dezik_last_user_id).toBe('user-a');
    expect(mock.__store.dezik_cart).toBeDefined();
    expect(mock.__store['dezik_cache_profile_user-a']).toBeDefined();
  });

  it('same user signing in again does not wipe anything', async () => {
    seed({ ...FULL_SET, dezik_last_user_id: 'user-a' });
    await checkUserSwitch('user-a');

    expect(mock.__store.dezik_cart).toBeDefined();
    expect(mock.__store.ai_chat_sessions).toBeDefined();
  });

  it('a different user signing in purges the previous user residue but keeps guest-flow keys', async () => {
    seed({ ...FULL_SET, dezik_last_user_id: 'user-a' });
    await checkUserSwitch('user-b');

    // Previous user's private data is gone.
    expect(mock.__store.ai_chat_sessions).toBeUndefined();
    expect(mock.__store.ai_chat_consent_v1).toBeUndefined();
    expect(mock.__store.active_timer).toBeUndefined();
    expect(mock.__store['dezik_cache_profile_user-a']).toBeUndefined();

    // Guest-intent keys survive: the cart was filled and the checkout route
    // stashed BEFORE this very sign-in — wiping them here would break the
    // guest → sign-in → resume-checkout flow.
    expect(mock.__store.dezik_cart).toBeDefined();
    expect(mock.__store.dezik_post_auth_route).toBeDefined();

    // Global catalog cache survives.
    expect(mock.__store.dezik_cache_products).toBeDefined();
    expect(mock.__store.dezik_last_user_id).toBe('user-b');
  });
});
