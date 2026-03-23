export type UserRole = 'owner' | 'staff';

export interface Profile {
  id: string;
  name: string | null;
  last_name: string | null;
  salon_name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  role: UserRole;
  expo_push_token: string | null;
  notification_cycle_done: boolean;
  notification_cycle_idle: boolean;
  notification_order_status: boolean;
  created_at: string;
  updated_at: string;
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
}

export interface Employee {
  id: string;
  user_id: string;
  name: string;
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

export interface CatalogProduct {
  id: string;
  category: string;
  name: string;
  description: string;
  volume?: string;
  price?: number;
  image?: string;
  url: string;
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

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface NPCity {
  ref: string;
  name: string;
  region: string;
}

export interface NPWarehouse {
  ref: string;
  description: string;
  number: string;
}

export interface Order {
  id: string;
  user_id: string;
  status: 'pending' | 'confirmed' | 'canceled';
  total_amount: number;
  delivery_address: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  city_ref: string | null;
  city_name: string | null;
  warehouse_ref: string | null;
  warehouse_name: string | null;
  np_ttn: string | null;
  np_delivery_cost: number | null;
  notes: string | null;
  keycrm_order_id: number | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_at_order: number;
  created_at: string;
}
