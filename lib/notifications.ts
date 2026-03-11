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

export async function requestNotificationPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleTimerNotification(durationMinutes: number): Promise<string> {
  await Notifications.requestPermissionsAsync();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Стерилізація завершена!',
      body: 'Час дістати інструменти та зафіксувати результат',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: durationMinutes * 60,
      repeats: false,
    },
  });
  return id;
}

export async function cancelNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function scheduleReminderNotification(intervalHours: number): Promise<string> {
  await Notifications.requestPermissionsAsync();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Час стерилізувати',
      body: 'Не забудьте записати цикл стерилізації в журнал',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: intervalHours * 60 * 60,
      repeats: true,
    },
  });
  return id;
}
