import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import ErrorBoundary from '../components/ErrorBoundary';
import DebugAuthBanner from '../components/DebugAuthBanner';
import OnboardingScreen from './onboarding';
import AnimatedSplash from '../components/AnimatedSplash';
import IntroSplash from '../components/IntroSplash';
import { COLORS } from '../lib/constants';

// Import to initialize notification handler (side effect)
import '../lib/notifications';

SplashScreen.preventAutoHideAsync();

// Plays only on cold start — survives re-renders, resets when the JS bundle
// reloads (Fast Refresh / app re-launch). Intro Lottie is ~2.5s; we gate the
// rest of the tree behind it so any flash of native splash → other UI is
// hidden during that window.
const INTRO_DURATION_MS = 2500;
let introPlayed = false;

function RootNavigator() {
  const { session, status, profileComplete, setProfileComplete } = useAuth();
  const router = useRouter();
  const notifResponseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener>>();
  const [introDone, setIntroDone] = useState(introPlayed);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Hide native splash as soon as fonts are ready so the JS-rendered intro
  // (or AnimatedSplash) can take over. Don't wait for auth status — auth can
  // take a moment and we want the intro to start playing immediately.
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Cold-start intro: play once, then mark done globally.
  useEffect(() => {
    if (introPlayed) return;
    const t = setTimeout(() => {
      introPlayed = true;
      setIntroDone(true);
    }, INTRO_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  // Force navigation to /auth on logout. Without this, expo-router can keep
  // the previous URL (e.g. /(tabs)/profile) in its history while the root
  // Stack re-renders with only the `auth` screen declared — leaving the user
  // looking at a blank or stale screen instead of the phone-input form.
  useEffect(() => {
    if (status === 'guest') {
      // `replace` (not `push`) — wipes any authed-area screens from history
      // so the back gesture can't reveal them.
      router.replace('/auth' as any);
    }
  }, [status]);

  // Handle notification taps — navigate to relevant screen
  useEffect(() => {
    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data?.screen) return;
      try {
        if (data.screen === 'order' && data.orderId) {
          router.push(`/order/${data.orderId}` as any);
        } else if (data.screen === 'journal') {
          router.push('/(tabs)/journal' as any);
        }
      } catch (err) {
        console.warn('Notification navigation failed:', err);
      }
    });

    return () => {
      notifResponseListener.current?.remove();
    };
  }, []);

  // Intro splash overrides everything on cold start.
  if (!introDone && fontsLoaded) {
    return <IntroSplash />;
  }

  if (status === 'loading' || !fontsLoaded) {
    return <AnimatedSplash />;
  }

  if (status === 'guest' || !session) {
    return (
      <>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
        </Stack>
      </>
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
      <Stack screenOptions={{ headerShown: false }}>
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
        <DebugAuthBanner />
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
