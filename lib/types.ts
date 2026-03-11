export type SterilizationType = 'dry_heat' | 'autoclave';
export type CycleStatus = 'running' | 'completed' | 'cancelled';
export type IndicatorResult = 'passed' | 'failed';

export interface Sterilizer {
  id: string;
  name: string;
  type: SterilizationType;
  serialNumber?: string;
  photoUri?: string;
  maintenanceDate?: string;
  createdAt: string;
}

export interface Cycle {
  id: string;
  sterilizerId: string;
  sterilizerName?: string;
  sterilizationType: SterilizationType;
  temperature: number;
  durationMinutes: number;
  instruments?: string;
  note?: string;
  indicatorPhotoUri?: string;
  indicatorResult?: IndicatorResult;
  startedAt: string;
  completedAt?: string;
  status: CycleStatus;
  createdAt: string;
}

export interface UserProfile {
  name: string;
  salonName?: string;
  salonAddress?: string;
  salonLogoUri?: string;
  phone?: string;
  email?: string;
  language: 'uk' | 'ru';
  reminderEnabled: boolean;
  reminderIntervalHours: number;
}

export interface CatalogProduct {
  id: string;
  category: string;
  title: string;
  description: string;
  priceRange: string;
  imageUri?: string;
  buyUrl: string;
  icon: string;
}
