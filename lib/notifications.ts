import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

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

// ── Cycle notifications ─────────────────────────────────

/** Show local notification when cycle completes (if user has notification_cycle_done enabled) */
export async function notifyCycleDone(instruments: string): Promise<void> {
  // TODO: Check profile.notification_cycle_done before calling
  await Notifications.scheduleNotificationAsync({
    identifier: `cycle-done-${Date.now()}`,
    content: {
      title: 'Цикл завершено ✅',
      body: `Стерилізація завершена: ${instruments}. Зробіть фото ПІСЛЯ.`,
      sound: true,
    },
    trigger: null, // immediate
  });
}

/** Show local notification when order status changes (if user has notification_order_status enabled) */
export async function notifyOrderStatusChange(orderId: string, newStatus: string): Promise<void> {
  // TODO: Check profile.notification_order_status before calling
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
