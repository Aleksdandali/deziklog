export interface Profile {
  id: string;
  name: string | null;
  salon_name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  volume: string | null;
  image_path: string | null;
  in_stock: boolean;
  shelf_life_days: number | null;
  sort_order: number;
  created_at: string;
  category?: ProductCategory;
}

export interface Instrument {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Sterilizer {
  id: string;
  user_id: string;
  name: string;
  type: string | null;
  brand: string | null;
  created_at: string;
}

export interface SterilizationCycle {
  id: string;
  user_id: string;
  instrument_id: string | null;
  sterilizer_id: string | null;
  instrument_name: string;
  sterilizer_name: string;
  packet_type: string;
  temperature: number | null;
  duration_minutes: number | null;
  started_at: string;
  result: string | null;
  notes: string | null;
  created_at: string;
  photos?: CyclePhoto[];
}

export interface CyclePhoto {
  id: string;
  cycle_id: string;
  type: 'before' | 'after';
  storage_path: string;
  created_at: string;
}

export interface Solution {
  id: string;
  user_id: string;
  product_id: string | null;
  name: string;
  opened_at: string;
  expires_at: string;
  status: string | null;
  created_at: string;
}
