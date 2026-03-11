export interface SterilizationCycle {
  id: string;
  date: string;
  instruments: string[];
  packType: 'Крафт' | 'Прозорий' | 'Білий';
  sterilizer: string;
  photoBefore: string;
  photoAfter: string;
  timerSeconds: number;
  status: 'passed' | 'failed';
}

export interface SolutionRecord {
  id: string;
  date: string;
  preparation: string;
  expiryDate: string;
  concentration: number;
  exposureMinutes: number;
}

export interface SterilizerItem {
  id: string;
  name: string;
  model: string;
}

export interface InstrumentItem {
  id: string;
  name: string;
}

export interface PackItem {
  id: string;
  type: string;
  size: string;
}

export interface PreparationItem {
  id: string;
  name: string;
  defaultConcentration: number;
  defaultExposure: number;
}

export interface UserProfile {
  name: string;
  role: string;
  sterilizers: SterilizerItem[];
  instruments: InstrumentItem[];
  packs: PackItem[];
  preparations: PreparationItem[];
}

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  imageUrl: string;
  siteUrl: string;
}
