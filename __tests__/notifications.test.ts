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
  beforeEach(() => {
    // scheduleSolutionReminder now checks permissions first; tests assume granted.
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  });

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

  it('warning fires at 9:00 AM, expired fires at exact expiry time', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    future.setHours(12, 0, 0, 0); // mimic noon-anchored expiry from solution/add

    await scheduleSolutionReminder('sol-abc', 'Septonal', future.toISOString());

    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    const warning = calls.find((c) => c[0].identifier.endsWith('-warning'));
    const expired = calls.find((c) => c[0].identifier.endsWith('-expired'));

    expect(warning[0].trigger.date.getHours()).toBe(9);
    expect(warning[0].trigger.date.getMinutes()).toBe(0);

    // Previously fired at 9 AM on expiry day — caused "Прострочено" pushes
    // 3h before the in-app status flipped. Must match expiry exactly now.
    expect(expired[0].trigger.date.getTime()).toBe(future.getTime());
  });

  it('does not schedule when notification permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const future = new Date();
    future.setDate(future.getDate() + 10);

    await scheduleSolutionReminder('sol-ghi', 'Septonal', future.toISOString());

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
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
