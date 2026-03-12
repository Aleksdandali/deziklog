import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/lib/constants';

export default function RootLayout() {
  const { session, loading, setSession } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="cycle/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="solution/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="cabinet/sterilizers" options={{ presentation: 'modal' }} />
            <Stack.Screen name="cabinet/instruments" options={{ presentation: 'modal' }} />
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="(auth)/login" />
        )}
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
});
