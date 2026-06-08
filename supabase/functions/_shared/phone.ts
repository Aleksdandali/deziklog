/**
 * Phone normalization + KeyCRM buyer-phone matching.
 *
 * Shared by sync-logic, lookup-keycrm-buyer and get-keycrm-history so all three
 * verify a KeyCRM buyer's identity the same way (H5): KeyCRM's `filter[phone]`
 * is a loose/substring match, so a returned buyer must be re-checked by exact
 * E.164 equality before we trust/cache it or expose its order history.
 */

/** Normalize any phone string to E.164 (+380XXXXXXXXX). */
export function toE164(phone: string | null | undefined): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("380")) return `+${d}`;
  if (d.startsWith("0") && d.length === 10) return `+38${d}`;
  if (d.length === 9) return `+380${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

/** True only if both phones normalize to the same non-empty E.164. */
export function phonesMatchE164(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = toE164(a), nb = toE164(b);
  return !!na && !!nb && na === nb;
}

/** Extract all phone strings from a KeyCRM buyer object (handles phone, phone[], phones[]). */
export function buyerPhones(b: unknown): string[] {
  const out: string[] = [];
  const o = b as { phone?: unknown; phones?: unknown } | null | undefined;
  if (typeof o?.phone === "string") out.push(o.phone);
  if (Array.isArray(o?.phone)) out.push(...(o!.phone as unknown[]).map((p) => String(p)));
  if (Array.isArray(o?.phones)) {
    out.push(...(o!.phones as unknown[]).map((p) => {
      const pp = p as { phone?: unknown };
      return typeof pp?.phone === "string" ? pp.phone : String(p);
    }));
  }
  return out.filter(Boolean);
}
