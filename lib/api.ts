import { supabase } from './supabase';
import type {
  Profile,
  Product,
  ProductCategory,
  Instrument,
  Sterilizer,
  SterilizationCycle,
  CyclePhoto,
  Solution,
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

// ── Products (public, read-only) ─────────────────────────

export async function getCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function getProducts(categoryId?: string): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*, category:product_categories(*)')
    .order('sort_order');
  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Instruments ───────────────────────────────────────────

export async function getInstruments(): Promise<Instrument[]> {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
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

export async function deleteInstrument(id: string) {
  const { error } = await supabase.from('instruments').delete().eq('id', id);
  if (error) throw error;
}

// ── Sterilizers ───────────────────────────────────────────

export async function getSterilizers(): Promise<Sterilizer[]> {
  const { data, error } = await supabase
    .from('sterilizers')
    .select('*')
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

export async function deleteSterilizer(id: string) {
  const { error } = await supabase.from('sterilizers').delete().eq('id', id);
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
  created_at: string;
}

export async function getSessions(status?: string): Promise<SterilizationSession[]> {
  let query = supabase
    .from('sterilization_sessions')
    .select('*')
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
  temperature: number;
  duration_minutes: number;
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
  updates: Partial<Pick<SterilizationSession, 'status' | 'started_at' | 'ended_at' | 'photo_before_path' | 'photo_after_path' | 'result'>>,
): Promise<SterilizationSession> {
  const { data, error } = await supabase
    .from('sterilization_sessions')
    .update(updates)
    .eq('id', sessionId)
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
  const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
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

export function getPhotoUrl(storagePath: string): string {
  const { data } = supabase.storage.from('cycle-photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ── Solutions ─────────────────────────────────────────────

export async function getSolutions(): Promise<Solution[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select('*')
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

export async function deleteSolution(id: string) {
  const { error } = await supabase.from('solutions').delete().eq('id', id);
  if (error) throw error;
}
