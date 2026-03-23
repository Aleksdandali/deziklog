import { supabase } from './supabase';
import type {
  Profile,
  Instrument,
  Sterilizer,
  Employee,
  Solution,
  NPCity,
  NPWarehouse,
} from './types';

// ── Auth ──────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (session: any) => void) {
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
  updates: Partial<Pick<SterilizationSession, 'status' | 'started_at' | 'ended_at' | 'photo_before_path' | 'photo_after_path' | 'result'>>,
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

  const { error: uploadError } = await supabase.storage
    .from('cycle-photos')
    .upload(fileName, arrayBuffer, {
      contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;
  return fileName;
}

export async function getPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('cycle-photos').createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    // Fallback to public URL if signed URL fails
    const { data: pub } = supabase.storage.from('cycle-photos').getPublicUrl(storagePath);
    return pub.publicUrl;
  }
  return data.signedUrl;
}

export async function getSessionById(sessionId: string, userId: string): Promise<SterilizationSession | null> {
  const { data, error } = await supabase
    .from('sterilization_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();
  if (error) return null;
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

// ── Orders ────────────────────────────────────────────────

export async function createOrder(userId: string, order: {
  total_amount: number;
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
}, items: { product_id: string; product_name: string; quantity: number; price_at_order: number }[]) {
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending',
      total_amount: order.total_amount,
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
  if (itemsError) throw itemsError;

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
