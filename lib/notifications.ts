import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// This module is imported for its side effects at the very top of the app
// (app/_layout.tsx), BEFORE any UI and OUTSIDE the ErrorBoundary. A class error
// boundary cannot catch a throw that happens at module-load time, so a
// synchronous throw from any native call here would crash the app on launch
// with no UI. Guard the whole setup so notification wiring can never abort the
// cold-launch path; the async `.catch()`es below still handle their rejections.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Actionable category for cycle-completion alerts: a "Зробити фото ПІСЛЯ" button
  // that opens the app straight to the after-photo flow.
  Notifications.setNotificationCategoryAsync('cycle-done', [
    { identifier: 'TAKE_AFTER_PHOTO', buttonTitle: 'Зробити фото ПІСЛЯ', options: { opensAppToForeground: true } },
  ]).catch(() => {});

  // Android: a dedicated HIGH-importance channel for cycle-completion alerts, so
  // the banner + sound + vibration break through even when the phone is on silent
  // or locked. Created eagerly at module load — a scheduled local notification
  // needs its channel to exist before push registration runs.
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('cycle', {
      name: 'Завершення циклу',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#4b569e',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
  }
} catch {
  // Never let notification setup abort module load on a cold launch.
}

// ── Permission & Push Token ─────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Register for push notifications and save the Expo Push Token to profiles.
 * Safe to call multiple times — only updates DB if token changed.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      if (__DEV__) console.log('[Push] Permission not granted');
      return null;
    }

    // Android needs a notification channel.
    // IMPORTANT: on API 26+ sound is a CHANNEL property — setting `sound`
    // on the notification payload alone is silently ignored. We must declare
    // `sound: 'default'` here so cycle/order/solution notifications actually
    // ring. Channel settings are immutable after first creation, so users
    // who installed an older silent build keep silent until they reinstall.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4b569e',
        sound: 'default',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      if (__DEV__) console.log('[Push] No EAS projectId found');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save to Supabase (only if changed)
    await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (__DEV__) console.log('[Push] Token registered:', token.slice(0, 20) + '...');
    return token;
  } catch (err) {
    if (__DEV__) console.log('[Push] Registration failed:', err);
    return null;
  }
}

// ── Solution reminders (local) ──────────────────────────

export async function scheduleSolutionReminder(
  solutionId: string,
  solutionName: string,
  expiresAt: string,
): Promise<void> {
  // Bail out early if user denied notifications — scheduleNotificationAsync
  // otherwise silently no-ops, hiding the real reason from logs.
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const expiryDate = new Date(expiresAt);
  const now = new Date();

  // Two-days-before heads-up — 9:00 local on (expiry − 2 days) is fine.
  const twoDaysBefore = new Date(expiryDate);
  twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
  twoDaysBefore.setHours(9, 0, 0, 0);

  if (twoDaysBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `solution-${solutionId}-warning`,
      content: {
        title: 'Розчин закінчується',
        body: `${solutionName} — залишилось 2 дні. Підготуйте заміну.`,
        sound: 'default',
      },
      trigger: { type: 'date', date: twoDaysBefore } as any,
    });
  }

  // "Expired" notif must fire AT expiry, not before. Previously was 9:00
  // on the expiry day → users got "термін вийшов" while the in-app status
  // still showed "Активний".
  if (expiryDate > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `solution-${solutionId}-expired`,
      content: {
        title: 'Розчин прострочений!',
        body: `${solutionName} — термін вийшов. Замініть розчин.`,
        sound: 'default',
      },
      trigger: { type: 'date', date: expiryDate } as any,
    });
  }
}

export async function cancelSolutionNotifications(solutionId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`solution-${solutionId}-warning`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`solution-${solutionId}-expired`).catch(() => {});
}

/**
 * Schedule ALL cycle-completion alerts UP FRONT, at cycle start, with OS
 * time-interval triggers — so they fire even when the app is backgrounded,
 * locked, or killed (the common case for a 60-min cycle in a busy salon).
 * The on-screen JS timer only updates the ring; it must NOT be the alert source.
 *
 * Idempotent: fixed identifiers mean re-calling REPLACES the schedule (used by
 * the timer-screen foreground self-heal). Gated on notification_cycle_done for
 * the "done"+nudges; the 60-min overheat cap always fires (safety).
 */
