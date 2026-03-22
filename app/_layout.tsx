import { useEffect, useRef } from 'react';
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
import { COLORS } from '../lib/constants';

// Import to initialize notification handler (side effect)
import '../lib/notifications';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, status, profileComplete, setProfileComplete } = useAuth();
  const router = useRouter();
  const notifResponseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener>>();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (status !== 'loading' && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [status, fontsLoaded]);

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
      } catch {}
    });

    return () => {
      notifResponseListener.current?.remove();
    };
  }, []);

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
        <Stack.Screen name="complete-cycle" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="solution/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cabinet/sterilizers" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/instruments" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cabinet/solutions" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cycle/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="product/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="cart" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
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
