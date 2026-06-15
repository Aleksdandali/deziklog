import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { AppText as Text } from './AppText';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../lib/constants';
import { updateSession } from '../lib/api';
import { cancelCycleNotifications } from '../lib/notifications';
import { useSessionGuard } from '../lib/auth-context';

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
  const getUid = useSessionGuard();
  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleCancel = () => {
    if (!timerData) return;
    Alert.alert('Скасувати цикл?', 'Запис буде позначений як скасований.', [
      { text: 'Ні, продовжити', style: 'cancel' },
      {
        text: 'Так, скасувати',
        style: 'destructive',
        onPress: async () => {
          try {
            const uid = await getUid();
            if (uid) await updateSession(timerData.sessionId, uid, { status: 'canceled' });
          } catch (err) {
            console.warn('Widget: failed to cancel session:', err);
          }
          await cancelCycleNotifications(timerData.sessionId);
          await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
          setTimerData(null);
        },
      },
    ]);
  };

  // Re-check AsyncStorage every time Home tab gains focus.
  // `cancelled` guards against the race where focus is lost during the
  // AsyncStorage await — without it, a setInterval would start after the
  // cleanup function had already returned, leaking a 1Hz timer per focus
  // cycle (battery drain).
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      if (cancelled) return;
      if (stored) {
        const data: TimerData = JSON.parse(stored);
        setTimerData(data);
        // Count UP elapsed time, frozen at the selected protocol duration —
        // mirrors the timer screen exactly so Home and the timer never disagree.
        const cap = data.duration > 0 ? data.duration * 60 : Infinity;
        const tick = () => Math.min(cap, Math.floor((Date.now() - data.startedAt) / 1000));
        setElapsed(tick());

        interval = setInterval(() => {
          const el = tick();
          setElapsed(el);
          if (el >= cap && interval) { clearInterval(interval); interval = null; }
        }, 1000);
      } else {
        setTimerData(null);
      }
    };

    check();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []));

  if (!timerData) return null;

  const durationSec = timerData.duration * 60;
  // "Reached" = minimum exposure time hit. The cycle is NOT auto-finished —
  // the master still has to open the timer and complete it (mirrors timer.tsx
  // `isReached`, which shows "готово", not "завершено").
  const isReached = durationSec > 0 && elapsed >= durationSec;
  const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const sec = String(elapsed % 60).padStart(2, '0');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/timer?sessionId=${timerData.sessionId}&duration=${timerData.duration}`)}
    >
      <LinearGradient
        colors={isReached ? [COLORS.success, '#059669'] : [COLORS.brand, COLORS.brandDark]}
        style={styles.widget}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.iconWrap}>
          <Feather name={isReached ? 'check-circle' : 'clock'} size={24} color={COLORS.white} />
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>
            {isReached ? 'ГОТОВО — зробіть фото ПІСЛЯ' : 'Стерилізація в процесі'}
          </Text>
          <Text style={styles.time}>{`${min}:${sec} пройшло`}</Text>
        </View>
        <TouchableOpacity onPress={handleCancel} hitSlop={10} style={styles.cancelBtn} activeOpacity={0.7}>
          <Feather name="x" size={18} color={COLORS.white} />
        </TouchableOpacity>
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
  cancelBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
