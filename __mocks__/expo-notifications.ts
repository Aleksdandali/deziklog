export const setNotificationHandler = jest.fn();
export const getPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const requestPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });
export const scheduleNotificationAsync = jest.fn().mockResolvedValue('notification-id');
export const cancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);
