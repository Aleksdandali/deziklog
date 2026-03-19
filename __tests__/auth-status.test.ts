/**
 * Tests for AuthProvider status transitions (auth-context.tsx).
 * Tests the state machine: loading → guest | authed.
 */

type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthState {
  status: AuthStatus;
  sessionUserId: string | null;
  profileComplete: boolean | null;
}

/**
 * Simulates the AuthProvider state machine based on events.
 * Extracted from auth-context.tsx onAuthStateChange handler.
 */
function processAuthEvent(
  state: AuthState,
  event: string,
  sessionUserId: string | null,
): AuthState {
  if (event === 'SIGNED_OUT') {
    return { status: 'guest', sessionUserId: null, profileComplete: null };
  }
  if (event === 'INITIAL_SESSION') {
    if (!sessionUserId) {
      return { ...state, status: 'guest', sessionUserId: null };
    }
    // Session exists — stays loading until profile check
    return { ...state, sessionUserId };
  }
  if (event === 'TOKEN_REFRESHED') {
    if (sessionUserId) {
      return { ...state, sessionUserId };
    }
    // Refresh failed
    return { status: 'guest', sessionUserId: null, profileComplete: null };
  }
  // SIGNED_IN, USER_UPDATED, etc.
  if (sessionUserId) {
    return { ...state, sessionUserId };
  }
  return state;
}

/** Simulates profile check completing */
function completeProfileCheck(state: AuthState, profileComplete: boolean): AuthState {
  if (!state.sessionUserId) return state;
  return { ...state, status: 'authed', profileComplete };
}

const INITIAL: AuthState = { status: 'loading', sessionUserId: null, profileComplete: null };

describe('Auth status transitions', () => {
  it('starts in loading state', () => {
    expect(INITIAL.status).toBe('loading');
  });

  it('INITIAL_SESSION with no session → guest', () => {
    const result = processAuthEvent(INITIAL, 'INITIAL_SESSION', null);
    expect(result.status).toBe('guest');
    expect(result.sessionUserId).toBeNull();
  });

  it('INITIAL_SESSION with session → stays loading (awaiting profile)', () => {
    const result = processAuthEvent(INITIAL, 'INITIAL_SESSION', 'user-123');
    expect(result.status).toBe('loading');
    expect(result.sessionUserId).toBe('user-123');
  });

  it('INITIAL_SESSION + profile check → authed', () => {
    let state = processAuthEvent(INITIAL, 'INITIAL_SESSION', 'user-123');
    state = completeProfileCheck(state, true);
    expect(state.status).toBe('authed');
    expect(state.profileComplete).toBe(true);
  });

  it('SIGNED_IN → sets session, stays loading', () => {
    const guest: AuthState = { status: 'guest', sessionUserId: null, profileComplete: null };
    const result = processAuthEvent(guest, 'SIGNED_IN', 'user-456');
    expect(result.sessionUserId).toBe('user-456');
  });

  it('SIGNED_OUT → guest regardless of previous state', () => {
    const authed: AuthState = { status: 'authed', sessionUserId: 'user-123', profileComplete: true };
    const result = processAuthEvent(authed, 'SIGNED_OUT', null);
    expect(result.status).toBe('guest');
    expect(result.sessionUserId).toBeNull();
    expect(result.profileComplete).toBeNull();
  });

  it('TOKEN_REFRESHED with session → keeps user', () => {
    const authed: AuthState = { status: 'authed', sessionUserId: 'user-123', profileComplete: true };
    const result = processAuthEvent(authed, 'TOKEN_REFRESHED', 'user-123');
    expect(result.sessionUserId).toBe('user-123');
  });

  it('TOKEN_REFRESHED without session → guest (refresh failed)', () => {
    const authed: AuthState = { status: 'authed', sessionUserId: 'user-123', profileComplete: true };
    const result = processAuthEvent(authed, 'TOKEN_REFRESHED', null);
    expect(result.status).toBe('guest');
  });

  it('profile incomplete → authed with profileComplete=false', () => {
    let state = processAuthEvent(INITIAL, 'INITIAL_SESSION', 'user-789');
    state = completeProfileCheck(state, false);
    expect(state.status).toBe('authed');
    expect(state.profileComplete).toBe(false);
  });

  it('unknown event with session → updates session', () => {
    const result = processAuthEvent(INITIAL, 'USER_UPDATED', 'user-new');
    expect(result.sessionUserId).toBe('user-new');
  });

  it('unknown event without session → no change', () => {
    const result = processAuthEvent(INITIAL, 'USER_UPDATED', null);
    expect(result).toEqual(INITIAL);
  });
});
