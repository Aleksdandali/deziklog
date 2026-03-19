import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../lib/constants';

const ACTIVE_TIMER_KEY = 'active_timer';

interface TimerData {
  sessionId: string;
  duration: number;
  startedAt: number;
  sterilizerName: string;
  temperature: number;
  instruments: string;
}

export default function ActiveTimerWidget() {
  const router = useRouter();
  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [remaining, setRemaining] = useState(0);

  // Re-check AsyncStorage every time Home tab gains focus
  useFocusEffect(useCallback(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      if (stored) {
        const data: TimerData = JSON.parse(stored);
        setTimerData(data);
        const durationSec = data.duration * 60;
        const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
        setRemaining(Math.max(0, durationSec - elapsed));

        interval = setInterval(() => {
          const el = Math.floor((Date.now() - data.startedAt) / 1000);
          const rem = Math.max(0, durationSec - el);
          setRemaining(rem);
        }, 1000);
      } else {
        setTimerData(null);
      }
    };

    check();
    return () => { if (interval) clearInterval(interval); };
  }, []));

  if (!timerData) return null;

  const min = String(Math.floor(remaining / 60)).padStart(2, '0');
  const sec = String(remaining % 60).padStart(2, '0');
  const isDone = remaining === 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/timer?sessionId=${timerData.sessionId}&duration=${timerData.duration}`)}
    >
      <LinearGradient
        colors={isDone ? [COLORS.success, '#2E7D32'] : [COLORS.brand, COLORS.brandDark]}
        style={styles.widget}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.iconWrap}>
          <Feather name={isDone ? 'check-circle' : 'clock'} size={24} color={COLORS.white} />
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>
            {isDone ? 'Стерилізація завершена!' : 'Стерилізація в процесі'}
          </Text>
          <Text style={styles.time}>{isDone ? 'Зробіть фото ПІСЛЯ' : `${min}:${sec} залишилось`}</Text>
        </View>
        <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  widget: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, gap: 12, marginBottom: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  time: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontVariant: ['tabular-nums'] },
});
