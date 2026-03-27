import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated, Easing, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { updateSession } from '../lib/api';
import { useSessionGuard } from '../lib/auth-context';
import { COLORS } from '../lib/constants';
import { RADII } from '../lib/theme';
import { formatElapsed } from '../lib/steri-config';

const RING_SIZE = 260;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const RING_R = 95;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const ACTIVE_TIMER_KEY = 'active_timer';

interface TimerData {
  sessionId: string;
  duration: number; // recommended minutes
  startedAt: number;
  sterilizerName: string;
  temperature: number;
  instruments: string;
  photoBeforeUri?: string;
}

export default function TimerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string; duration: string }>();
  const getUid = useSessionGuard();

  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colonOpacity = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
      if (stored) {
        try {
          const data: TimerData = JSON.parse(stored);
          setTimerData(data);
          setElapsed(Math.floor((Date.now() - data.startedAt) / 1000));
        } catch {
          await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
        }
      } else if (params.sessionId && params.duration) {
        const data: TimerData = {
          sessionId: params.sessionId,
          duration: parseInt(params.duration, 10),
          startedAt: Date.now(),
          sterilizerName: '',
          temperature: 0,
          instruments: '',
        };
        setTimerData(data);
      }
    })();
  }, []);

  const recommendedSeconds = (timerData?.duration ?? 0) * 60;
  const progress = recommendedSeconds > 0 ? Math.min(1, elapsed / recommendedSeconds) : 0;
  const isReached = elapsed >= recommendedSeconds && recommendedSeconds > 0;
  const almostDone = !isReached && recommendedSeconds > 0 && (recommendedSeconds - elapsed) <= 60;

  const { minutes: elapsedMin, seconds: elapsedSec } = formatElapsed(elapsed);

  const recommendedSecondsRef = useRef(recommendedSeconds);
  recommendedSecondsRef.current = recommendedSeconds;

  useEffect(() => {
    if (!timerData) return;

    // Clear any previous interval to prevent duplicates
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - timerData.startedAt) / 1000);
      setElapsed(newElapsed);
      const recSec = recommendedSecondsRef.current;
      // Haptic every minute
      if (newElapsed > 0 && newElapsed % 60 === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // Haptic + local notification when recommended time reached
      if (newElapsed === recSec && recSec > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Notifications.scheduleNotificationAsync({
          identifier: `timer-done-${timerData.sessionId}`,
          content: {
            title: 'Час стерилізації досягнуто',
            body: 'Мінімальний час пройшов. Можна завершувати цикл.',
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
      }
    }, 1000);

    const colonAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(colonOpacity, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(colonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    colonAnim.start();

    const dotAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.4, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1.0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    dotAnim.start();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      colonAnim.stop();
      dotAnim.stop();
    };
  }, [timerData]);

  const handleComplete = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timerData) {
      router.replace(`/complete-cycle?sessionId=${timerData.sessionId}`);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Скасувати цикл?',
      'Запис буде позначений як скасований.',
      [
        { text: 'Ні, продовжити', style: 'cancel' },
        {
          text: 'Так, скасувати',
          style: 'destructive',
          onPress: async () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (timerData) {
              try {
                const uid = await getUid();
                if (uid) await updateSession(timerData.sessionId, uid, { status: 'canceled' });
              } catch (err) {
                console.warn('Timer: failed to cancel session:', err);
              }
              await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);
            }
            router.replace('/(tabs)');
          },
        },
      ],
    );
  };

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const progressAngle = progress * 2 * Math.PI - Math.PI / 2;
  const dotX = RING_CX + RING_R * Math.cos(progressAngle);
  const dotY = RING_CY + RING_R * Math.sin(progressAngle);

  const ringColor = isReached ? COLORS.success : almostDone ? COLORS.warning : COLORS.brand;

  if (!timerData) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Feather name="alert-circle" size={48} color={COLORS.textSecondary} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 12, textAlign: 'center' }}>Таймер не знайдено</Text>
          <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center' }}>Можливо, цикл було скасовано</Text>
          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 24 }]}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
          >
            <Feather name="home" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>На головну</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const recommendedMin = timerData.duration;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={handleCancel} hitSlop={12}>
          <Text style={s.cancelText}>Скасувати</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Стерилізація</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={s.content}>
        {/* Status label */}
        <View style={[s.statusPill, { backgroundColor: isReached ? COLORS.success + '18' : almostDone ? COLORS.warning + '18' : COLORS.brand + '12' }]}>
          <View style={[s.statusDot, { backgroundColor: ringColor }]} />
          <Text style={[s.statusText, { color: ringColor }]}>
            {isReached ? 'Мінімальний час досягнуто' : almostDone ? 'Майже готово' : 'Йде стерилізація'}
          </Text>
        </View>

        <View style={s.ringContainer}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <SvgCircle cx={RING_CX} cy={RING_CY} r={RING_R} stroke={COLORS.cardBg} strokeWidth={4} fill="none" />
            <SvgCircle
              cx={RING_CX} cy={RING_CY} r={RING_R}
              stroke={ringColor}
              strokeWidth={4} fill="none"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
            />
          </Svg>

          {!isReached && (
            <Animated.View style={[s.leaderDot, { left: dotX - 6, top: dotY - 6, transform: [{ scale: dotScale }] }]}>
              <View style={[s.leaderDotInner, { backgroundColor: ringColor }]} />
            </Animated.View>
          )}

          <View style={s.timerCenter}>
            <View style={s.timeRow}>
              <Text style={s.timeDigit}>{elapsedMin}</Text>
              <Animated.Text style={[s.timeColon, { opacity: colonOpacity }]}>:</Animated.Text>
              <Text style={s.timeDigit}>{elapsedSec}</Text>
            </View>
            <Text style={s.timerLabel}>
              {isReached ? 'готово' : 'пройшло'}
            </Text>
          </View>
        </View>

        {/* Recommended time hint */}
        <View style={s.recommendedRow}>
          <MaterialCommunityIcons name="timer-outline" size={16} color={COLORS.textSecondary} />
          <Text style={s.recommendedText}>Мінімальний час: {recommendedMin} хв</Text>
        </View>

        {(timerData.temperature > 0 || timerData.sterilizerName) && (
          <View style={s.infoCard}>
            <View style={s.infoColumns}>
              <View style={s.infoCol}>
                <MaterialCommunityIcons name="thermometer" size={20} color={COLORS.brand} />
                <Text style={s.infoValue}>{timerData.temperature}°C</Text>
              </View>
              <View style={s.infoDivider} />
              <View style={s.infoCol}>
                <MaterialCommunityIcons name="radiator" size={20} color={COLORS.brand} />
                <Text style={s.infoValue} numberOfLines={1}>{timerData.sterilizerName}</Text>
              </View>
              <View style={s.infoDivider} />
              <View style={s.infoCol}>
                <MaterialCommunityIcons name="scissors-cutting" size={20} color={COLORS.brand} />
                <Text style={s.infoValue} numberOfLines={1}>{timerData.instruments.split(',')[0]}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={s.nextHint}>
          {isReached
            ? 'Час достатній. Зробіть фото індикатора ПІСЛЯ для завершення.'
            : 'Після досягнення мінімального часу зробите фото для порівняння'}
        </Text>

        <TouchableOpacity
          style={[s.primaryBtn, isReached && { backgroundColor: COLORS.success }]}
          onPress={handleComplete}
          activeOpacity={0.85}
        >
          <Feather name="camera" size={18} color="#fff" />
          <Text style={s.primaryBtnText}>Завершити цикл — фото ПІСЛЯ</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  cancelText: { fontSize: 14, fontWeight: '600', color: COLORS.danger },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill, marginBottom: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  ringContainer: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  leaderDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  leaderDotInner: { width: 12, height: 12, borderRadius: 6 },
  timerCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline' },
  timeDigit: { fontSize: 44, fontWeight: '200', color: COLORS.text, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timeColon: { fontSize: 44, fontWeight: '200', color: COLORS.text, marginHorizontal: 2 },
  timerLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 1, marginTop: 4 },

  recommendedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  recommendedText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  infoCard: { backgroundColor: COLORS.cardBg, borderRadius: RADII.lg, padding: 16, width: '100%', marginBottom: 12 },
  infoColumns: { flexDirection: 'row', alignItems: 'center' },
  infoCol: { flex: 1, alignItems: 'center', gap: 4 },
  infoDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.text, textAlign: 'center' },

  nextHint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 19 },

  primaryBtn: { flexDirection: 'row', width: '100%', height: 54, borderRadius: RADII.lg, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
