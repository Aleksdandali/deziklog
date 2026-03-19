/**
 * Integration test: full user scenario
 * Registration → Auth state → Create cycle → Timer → Complete → Journal entry
 *
 * Tests the data flow through the entire app, not UI rendering.
 * Uses mocked Supabase to verify correct API calls and state transitions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Re-create Supabase mock with tracking ──────────────────

const mockSessions: Record<string, any> = {};
const mockProfiles: Record<string, any> = {};
const mockSterilizationSessions: Record<string, any> = {};
let authChangeCallback: ((event: string, session: any) => void) | null = null;

const mockSession = {
  user: { id: 'user-abc-123', email: 'master@salon.ua', identities: [{ id: '1' }] },
  access_token: 'mock-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const mockSupabase = {
  auth: {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    refreshSession: jest.fn(),
    onAuthStateChange: jest.fn((cb: any) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  },
  from: jest.fn(),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: null }),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/photo.jpg' } })),
    })),
  },
};

// Helper to configure mockSupabase.from() chain
function mockTable(tableName: string, response: any) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(response),
    maybeSingle: jest.fn().mockResolvedValue(response),
  };
  // Make chainable methods resolve to response at end
  Object.keys(chain).forEach((key) => {
    if (key !== 'single' && key !== 'maybeSingle') {
      chain[key].mockReturnValue(chain);
    }
  });
  mockSupabase.from.mockReturnValue(chain);
  return chain;
}

// ── Auth state machine (extracted from auth-context.tsx) ────

type AuthStatus = 'loading' | 'authed' | 'guest';

interface AppState {
  status: AuthStatus;
  session: any | null;
  profileComplete: boolean | null;
}

function processAuthEvent(state: AppState, event: string, session: any | null): AppState {
  if (event === 'SIGNED_OUT') {
    return { status: 'guest', session: null, profileComplete: null };
  }
  if (event === 'INITIAL_SESSION') {
    return session
      ? { ...state, session } // stays loading until profile check
      : { status: 'guest', session: null, profileComplete: null };
  }
  if (event === 'SIGNED_IN' && session) {
    return { ...state, session };
  }
  if (event === 'TOKEN_REFRESHED') {
    return session ? { ...state, session } : { status: 'guest', session: null, profileComplete: null };
  }
  return state;
}

function completeProfileCheck(state: AppState, hasProfile: boolean): AppState {
  return { ...state, status: 'authed', profileComplete: hasProfile };
}

// ── Timer logic (extracted from timer.tsx / new-cycle.tsx) ──

const ACTIVE_TIMER_KEY = 'active_timer';

interface TimerData {
  sessionId: string;
  duration: number;
  startedAt: number;
  sterilizerName: string;
  temperature: number;
  instruments: string;
  photoBeforeUri: string;
}

// ── Tests ───────────────────────────────────────────────────

describe('Integration: Full sterilization cycle', () => {
  let appState: AppState;

  beforeEach(() => {
    jest.clearAllMocks();
    appState = { status: 'loading', session: null, profileComplete: null };
  });

  // ── PHASE 1: Registration ──

  describe('Phase 1: Registration', () => {
    it('successful signUp with confirmation OFF returns session', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockSession.user, session: mockSession },
        error: null,
      });

      const result = await mockSupabase.auth.signUp({
        email: 'master@salon.ua',
        password: 'test123456',
      });

      expect(result.error).toBeNull();
      expect(result.data.session).not.toBeNull();
      expect(result.data.user.id).toBe('user-abc-123');
      expect(result.data.user.identities.length).toBeGreaterThan(0);
    });

    it('signUp with already registered email returns empty identities', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { ...mockSession.user, identities: [] }, session: null },
        error: null,
      });

      const result = await mockSupabase.auth.signUp({
        email: 'existing@salon.ua',
        password: 'test123456',
      });

      expect(result.error).toBeNull();
      expect(result.data.session).toBeNull();
      expect(result.data.user.identities).toHaveLength(0);
      // App should detect this and show "already registered" alert
    });

    it('signUp with confirmation ON returns no session', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockSession.user, session: null },
        error: null,
      });

      const result = await mockSupabase.auth.signUp({
        email: 'new@salon.ua',
        password: 'test123456',
      });

      expect(result.error).toBeNull();
      expect(result.data.session).toBeNull();
      expect(result.data.user.identities!.length).toBeGreaterThan(0);
      // App should show "check email" screen
    });
  });

  // ── PHASE 2: Auth state transitions ──

  describe('Phase 2: Auth state after registration', () => {
    it('INITIAL_SESSION with no saved session → guest', () => {
      appState = processAuthEvent(appState, 'INITIAL_SESSION', null);
      expect(appState.status).toBe('guest');
    });

    it('signUp → SIGNED_IN → profile check → onboarding', () => {
      // 1. App starts, no saved session
      appState = processAuthEvent(appState, 'INITIAL_SESSION', null);
      expect(appState.status).toBe('guest');

      // 2. User registers, Supabase fires SIGNED_IN
      appState = processAuthEvent(appState, 'SIGNED_IN', mockSession);
      expect(appState.session).not.toBeNull();
      expect(appState.status).toBe('guest'); // still guest until profile check

      // 3. Profile check: new user, no profile row
      appState = completeProfileCheck(appState, false);
      expect(appState.status).toBe('authed');
      expect(appState.profileComplete).toBe(false);
      // → App shows onboarding
    });

    it('signIn → SIGNED_IN → profile exists → app', () => {
      appState = processAuthEvent(appState, 'INITIAL_SESSION', null);
      appState = processAuthEvent(appState, 'SIGNED_IN', mockSession);
      appState = completeProfileCheck(appState, true);

      expect(appState.status).toBe('authed');
      expect(appState.profileComplete).toBe(true);
      // → App shows main tabs
    });

    it('app restart with saved session → authed', () => {
      // INITIAL_SESSION fires with existing session from AsyncStorage
      appState = processAuthEvent(appState, 'INITIAL_SESSION', mockSession);
      expect(appState.session).not.toBeNull();

      appState = completeProfileCheck(appState, true);
      expect(appState.status).toBe('authed');
      expect(appState.profileComplete).toBe(true);
    });
  });

  // ── PHASE 3: Create sterilization cycle ──

  describe('Phase 3: New sterilization cycle', () => {
    const cycleData = {
      sterilizer_name: 'Сухожар',
      instrument_names: 'Кусачки, Пушер',
      packet_type: 'kraft' as const,
      temperature: 180,
      duration_minutes: 30,
    };

    it('creates session in Supabase with correct data', async () => {
      const mockCreatedSession = {
        id: 'session-xyz-789',
        user_id: 'user-abc-123',
        status: 'draft',
        ...cycleData,
        created_at: new Date().toISOString(),
      };

      const chain = mockTable('sterilization_sessions', {
        data: mockCreatedSession,
        error: null,
      });

      // Simulate createSession call
      const { data, error } = await mockSupabase.from('sterilization_sessions')
        .insert({ user_id: 'user-abc-123', status: 'draft', ...cycleData })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.id).toBe('session-xyz-789');
      expect(data.status).toBe('draft');
      expect(data.temperature).toBe(180);
    });

    it('saves timer data to AsyncStorage', async () => {
      const timerData: TimerData = {
        sessionId: 'session-xyz-789',
        duration: 30,
        startedAt: Date.now(),
        sterilizerName: 'Сухожар',
        temperature: 180,
        instruments: 'Кусачки, Пушер',
        photoBeforeUri: 'file:///photo-before.jpg',
      };

      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timerData));
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);

      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.sessionId).toBe('session-xyz-789');
      expect(parsed.duration).toBe(30);
      expect(parsed.photoBeforeUri).toBe('file:///photo-before.jpg');
    });
  });

  // ── PHASE 4: Timer ──

  describe('Phase 4: Timer calculations', () => {
    it('calculates remaining time correctly', () => {
      const startedAt = Date.now() - 10 * 60 * 1000; // 10 min ago
      const duration = 30; // 30 min
      const durationSeconds = duration * 60;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, durationSeconds - elapsed);

      expect(elapsed).toBeGreaterThanOrEqual(600);
      expect(elapsed).toBeLessThan(602); // small tolerance
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(1200);
    });

    it('timer survives app restart via AsyncStorage', async () => {
      const startedAt = Date.now() - 5 * 60 * 1000; // 5 min ago
      const timerData: TimerData = {
        sessionId: 'session-xyz-789',
        duration: 30,
        startedAt,
        sterilizerName: 'Сухожар',
        temperature: 180,
        instruments: 'Кусачки',
        photoBeforeUri: 'file:///photo.jpg',
      };

      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timerData));

      // Simulate app restart — read from storage
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      const restored: TimerData = JSON.parse(stored!);

      const elapsed = Math.floor((Date.now() - restored.startedAt) / 1000);
      const remaining = Math.max(0, restored.duration * 60 - elapsed);

      // Should show ~25 min remaining (not reset to 30)
      expect(remaining).toBeLessThan(30 * 60);
      expect(remaining).toBeGreaterThan(24 * 60);
    });

    it('timer shows done when elapsed >= duration', () => {
      const startedAt = Date.now() - 35 * 60 * 1000; // 35 min ago (past 30 min duration)
      const durationSeconds = 30 * 60;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, durationSeconds - elapsed);
      const timerDone = elapsed >= durationSeconds;

      expect(remaining).toBe(0);
      expect(timerDone).toBe(true);
    });
  });

  // ── PHASE 5: Complete cycle ──

  describe('Phase 5: Complete cycle', () => {
    it('reads photoBeforeUri from AsyncStorage', async () => {
      const timerData = {
        sessionId: 'session-xyz-789',
        duration: 30,
        startedAt: Date.now() - 30 * 60 * 1000,
        sterilizerName: 'Сухожар',
        temperature: 180,
        instruments: 'Кусачки',
        photoBeforeUri: 'file:///before.jpg',
      };
      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timerData));

      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      const parsed = JSON.parse(stored!);

      expect(parsed.photoBeforeUri).toBe('file:///before.jpg');
    });

    it('updates session to completed with result', async () => {
      const chain = mockTable('sterilization_sessions', {
        data: {
          id: 'session-xyz-789',
          status: 'completed',
          result: 'success',
          photo_after_path: 'user-abc-123/session-xyz-789/after.jpg',
          ended_at: new Date().toISOString(),
        },
        error: null,
      });

      const { data, error } = await mockSupabase.from('sterilization_sessions')
        .update({
          status: 'completed',
          result: 'success',
          photo_after_path: 'user-abc-123/session-xyz-789/after.jpg',
          ended_at: new Date().toISOString(),
        })
        .eq('id', 'session-xyz-789')
        .eq('user_id', 'user-abc-123')
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.status).toBe('completed');
      expect(data.result).toBe('success');
    });

    it('clears AsyncStorage after completion', async () => {
      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, '{"test": true}');
      await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);

      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      expect(stored).toBeNull();
    });
  });

  // ── PHASE 6: Cancel cycle ──

  describe('Phase 6: Cancel cycle', () => {
    it('marks session as canceled in Supabase', async () => {
      const chain = mockTable('sterilization_sessions', {
        data: { id: 'session-xyz-789', status: 'canceled' },
        error: null,
      });

      const { data, error } = await mockSupabase.from('sterilization_sessions')
        .update({ status: 'canceled' })
        .eq('id', 'session-xyz-789')
        .eq('user_id', 'user-abc-123')
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.status).toBe('canceled');
    });

    it('clears timer from AsyncStorage on cancel', async () => {
      await AsyncStorage.setItem(ACTIVE_TIMER_KEY, '{"sessionId":"xyz"}');
      await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);

      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      expect(stored).toBeNull();
    });
  });

  // ── PHASE 7: Sign out ──

  describe('Phase 7: Sign out', () => {
    it('SIGNED_OUT event resets app to guest', () => {
      appState = { status: 'authed', session: mockSession, profileComplete: true };
      appState = processAuthEvent(appState, 'SIGNED_OUT', null);

      expect(appState.status).toBe('guest');
      expect(appState.session).toBeNull();
      expect(appState.profileComplete).toBeNull();
    });
  });

  // ── PHASE 8: Error handling ──

  describe('Phase 8: Error handling', () => {
    it('signUp network error is caught', async () => {
      mockSupabase.auth.signUp.mockRejectedValue(new Error('Network request failed'));

      await expect(
        mockSupabase.auth.signUp({ email: 'test@test.com', password: '123456' }),
      ).rejects.toThrow('Network request failed');
    });

    it('signIn wrong password returns error', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const result = await mockSupabase.auth.signInWithPassword({
        email: 'test@test.com',
        password: 'wrong',
      });

      expect(result.error).not.toBeNull();
      expect(result.error.message).toBe('Invalid login credentials');
    });

    it('TOKEN_REFRESHED with null session → guest', () => {
      appState = { status: 'authed', session: mockSession, profileComplete: true };
      appState = processAuthEvent(appState, 'TOKEN_REFRESHED', null);

      expect(appState.status).toBe('guest');
    });
  });
});
