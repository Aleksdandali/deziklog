import { create } from 'zustand';

export interface ActiveTimer {
  cycleId: string;
  sterilizerId: string;
  sterilizerName: string;
  temperature: number;
  durationMinutes: number;
  startedAt: string;
  instruments?: string;
  notificationId?: string;
}

interface AppStore {
  activeTimer: ActiveTimer | null;
  setActiveTimer: (timer: ActiveTimer | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTimer: null,
  setActiveTimer: (timer) => set({ activeTimer: timer }),
}));
