import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../lib/auth-context';

const SHOW_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_DEBUG_AUTH === '1';

export default function DebugAuthBanner() {
  const { session, status, profileComplete } = useAuth();

  if (!SHOW_DEBUG) return null;

  const uid = session?.user?.id?.slice(0, 8) ?? 'none';
  const email = session?.user?.email ?? 'none';
  const exp = session?.expires_at
    ? new Date(session.expires_at * 1000).toLocaleTimeString()
    : 'none';

  return (
    <View style={s.banner}>
      <Text style={s.text}>
        {status} | uid:{uid} | profile:{String(profileComplete)} | exp:{exp}
      </Text>
      <Text style={s.text}>{email}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 100,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 8,
    padding: 6,
    zIndex: 9999,
  },
  text: {
    color: '#0f0',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
