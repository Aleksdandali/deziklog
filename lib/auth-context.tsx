import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registerPushToken } from './notifications';
import { clearUserScopedStorage, checkUserSwitch } from './storage-cleanup';

// ── Types ─────────────────────────────────────────────────
type AuthStatus = 'loading' | 'authed' | 'guest';

type AuthContextType = {
  session: Session | null;
  status: AuthStatus;
  profileComplete: boolean | null;
  setProfileComplete: (v: boolean) => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  status: 'loading',
  profileComplete: null,
  setProfileComplete: () => {},
});

export const useAuth = () => useContext(AuthContext);

// ── Safe userId getter ────────────────────────────────────
export function useSessionGuard(): () => Promise<string | null> {
  const { session } = useAuth();
  return useCallback(async () => {
    if (session?.user?.id) return session.user.id;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.id) return data.session.user.id;
    } catch (err) {
      console.warn('Session guard: refresh failed:', err);
    }
    // No valid session — offer sign out
    Alert.alert(
      'Сесія закінчилась',
      'Потрібно увійти знову.',
      [
        { text: 'Вийти', style: 'destructive', onPress: () => supabase.auth.signOut().catch(() => {}) },
        { text: 'Спробувати ще раз', style: 'cancel' },
      ],
    );
    return null;
  }, [session?.user?.id]);
}

// ── Debug logging ─────────────────────────────────────────
const AUTH_DEBUG = __DEV__;
function authLog(label: string, data?: unknown) {
  if (!AUTH_DEBUG) return;
  console.log(`[Auth] ${label}`, data !== undefined ? data : '');
}

// ── Provider ──────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const appState = useRef(AppState.currentState);
  const initialized = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  // ── 1. Auth state listener ──────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, s: Session | null) => {
        authLog('event', {
          event,
          hasSession: !!s,
          userId: s?.user?.id?.slice(0, 8),
          emailConfirmed: s?.user?.email_confirmed_at ?? 'none',
          expiresAt: s?.expires_at,
        });

        if (event === 'SIGNED_OUT') {
          sessionRef.current = null;
          setSession(null);
          setProfileComplete(null);
          setStatus('guest');
          // Wipe user-scoped AsyncStorage (cart, AI chats, PII caches, active
          // timer). Hooked to the event — not the profile button — so it also
          // covers session-expiry sign-outs and account deletion.
          clearUserScopedStorage().catch(() => {});
        } else if (event === 'INITIAL_SESSION') {
          if (s) {
            sessionRef.current = s;
            setSession(s);
            checkUserSwitch(s.user.id).catch(() => {});
            // status stays 'loading' until profile check
          } else if (!sessionRef.current) {
            setStatus('guest');
          }
          initialized.current = true;
        } else if (event === 'TOKEN_REFRESHED') {
          if (s) {
            sessionRef.current = s;
            setSession(s);
          }
          // null session on TOKEN_REFRESHED — ignore, keep old session
        } else if (s) {
          // SIGNED_IN, USER_UPDATED
          sessionRef.current = s;
          setSession(s);
          checkUserSwitch(s.user.id).catch(() => {});
          setStatus('loading'); // wait for profile check
        }
      },
    );

    const timeout = setTimeout(() => {
      if (!initialized.current) {
        authLog('timeout — forcing guest');
        setStatus('guest');
      }
    }, 5000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  // ── 2. Foreground token refresh ─────────────────────────
  useEffect(() => {
    const handle = (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && sessionRef.current) {
        const exp = sessionRef.current.expires_at;
        if (exp && exp - Math.floor(Date.now() / 1000) < 120) {
          authLog('foreground refresh');
          supabase.auth.refreshSession().catch(() => {});
        }
      }
      appState.current = nextState;
    };
    const sub = AppState.addEventListener('change', handle);
    return () => sub.remove();
  }, []);

  // ── 3. Profile check ───────────────────────────────────
  useEffect(() => {
    if (!session?.user?.id) {
      setProfileComplete(null);
      return;
    }

    authLog('checking profile', session.user.id.slice(0, 8));

    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, salon_name')
          .eq('id', session.user.id)
          .maybeSingle();

        authLog('profile result', { data, error: error?.message });

        // Only the name is mandatory. Salon name stays optional: a shopper
        // who registered just to check out must not be walled behind
        // business-profile questions (App Review 5.1.1(v) — registration may
        // only collect data relevant to the feature that required it).
        if (error) {
          setProfileComplete(false);
        } else if (!data || !data.name || !data.name.trim()) {
          setProfileComplete(false);
        } else {
          setProfileComplete(true);
        }
      } catch (e) {
        authLog('profile exception', e);
        setProfileComplete(false);
      } finally {
        setStatus('authed');
        authLog('status → authed', { profileComplete });
        // Register push token (fire-and-forget, never blocks auth)
        registerPushToken(session.user.id).catch(() => {});
      }
    })();
  }, [session?.user?.id]);

  return (
    <AuthContext.Provider value={{ session, status, profileComplete, setProfileComplete }}>
      {children}
    </AuthContext.Provider>
  );
}
