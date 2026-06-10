import { useEffect, useRef, type ComponentType } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
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
  const notifResponseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener>>();

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

  // Force navigation to /auth on logout. The guest and authed branches render
  // structurally identical trees, so React alone would keep the Stack (and its
  // navigation history with the previous user's screens) mounted across
  // logout — the `key` on each <Stack> below forces a remount that wipes that
  // state, and this replace then lands the fresh single-route history on the
  // phone-input form.
  useEffect(() => {
    if (status === 'guest') {
      router.replace('/auth' as any);
    }
  }, [status]);

  // Guests can still be routed into account screens the guest Stack doesn't
  // declare (warm deep links, stale notification taps) — expo-router keeps
  // every file route navigable, so the declared-screens subset alone isn't an
  // access control. Bounce anything outside the guest surface to /auth.
  // '/' is allowed: the home tab redirects guests to the catalog itself.
  useEffect(() => {
    if (status !== 'guest') return;
    const allowed =
      pathname === '/' ||
      pathname === '/auth' ||
      pathname === '/catalog' ||
      pathname === '/cart' ||
      pathname.startsWith('/product/') ||
      pathname.startsWith('/legal');
    if (!allowed) router.replace('/auth' as any);
  }, [status, pathname]);

  // Resume the flow that demanded the sign-in: if a guest screen stashed a
  // destination (cart checkout), open it once the authed tree — including
  // first-time onboarding — is fully ready.
  useEffect(() => {
    if (status !== 'authed' || profileComplete !== true) return;
    AsyncStorage.getItem(POST_AUTH_ROUTE_KEY)
      .then((route) => {
        if (!route) return;
        AsyncStorage.removeItem(POST_AUTH_ROUTE_KEY).catch(() => {});
        router.push(route as any);
      })
      .catch(() => {});
  }, [status, profileComplete]);

  // Handle notification taps — navigate to relevant screen
  useEffect(() => {
    const route = (data?: Record<string, string>) => {
      if (!data?.screen) return;
      try {
        if (data.screen === 'complete-cycle' && data.sessionId) {
          // Cycle-done alert → straight to the after-photo flow for that session.
          router.push(`/complete-cycle?sessionId=${data.sessionId}` as any);
        } else if (data.screen === 'order' && data.orderId) {
          router.push(`/order/${data.orderId}` as any);
        } else if (data.screen === 'journal') {
          router.push('/(tabs)/journal' as any);
        }
      } catch (err) {
        console.warn('Notification navigation failed:', err);
      }
    };

    // Cold start: the app was LAUNCHED by tapping a notification. The live
    // listener does NOT fire for that launching tap — and a 60-min cycle almost
    // always ends with the app killed, so this is the common path.
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

  if (status === 'loading' || !fontsReady) {
    return <AnimatedSplash />;
  }

  if (status === 'guest' || !session) {
    // App Review 5.1.1(v): the shop must be browsable WITHOUT registration.
    // Guests get the catalog, product pages and a local-only cart; checkout
    // and all journal/account features still require sign-in. The auth screen
    // stays the landing route (the status==='guest' effect above replaces to
    // /auth), with a "browse without registration" affordance on it.
    return (
      <CartProvider>
        <StatusBar style="dark" />
        <Stack key="guest" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="cart" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="legal/privacy" />
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
