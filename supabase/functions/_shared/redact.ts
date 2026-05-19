// PII redactor for edge function logs.
//
// Edge function logs are visible to anyone with project access in Supabase
// Studio. KeyCRM/NovaPoshta error responses echo back the request payload —
// which contains phone, full name, email, and shipping address. We strip
// those before they reach console.* and orders.keycrm_sync_error.

const PII_KEYS = new Set([
  // generic
  "phone", "email", "address", "full_name", "name",
  "first_name", "last_name",
  // KeyCRM
  "recipient_phone", "recipient_full_name",
  "recipient_first_name", "recipient_last_name",
  "shipping_receive_point", "shipping_address_city",
  // NovaPoshta camelCase
  "SendersPhone", "RecipientsPhone", "RecipientName",
  "ContactSender", "RecipientAddress", "RecipientAddressName",
  "RecipientCityName",
]);

const EMAIL_RE = /([a-z0-9._%+-])[a-z0-9._%+-]*(@[a-z0-9.-]+\.[a-z]{2,})/gi;
// 7+ consecutive digits (optionally with + prefix) — phone-like.
const PHONE_RE = /(\+?\d{1,4})\d{3,}(\d{2})/g;

function maskString(s: string): string {
  return s.replace(EMAIL_RE, "$1***$2").replace(PHONE_RE, "$1***$2");
}

/** Returns a JSON string with PII fields redacted and phone/email patterns
 *  masked inside any remaining string values. Safe to call on errors,
 *  arbitrary objects, and primitives. */
export function redact(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      if (PII_KEYS.has(key) && typeof v === "string" && v.length > 0) {
        return "<redacted>";
      }
      if (typeof v === "string") return maskString(v);
      return v;
    }) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}
