/**
 * Send push notifications via Expo Push API.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send push messages. Never throws (M10): a push failure must not break the
 * caller's HTTP response (e.g. a webhook returning 500 would make KeyCRM retry).
 * When `admin` is provided, tokens that Expo reports as `DeviceNotRegistered`
 * are nulled in `profiles.expo_push_token` so we stop pushing to dead devices.
 */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
  admin?: SupabaseClient,
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  let resp: Response;
  try {
    resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.warn('[expo-push] request failed:', (e as Error).message);
    return [];
  }
  if (!resp.ok) {
    console.warn('[expo-push] HTTP', resp.status);
    return [];
  }

  const result = await resp.json().catch(() => ({}));
  const tickets: ExpoPushTicket[] = result.data ?? [];

  // Prune dead tokens — Expo returns tickets index-aligned with the messages.
  if (admin && tickets.length) {
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') {
        const tok = messages[i]?.to;
        if (tok) dead.push(tok);
      }
    });
    if (dead.length) {
      try {
        await admin.from('profiles').update({ expo_push_token: null }).in('expo_push_token', dead);
      } catch (e) {
        console.warn('[expo-push] dead-token cleanup failed:', (e as Error).message);
      }
    }
  }

  return tickets;
}

export function buildPushMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): ExpoPushMessage {
  return { to: token, title, body, sound: 'default', data };
}
