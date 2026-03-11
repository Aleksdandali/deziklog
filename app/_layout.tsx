import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { initDatabase } from '@/lib/db';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    try {
      initDatabase();
    } catch (e) {
      console.error('DB init error:', e);
    }
    SplashScreen.hideAsync();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="new-cycle"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="timer"
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
      <Stack.Screen
        name="complete-cycle"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="sterilizer/add"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="sterilizer/[id]"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="journal/[id]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="catalog/[id]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
