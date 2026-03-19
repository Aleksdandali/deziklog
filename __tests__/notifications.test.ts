import * as Notifications from 'expo-notifications';
import { scheduleSolutionReminder, cancelSolutionNotifications, requestNotificationPermissions } from '../lib/notifications';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestNotificationPermissions', () => {
  it('returns true when already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestNotificationPermissions()).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not granted and returns result', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestNotificationPermissions()).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('returns false when permission denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await requestNotificationPermissions()).toBe(false);
  });
});

describe('scheduleSolutionReminder', () => {
  it('schedules two notifications for a future expiry date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);

    await scheduleSolutionReminder('sol-123', 'Деланол', future.toISOString());

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    expect(calls[0][0].identifier).toBe('solution-sol-123-warning');
    expect(calls[0][0].content.body).toContain('2 дні');
    expect(calls[1][0].identifier).toBe('solution-sol-123-expired');
    expect(calls[1][0].content.body).toContain('вийшов');
  });

  it('skips reminders that are already in the past', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59);

    await scheduleSolutionReminder('sol-456', 'Bionol', tomorrow.toISOString());

    const count = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it('schedules no notifications if expiry is in the past', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);

    await scheduleSolutionReminder('sol-789', 'Instrum', past.toISOString());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('sets reminder time to 9:00 AM local time', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);

    await scheduleSolutionReminder('sol-abc', 'Septonal', future.toISOString());

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    for (const call of calls) {
      const triggerDate: Date = call[0].trigger.date;
      expect(triggerDate.getHours()).toBe(9);
      expect(triggerDate.getMinutes()).toBe(0);
    }
  });

  it('includes solution name in notification body', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);

    await scheduleSolutionReminder('sol-def', 'Деланол', future.toISOString());

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    for (const call of calls) {
      expect(call[0].content.body).toContain('Деланол');
    }
  });
});

describe('cancelSolutionNotifications', () => {
  it('cancels both warning and expired notifications', async () => {
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);

    await cancelSolutionNotifications('sol-123');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('solution-sol-123-warning');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('solution-sol-123-expired');
  });
});
