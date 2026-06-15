import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { getCapSeconds } from './steri-config';

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

/**
 * Detach this device's push token from the account. Must run BEFORE
 * signOut() (needs the live session for the RLS-scoped update) — otherwise
 * order/solution pushes for the previous account keep arriving on a shared
 * salon device after the next user signs in.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('id', userId);
    if (__DEV__) console.log('[Push] Token unregistered');
  } catch (err) {
    if (__DEV__) console.log('[Push] Unregister failed:', err);
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
 * the "done"+nudges; the final +30-min "цикл не зафіксовано" reminder always
 * fires (the journal record matters regardless of the comfort pref).
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

  // Cap is relative to the mode (rec + 30 min) — a fixed 60-min cap used to
  // contradict the 160°C/150 хв preset.
  const capSeconds = getCapSeconds(recommendedMinutes);
  // Gentle nudges at +5 / +15 min. Spaced out on purpose: a master is usually
  // mid-procedure with a client when the cycle finishes, so +2/+5 pinging felt
  // like spam. Progression is now done → +5 → +15 → cap (+30).
  const ESCALATION_OFFSETS_SEC = [300, 900];
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  const recSec = recommendedMinutes * 60;
  const navData = { screen: 'complete-cycle', sessionId };

  // An alert whose moment already passed must NOT be re-armed: fixed ids
  // replace PENDING requests, but a delivered one can't be replaced — on the
  // self-heal path (timer screen remount) re-scheduling it would fire a fresh
  // banner+sound ~1 s later every time the master peeks at a finished cycle.

  if (doneAllowed) {
    if (elapsed < recSec) {
      await Notifications.scheduleNotificationAsync({
        identifier: `timer-done-${sessionId}`,
        content: {
          title: 'Час стерилізації досягнуто',
          body: 'Час стерилізації пройшов. Зробіть фото індикатора ПІСЛЯ і завершіть цикл.',
          sound: 'default',
          interruptionLevel: 'timeSensitive',
          categoryIdentifier: 'cycle-done',
          data: navData,
        },
        trigger: { type: 'timeInterval', seconds: Math.max(1, recSec - elapsed), channelId: 'cycle' } as any,
      }).catch(() => {});
    }

    // Gentle escalation — NOT timeSensitive, so these obey Focus/DND.
    for (let i = 0; i < ESCALATION_OFFSETS_SEC.length; i++) {
      if (elapsed >= recSec + ESCALATION_OFFSETS_SEC[i]) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `timer-nudge-${sessionId}-${i}`,
        content: {
          title: 'Цикл готовий',
          body: 'Не забудьте зробити фото індикатора ПІСЛЯ та завершити запис.',
          sound: 'default',
          categoryIdentifier: 'cycle-done',
          data: navData,
        },
        trigger: { type: 'timeInterval', seconds: Math.max(1, recSec - elapsed + ESCALATION_OFFSETS_SEC[i]), channelId: 'cycle' } as any,
      }).catch(() => {});
    }
  }

  // Final reminder at the cap — always scheduled (ignores the comfort pref).
  // The sterilizer switches itself off, so nothing is at risk physically;
  // what's at risk is the JOURNAL RECORD — without the after-photo the cycle
  // never lands in the regulatory journal.
  if (elapsed < capSeconds) {
    await Notifications.scheduleNotificationAsync({
      identifier: `timer-cap-${sessionId}`,
      content: {
        title: 'Цикл не зафіксовано в журналі',
        body: 'Стерилізатор вже завершив роботу. Зробіть фото індикатора ПІСЛЯ та збережіть запис.',
        sound: 'default',
        interruptionLevel: 'timeSensitive',
        categoryIdentifier: 'cycle-done',
        data: navData,
      },
      trigger: { type: 'timeInterval', seconds: Math.max(1, capSeconds - elapsed), channelId: 'cycle' } as any,
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
