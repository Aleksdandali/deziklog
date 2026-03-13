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

// ── Sterilization Cycles ──────────────────────────────────

export async function getCycles(): Promise<SterilizationCycle[]> {
  const { data, error } = await supabase
    .from('sterilization_cycles')
    .select('*, photos:cycle_photos(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addCycle(userId: string, cycle: {
  instrument_name: string;
  sterilizer_name: string;
  packet_type: string;
  temperature?: number;
  duration_minutes?: number;
  started_at: string;
  result?: string;
  notes?: string;
  instrument_id?: string;
  sterilizer_id?: string;
}): Promise<SterilizationCycle> {
  const { data, error } = await supabase
    .from('sterilization_cycles')
    .insert({ user_id: userId, ...cycle })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Cycle Photos ──────────────────────────────────────────

export async function uploadCyclePhoto(
  userId: string,
  cycleId: string,
  type: 'before' | 'after',
  uri: string,
): Promise<CyclePhoto> {
  const ext = uri.split('.').pop() || 'jpg';
  const fileName = `${userId}/${cycleId}/${type}_${Date.now()}.${ext}`;

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

  const { data: photoRow, error: insertError } = await supabase
    .from('cycle_photos')
    .insert({ cycle_id: cycleId, type, storage_path: fileName })
    .select()
    .single();
  if (insertError) throw insertError;
  return photoRow;
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
