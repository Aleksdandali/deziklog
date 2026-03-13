import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { CartProvider } from '../lib/cart-context';
import OnboardingScreen from './onboarding';

type AuthContextType = { session: Session | null };
export const AuthContext = createContext<AuthContextType>({ session: null });
export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfileComplete(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfileComplete(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, salon_name')
          .eq('id', session.user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Profile check error:', error.message);
          setProfileComplete(false);
        } else if (!data || !data.name || !data.name.trim()) {
          setProfileComplete(false);
        } else {
          setProfileComplete(true);
        }
      } catch (e) {
        console.error('Profile check exception:', e);
        setProfileComplete(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  const handleOnboardingComplete = useCallback(() => {
    setProfileComplete(true);
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4b569e" />
      </View>
    );
  }

  if (!session) {
    return (
      <AuthContext.Provider value={{ session }}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
        </Stack>
      </AuthContext.Provider>
    );
  }

  if (profileComplete === false) {
    return (
      <AuthContext.Provider value={{ session }}>
        <StatusBar style="dark" />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ session }}>
      <CartProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="cycle/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="solution/add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="cabinet/sterilizers" options={{ presentation: 'modal' }} />
          <Stack.Screen name="cabinet/instruments" options={{ presentation: 'modal' }} />
          <Stack.Screen name="product/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="cart" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="legal/privacy" />
        </Stack>
      </CartProvider>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
