import { create } from 'zustand';

interface CycleState {
  instruments: string[];
  packType: 'Крафт' | 'Прозорий' | 'Білий' | null;
  sterilizer: string | null;
  photoBefore: string | null;
  photoAfter: string | null;
  timerRunning: boolean;
  timerStartedAt: number | null;
  timerSeconds: number;
}

interface AppStore {
  cycle: CycleState;
  setCycleField: <K extends keyof CycleState>(key: K, value: CycleState[K]) => void;
  toggleInstrument: (name: string) => void;
  resetCycle: () => void;
}

const initialCycle: CycleState = {
  instruments: [],
  packType: null,
  sterilizer: null,
  photoBefore: null,
  photoAfter: null,
  timerRunning: false,
  timerStartedAt: null,
  timerSeconds: 0,
};

export const useAppStore = create<AppStore>((set) => ({
  cycle: { ...initialCycle },

  setCycleField: (key, value) =>
    set((state) => ({ cycle: { ...state.cycle, [key]: value } })),

  toggleInstrument: (name) =>
    set((state) => {
      const has = state.cycle.instruments.includes(name);
      return {
        cycle: {
          ...state.cycle,
          instruments: has
            ? state.cycle.instruments.filter((i) => i !== name)
            : [...state.cycle.instruments, name],
        },
      };
    }),

  resetCycle: () => set({ cycle: { ...initialCycle } }),
}));
