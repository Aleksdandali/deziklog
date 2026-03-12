import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
  solutionName: string,
  expiresAt: string,
): Promise<void> {
  const expiryDate = new Date(expiresAt);
  const now = new Date();

  const threeDaysBefore = new Date(expiryDate);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  threeDaysBefore.setHours(9, 0, 0, 0);

  if (threeDaysBefore > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Розчин закінчується',
        body: `${solutionName} — залишилось 3 дні. Підготуйте заміну.`,
        sound: true,
      },
      trigger: { date: threeDaysBefore },
    });
  }

  const oneDayBefore = new Date(expiryDate);
  oneDayBefore.setDate(oneDayBefore.getDate() - 1);
  oneDayBefore.setHours(9, 0, 0, 0);

  if (oneDayBefore > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Розчин закінчується завтра!',
        body: `${solutionName} — термін спливає завтра. Потрібна заміна.`,
        sound: true,
      },
      trigger: { date: oneDayBefore },
    });
  }
}
