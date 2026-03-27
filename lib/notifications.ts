import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

    // Android needs a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4b569e',
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
  const expiryDate = new Date(expiresAt);
  const now = new Date();

  const twoDaysBefore = new Date(expiryDate);
  twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
  twoDaysBefore.setHours(9, 0, 0, 0);

  if (twoDaysBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `solution-${solutionId}-warning`,
      content: {
        title: 'Розчин закінчується',
        body: `${solutionName} — залишилось 2 дні. Підготуйте заміну.`,
        sound: true,
      },
      trigger: { type: 'date', date: twoDaysBefore } as any,
    });
  }

  const expiryDay = new Date(expiryDate);
  expiryDay.setHours(9, 0, 0, 0);

  if (expiryDay > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `solution-${solutionId}-expired`,
      content: {
        title: 'Розчин прострочений!',
        body: `${solutionName} — термін вийшов. Замініть розчин.`,
        sound: true,
      },
      trigger: { type: 'date', date: expiryDay } as any,
    });
  }
}

export async function cancelSolutionNotifications(solutionId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`solution-${solutionId}-warning`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`solution-${solutionId}-expired`).catch(() => {});
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
      sound: true,
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
      sound: true,
    },
    trigger: null,
  });
}