export async function scheduleCycleNotifications(
  userId: string,
  sessionId: string,
  startedAtMs: number,
  recommendedMinutes: number,
): Promise<void> {
  let doneAllowed = true;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notification_cycle_done')
      .eq('id', userId)
      .maybeSingle();
    doneAllowed = data?.notification_cycle_done !== false;
  } catch {
    doneAllowed = true; // fail-open: a missed sterilization record is worse than an extra ping
  }

  const granted = await requestNotificationPermissions();
  if (!granted) return; // in-app green "ГОТОВО" state (widget/timer) carries it

  const MAX_CYCLE_SECONDS = 60 * 60;
  const ESCALATION_OFFSETS_SEC = [120, 300]; // gentle nudges at +2 / +5 min
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  const recSec = recommendedMinutes * 60;
  const navData = { screen: 'complete-cycle', sessionId };

  if (doneAllowed) {
    const doneIn = Math.max(1, recSec - elapsed);
    await Notifications.scheduleNotificationAsync({
      identifier: `timer-done-${sessionId}`,
      content: {
        title: 'Час стерилізації досягнуто',
        body: 'Мінімальний час пройшов. Зробіть фото індикатора ПІСЛЯ і завершіть цикл.',
        sound: 'default',
        interruptionLevel: 'timeSensitive',
        categoryIdentifier: 'cycle-done',
        data: navData,
      },
      trigger: { type: 'timeInterval', seconds: doneIn, channelId: 'cycle' } as any,
    }).catch(() => {});

    // Gentle escalation — NOT timeSensitive, so these obey Focus/DND.
    for (let i = 0; i < ESCALATION_OFFSETS_SEC.length; i++) {
      const nudgeIn = Math.max(1, recSec - elapsed + ESCALATION_OFFSETS_SEC[i]);
      await Notifications.scheduleNotificationAsync({
        identifier: `timer-nudge-${sessionId}-${i}`,
        content: {
          title: 'Цикл готовий',
          body: 'Не забудьте зробити фото індикатора ПІСЛЯ та завершити запис.',
          sound: 'default',
          categoryIdentifier: 'cycle-done',
          data: navData,
        },
        trigger: { type: 'timeInterval', seconds: nudgeIn, channelId: 'cycle' } as any,
      }).catch(() => {});
    }
  }

  // Hard overheat cap — always scheduled (ignores the comfort pref). Skipped when
  // it would coincide with "done" (dry-heat min 60min == cap), to avoid a
  // contradictory done+overheat pair.
  const capIn = Math.max(1, MAX_CYCLE_SECONDS - elapsed);
  if (capIn > recSec) {
    await Notifications.scheduleNotificationAsync({
      identifier: `timer-cap-${sessionId}`,
      content: {
        title: 'Завершіть цикл',
        body: 'Минула 1 година. Подальший нагрів може пошкодити інструменти.',
        sound: 'default',
        interruptionLevel: 'timeSensitive',
        categoryIdentifier: 'cycle-done',
        data: navData,
      },
      trigger: { type: 'timeInterval', seconds: capIn, channelId: 'cycle' } as any,
    }).catch(() => {});
  }
}

/**
 * Clear cycle timer notifications when a cycle is canceled OR completed.
 * Cancels any pending schedule AND dismisses an already-delivered banner from
 * the tray, so the master doesn't see "час досягнуто" after aborting/finishing.
 */
export async function cancelCycleNotifications(sessionId: string): Promise<void> {
  const ids = [
    `timer-done-${sessionId}`,
    `timer-cap-${sessionId}`,
    `timer-nudge-${sessionId}-0`,
    `timer-nudge-${sessionId}-1`,
  ];
  for (const id of ids) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Notifications.dismissNotificationAsync(id).catch(() => {});
  }
}

// ── Cycle notifications (local) ─────────────────────────

/** Show local notification when cycle completes. Checks notification_cycle_done flag. */
export async function notifyCycleDone(userId: string, instruments: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notification_cycle_done')
      .eq('id', userId)
      .maybeSingle();
    if (data?.notification_cycle_done === false) return;
  } catch (err) {
    console.warn('Notifications: failed to check cycle_done pref:', err);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `cycle-done-${Date.now()}`,
    content: {
      title: 'Цикл завершено',
      body: `Стерилізація завершена: ${instruments}.`,
      // 'default' (not `true`) is the canonical form: it maps to the system
      // default sound on iOS and tells expo-notifications to use the channel
      // sound on Android. Plain `true` is silently dropped on some devices.
      sound: 'default',
      // iOS: breaks through Focus / DND for safety-critical events.
      interruptionLevel: 'timeSensitive',
    },
    trigger: null,
  });
}

// ── Order status notification (local fallback) ──────────

/** Show local notification when order status changes. Checks notification_order_status flag. */
export async function notifyOrderStatusChange(userId: string, orderId: string, newStatus: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notification_order_status')
      .eq('id', userId)
      .maybeSingle();
    if (data?.notification_order_status === false) return;
  } catch (err) {
    console.warn('Notifications: failed to check order_status pref:', err);
  }

  const statusLabels: Record<string, string> = {
    confirmed: 'підтверджено',
    canceled: 'скасовано',
  };
  const label = statusLabels[newStatus] ?? newStatus;
  await Notifications.scheduleNotificationAsync({
    identifier: `order-${orderId}-status`,
    content: {
      title: 'Статус замовлення змінено',
      body: `Ваше замовлення ${label}.`,
      sound: 'default',
    },
    trigger: null,
  });
}
