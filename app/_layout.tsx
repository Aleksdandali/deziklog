import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Stack, useRouter, usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_200ExtraLight,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import ErrorBoundary from '../components/ErrorBoundary';
import OnboardingScreen from './onboarding';
import AnimatedSplash from '../components/AnimatedSplash';
import { COLORS, POST_AUTH_ROUTE_KEY } from '../lib/constants';

// Dev-only auth debug banner. Lazy require so production/preview bundles
// (where __DEV__ is statically false) tree-shake the component entirely.
const DebugAuthBanner: ComponentType | null = __DEV__
  ? require('../components/DebugAuthBanner').default
  : null;

// Import to initialize notification handler (side effect)
import '../lib/notifications';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, status, profileComplete, setProfileComplete } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const notifResponseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined>(undefined);
  // expo-router queues (or silently drops) navigation issued before the root
  // navigator mounts — during the splash, onboarding, and the auth-branch
  // swap there IS no navigator. Every effect below that calls router.* must
  // gate on this and re-run when the navigator appears.
  const navReady = !!useRootNavigationState()?.key;

  const [fontsLoaded, fontError] = useFonts({
    Inter_200ExtraLight,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Treat a font-load failure as "ready": fall back to the system font instead
  // of hanging on the splash forever. An infinite splash reads to App Review as
  // a launch failure / no-UI.
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (status !== 'loading' && fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [status, fontsReady]);

  // Force navigation to /auth ONLY on logout (authed → guest). A cold start
  // as guest deliberately does NOT redirect: the catalog is the landing
  // surface (App Review 5.1.1 — the reviewer must not face a login wall),
  // '/' resolves to the home tab which immediately redirects guests to
  // /(tabs)/catalog. On logout the `key` on each <Stack> below remounts the
  // navigator (wiping the previous user's history) and this replace lands
  // the fresh single-route history on the phone-input form.
  const prevStatusRef = useRef<typeof status | null>(null);
  const pendingLogoutNav = useRef(false);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === 'guest' && prev === 'authed') {
      pendingLogoutNav.current = true;
    }
    if (pendingLogoutNav.current && navReady) {
      pendingLogoutNav.current = false;
      router.replace('/auth' as any);
    }
  }, [status, navReady]);

  // Guests can still be routed into account screens the guest Stack doesn't
  // declare (warm deep links, stale notification taps) — expo-router keeps
  // every file route navigable, so the declared-screens subset alone isn't an
  // access control. Bounce anything outside the guest surface to /auth.
  // '/' is allowed: the home tab redirects guests to the catalog itself.
  useEffect(() => {
    if (status !== 'guest' || !navReady) return;
    const allowed =
      pathname === '/' ||
      pathname === '/auth' ||
      pathname === '/catalog' ||
      pathname === '/cart' ||
      pathname.startsWith('/product/') ||
      pathname.startsWith('/legal');
    if (!allowed) router.replace('/auth' as any);
  }, [status, pathname, navReady]);

  // Resume the flow that demanded the sign-in: if a guest screen stashed a
  // destination (cart checkout), open it once the authed tree — including
  // first-time onboarding — is fully ready.
  useEffect(() => {
    if (status !== 'authed' || profileComplete !== true || !navReady) return;
    AsyncStorage.getItem(POST_AUTH_ROUTE_KEY)
      .then((route) => {
        if (!route) return;
        AsyncStorage.removeItem(POST_AUTH_ROUTE_KEY).catch(() => {});
        router.push(route as any);
      })
      .catch(() => {});
  }, [status, profileComplete, navReady]);

  // Handle notification taps. The target is stashed and flushed by the effect
  // below once the navigator exists — on a cold start (app LAUNCHED by the
  // tap, the common path after a 60-min cycle) this effect runs while the
  // splash is still up and a direct router.push would be dropped.
  const pendingNotifRoute = useRef<string | null>(null);
  const [notifTick, setNotifTick] = useState(0);
  useEffect(() => {
    const route = (data?: Record<string, string>) => {
      if (!data?.screen) return;
      let target: string | null = null;
      if (data.screen === 'complete-cycle' && data.sessionId) {
        // Cycle-done alert → straight to the after-photo flow for that session.
        target = `/complete-cycle?sessionId=${data.sessionId}`;
      } else if (data.screen === 'order' && data.orderId) {
        target = `/order/${data.orderId}`;
      } else if (data.screen === 'journal') {
        target = '/(tabs)/journal';
      }
      if (!target) return;
      pendingNotifRoute.current = target;
      setNotifTick((t) => t + 1);
    };

    // The live listener does NOT fire for the launching tap — only
    // getLastNotificationResponseAsync sees it.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => route(response?.notification.request.content.data as Record<string, string> | undefined))
      .catch(() => {});

    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data as Record<string, string> | undefined);
    });

    return () => {
      notifResponseListener.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!navReady || !pendingNotifRoute.current) return;
    const target = pendingNotifRoute.current;
    pendingNotifRoute.current = null;
    try {
      router.push(target as any);
    } catch (err) {
      console.warn('Notification navigation failed:', err);
    }
  }, [navReady, notifTick]);

  if (status === 'loading' || !fontsReady) {
    return <AnimatedSplash />;
  }

  if (status === 'guest' || !session) {
    // App Review 5.1.1(v): the shop must be browsable WITHOUT registration.
    // Guests get the catalog, product pages and a local-only cart; checkout
    // and all journal/account features still require sign-in. The CATALOG is
    // the landing surface on a cold start ('/' → home tab → guest redirect to
    // /(tabs)/catalog); the auth screen appears only after an explicit logout
    // or when an account feature demands sign-in.
    return (
      <CartProvider>
        <StatusBar style="dark" />
        <Stack key="guest" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="cart" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="legal/privacy" />
          <Stack.Screen name="legal/how-to" />
        </Stack>
      </CartProvider>
    );
  }

  if (profileComplete === null) {
    return <AnimatedSplash />;
  }

  if (profileComplete === false) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingScreen onComplete={() => setProfileComplete(true)} />
      </>
    );
  }

  return (
    <CartProvider>
      <StatusBar style="dark" />
      <Stack key="authed" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-cycle" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="timer" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="complete-cycle" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="solution/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="solution/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="cabinet/sterilizers" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/instruments" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/solutions" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cycle/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="product/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cart" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="orders" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ai-chat" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="legal/privacy" />
        <Stack.Screen name="legal/how-to" />
      </Stack>
    </CartProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RootNavigator />
        {DebugAuthBanner ? <DebugAuthBanner /> : null}
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});
