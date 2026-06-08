import * as Haptics from 'expo-haptics';

/**
 * Thin, fire-and-forget wrapper over expo-haptics for consistent tactile
 * feedback on meaningful actions (not every tap). All calls swallow errors —
 * haptics are a nicety, never a failure path, and are no-ops on web / unsupported
 * devices.
 *
 *   haptic.select()  — light, for picking a chip / toggling an option
 *   haptic.tap()     — light impact, for a primary button press
 *   haptic.press()   — medium impact, for a stronger confirm (start, add to cart)
 *   haptic.success() — notification, for a completed action (saved, ordered)
 *   haptic.warn()    — notification, for a cautionary action (cancel, remove)
 *   haptic.error()   — notification, for a failed action
 */
export const haptic = {
  select: () => { Haptics.selectionAsync().catch(() => {}); },
  tap: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  press: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warn: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
  error: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};
