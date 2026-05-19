import { supabase } from './supabase';
import type {
  Profile,
  Instrument,
  Sterilizer,
  Employee,
  Solution,
  NPCity,
  NPWarehouse,
  KeyCRMHistoryOrder,
} from './types';

// ── Auth ──────────────────────────────────────────────────

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: unknown) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

// ── Profile ───────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function upsertProfile(userId: string, profile: Partial<Profile>) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profile, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

// ── Instruments ───────────────────────────────────────────

export async function getInstruments(userId: string): Promise<Instrument[]> {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addInstrument(userId: string, name: string): Promise<Instrument> {
  const { data, error } = await supabase
    .from('instruments')
    .insert({ user_id: userId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInstrument(id: string, userId: string) {
  const { error } = await supabase
    .from('instruments')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Employees ────────────────────────────────────────────

export async function getEmployees(userId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addEmployee(userId: string, name: string): Promise<Employee> {
  const { data, error } = await supabase
    .from('employees')
    .insert({ user_id: userId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmployee(id: string, userId: string) {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Sterilizers ───────────────────────────────────────────

export async function getSterilizers(userId: string): Promise<Sterilizer[]> {
  const { data, error } = await supabase
    .from('sterilizers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addSterilizer(userId: string, name: string, type?: string, brand?: string): Promise<Sterilizer> {
  const { data, error } = await supabase
    .from('sterilizers')
    .insert({ user_id: userId, name, type: type ?? null, brand: brand ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSterilizer(id: string, userId: string) {
  const { error } = await supabase
    .from('sterilizers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Sterilization Sessions ────────────────────────────────

export interface SterilizationSession {
  id: string;
  user_id: string;
  salon_name: string | null;
  sterilizer_id: string | null;
  sterilizer_name: string;
  instrument_names: string;
  packet_type: string;
  temperature: number | null;
  duration_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  photo_before_path: string | null;
  photo_after_path: string | null;
  result: 'success' | 'fail' | null;
  status: 'draft' | 'in_progress' | 'completed' | 'failed' | 'canceled';
  pouch_size: string | null;
  employee_id: string | null;
  employee_name: string | null;
  created_at: string;
}

export async function getSessions(userId: string, status?: string): Promise<SterilizationSession[]> {
  let query = supabase
    .from('sterilization_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createSession(userId: string, session: {
  salon_name?: string;
  sterilizer_id?: string;
  sterilizer_name: string;
  instrument_names: string;
  packet_type: string;
  pouch_size?: string;
  temperature: number;
  duration_minutes: number;
  employee_id?: string;
  employee_name?: string;
}): Promise<SterilizationSession> {
  const { data, error } = await supabase
    .from('sterilization_sessions')
    .insert({ user_id: userId, status: 'draft', ...session })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSession(
  sessionId: string,
  userId: string,
  updates: Partial<Pick<SterilizationSession,
    'status' | 'started_at' | 'ended_at'
    | 'photo_before_path' | 'photo_after_path'
    | 'result'>>,
): Promise<SterilizationSession> {
  const { data, error } = await supabase
    .from('sterilization_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadSessionPhoto(
  userId: string,
  sessionId: string,
  type: 'before' | 'after',
  uri: string,
): Promise<string> {
  const rawExt = (uri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpg';
  const fileName = `${userId}/${sessionId}/${type}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();
  const contentType = `image/${ext === 'png' ? 'png' : 'jpeg'}`;

  // Retry up to 3 times on transient network errors (network blip, 5xx).
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: uploadError } = await supabase.storage
      .from('cycle-photos')
      .upload(fileName, arrayBuffer, { contentType, upsert: true });
    if (!uploadError) return fileName;
    lastError = uploadError;
    const msg = (uploadError as { message?: string })?.message ?? '';
    const isTransient = /network|fetch|timeout|temporarily|5\d\d/i.test(msg);
    if (!isTransient) throw uploadError;
    // Exponential backoff: 400ms, 1200ms
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * (attempt + 1)));
  }
  throw lastError;
}

/**
 * Upload a photo of a sterilizer (taken in-app or picked from gallery) to the
 * shared cycle-photos bucket. Returns the storage path to persist on the row.
 */
export async function uploadSterilizerPhoto(
  userId: string,
  sterilizerId: string,
  uri: string,
): Promise<string> {
  const rawExt = (uri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpg';
  const fileName = `${userId}/sterilizer/${sterilizerId}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();
  const contentType = `image/${ext === 'png' ? 'png' : 'jpeg'}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: uploadError } = await supabase.storage
      .from('cycle-photos')
      .upload(fileName, arrayBuffer, { contentType, upsert: true });
    if (!uploadError) return fileName;
    lastError = uploadError;
    const msg = (uploadError as { message?: string })?.message ?? '';
    const isTransient = /network|fetch|timeout|temporarily|5\d\d/i.test(msg);
    if (!isTransient) throw uploadError;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * (attempt + 1)));
  }
  throw lastError;
}

// Cycle-photos bucket is private (see 20260528_cycle_photos_private.sql);
// only signed URLs work. Returns null on failure — callers already render
// nothing when the URL is missing, which is the right UX for a transient
// network error too. The old getPublicUrl fallback was removed because it
// would have started silently 400-ing once the bucket flipped private,
// hiding the real error.
export async function getPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('cycle-photos')
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    if (__DEV__) console.warn('[getPhotoUrl] signed URL failed:', error?.message ?? 'no data');
    return null;
  }
  return data.signedUrl;
}

export async function getSessionById(sessionId: string, userId: string): Promise<SterilizationSession | null> {
  // .maybeSingle() returns null when row is missing, throws on real DB/network errors.
  // Callers can distinguish "not found" (null) from "couldn't reach DB" (throw).
  const { data, error } = await supabase
    .from('sterilization_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Solutions ─────────────────────────────────────────────

export async function getSolutions(userId: string): Promise<Solution[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addSolution(userId: string, sol: {
  name: string;
  opened_at: string;
  expires_at: string;
  product_id?: string;
  status?: string;
}): Promise<Solution> {
  const { data, error } = await supabase
    .from('solutions')
    .insert({ user_id: userId, ...sol })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSolution(id: string, userId: string) {
  const { error } = await supabase
    .from('solutions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// ── Nova Poshta ──────────────────────────────────────────

export async function searchNPCities(query: string): Promise<NPCity[]> {
  const { data, error } = await supabase.functions.invoke('nova-poshta-proxy', {
    body: { action: 'searchCities', query },
  });
  if (error) throw error;
  return data?.cities ?? [];
}

export async function getNPWarehouses(cityRef: string): Promise<NPWarehouse[]> {
  const { data, error } = await supabase.functions.invoke('nova-poshta-proxy', {
    body: { action: 'getWarehouses', cityRef },
  });
  if (error) throw error;
  return data?.warehouses ?? [];
}

/**
 * Best-effort resolve a city name (e.g. legacy profile rows missing city_ref)
 * to a full NPCity via search. Picks the exact case-insensitive name match,
 * else falls back to the first result. Returns null on no match or any error.
 */
export async function resolveNPCityByName(name: string): Promise<NPCity | null> {
  try {
    const results = await searchNPCities(name);
    if (results.length === 0) return null;
    const lower = name.toLowerCase();
    return results.find((c) => c.name.toLowerCase() === lower) ?? results[0];
  } catch {
    return null;
  }
}

// ── Orders ────────────────────────────────────────────────

/**
 * Check current stock state for the given product IDs.
 * Returns one row per product that still exists in the catalog.
 * Missing IDs (product deleted) are NOT in the result — caller must compare
 * against the input list to detect them.
 *
 * Mirrors the BEFORE INSERT trigger `enforce_order_item_price` so we can
 * surface "out of stock" / "discontinued" to the user in their language
 * before hitting the DB.
 */
export async function getProductsStockStatus(
  ids: string[],
): Promise<Array<{ id: string; name: string; in_stock: boolean }>> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, name, in_stock')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string; in_stock: boolean }>;
}

// `total_amount`, `price_at_order` and `product_name` are intentionally NOT
// accepted from the caller: the `enforce_order_item_price` BEFORE trigger
// overwrites price_at_order + product_name from products on every line item,
// and `recompute_order_total` AFTER trigger derives total_amount from those
// items. Letting clients supply these values would invite confusion (the
// DB always wins) and hides a price-manipulation vector that the audit
// already closed at the DB layer (REVOKE UPDATE on orders.total_amount).
export async function createOrder(userId: string, order: {
  delivery_address: string;
  delivery_type?: string;
  phone: string;
  first_name?: string;
  last_name?: string;
  recipient_first_name?: string;
  recipient_last_name?: string;
  recipient_phone?: string;
  city_ref?: string;
  city_name?: string;
  warehouse_ref?: string;
  warehouse_name?: string;
  address_street?: string;
  address_building?: string;
  address_apartment?: string;
  notes?: string;
}, items: { product_id: string; quantity: number }[]) {
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending',
      delivery_address: order.delivery_address,
      delivery_type: order.delivery_type ?? 'warehouse',
      phone: order.phone,
      first_name: order.first_name ?? null,
      last_name: order.last_name ?? null,
      recipient_first_name: order.recipient_first_name ?? order.first_name ?? null,
      recipient_last_name: order.recipient_last_name ?? order.last_name ?? null,
      recipient_phone: order.recipient_phone ?? order.phone ?? null,
      city_ref: order.city_ref ?? null,
      city_name: order.city_name ?? null,
      warehouse_ref: order.warehouse_ref ?? null,
      warehouse_name: order.warehouse_name ?? null,
      address_street: order.address_street ?? null,
      address_building: order.address_building ?? null,
      address_apartment: order.address_apartment ?? null,
      notes: order.notes ?? null,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const orderItems = items.map((item) => ({
    order_id: orderData.id,
    ...item,
  }));
  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);
  if (itemsError) {
    // Compensating delete to avoid orphan order with no items / wrong total.
    // Best-effort; if it fails we still throw the original error.
    try {
      await supabase
        .from('orders')
        .delete()
        .eq('id', orderData.id)
        .eq('user_id', userId);
    } catch {}
    throw itemsError;
  }

  // Sync to KeyCRM (fire-and-forget, don't block checkout)
  syncOrderToKeyCRM(orderData.id).catch((err) =>
    console.warn('[KeyCRM] sync failed:', err.message),
  );

  return orderData;
}

async function syncOrderToKeyCRM(orderId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data, error } = await supabase.functions.invoke('sync-order-to-keycrm', {
    body: { order_id: orderId },
  });
  if (error) throw error;
  return data;
}

// Live-view of legacy KeyCRM orders (placed before the user installed the app).
// Returns [] on any failure — this list is supplemental, never blocking.
export async function getKeyCRMHistory(): Promise<KeyCRMHistoryOrder[]> {
  const { data, error } = await supabase.functions.invoke('get-keycrm-history', {});
  if (error) {
    console.warn('[KeyCRM history] fetch failed:', error.message);
    return [];
  }
  return (data?.orders as KeyCRMHistoryOrder[]) ?? [];
}

export async function getOrders(userId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getOrderById(orderId: string, userId: string) {
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();
  if (error) return null;

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');

  return { order, items: items ?? [] };
}
