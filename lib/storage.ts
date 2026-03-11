import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  SterilizationCycle,
  SolutionRecord,
  UserProfile,
} from './types';

const KEYS = {
  CYCLES: '@dezik_cycles',
  SOLUTIONS: '@dezik_solutions',
  PROFILE: '@dezik_profile',
} as const;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  role: 'Майстер манікюру',
  sterilizers: [],
  instruments: [],
  packs: [],
  preparations: [],
};

// ── Cycles ────────────────────────────────────────────────

export async function getCycles(): Promise<SterilizationCycle[]> {
  const raw = await AsyncStorage.getItem(KEYS.CYCLES);
  return raw ? JSON.parse(raw) : [];
}

export async function addCycle(cycle: Omit<SterilizationCycle, 'id'>): Promise<SterilizationCycle> {
  const cycles = await getCycles();
  const newCycle: SterilizationCycle = { ...cycle, id: generateId() };
  cycles.unshift(newCycle);
  await AsyncStorage.setItem(KEYS.CYCLES, JSON.stringify(cycles));
  return newCycle;
}

// ── Solutions ─────────────────────────────────────────────

export async function getSolutions(): Promise<SolutionRecord[]> {
  const raw = await AsyncStorage.getItem(KEYS.SOLUTIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function addSolution(sol: Omit<SolutionRecord, 'id'>): Promise<SolutionRecord> {
  const solutions = await getSolutions();
  const newSol: SolutionRecord = { ...sol, id: generateId() };
  solutions.unshift(newSol);
  await AsyncStorage.setItem(KEYS.SOLUTIONS, JSON.stringify(solutions));
  return newSol;
}

export async function deleteSolution(id: string): Promise<void> {
  const solutions = await getSolutions();
  await AsyncStorage.setItem(KEYS.SOLUTIONS, JSON.stringify(solutions.filter((s) => s.id !== id)));
}

// ── Profile ───────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  const raw = await AsyncStorage.getItem(KEYS.PROFILE);
  return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
}

// ── Clear all ─────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.CYCLES, KEYS.SOLUTIONS, KEYS.PROFILE]);
}
