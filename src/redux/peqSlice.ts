import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settings } from '../components/shared/setDefaultSettings';

const parsedSettings: any = process.env.NODE_ENV === 'test' ? {} : settings.store;

export interface PeqBand {
  enabled: boolean;
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch';
  freq: number;
  gain: number;
  q: number;
}

export interface PeqState {
  enabled: boolean;
  bands: PeqBand[];
}

export const DEFAULT_PEQ_BANDS: PeqBand[] = [
  { enabled: true, type: 'peaking', freq: 80, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 250, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 1000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 4000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 8000, gain: 0, q: 1.0 },
  { enabled: true, type: 'peaking', freq: 16000, gain: 0, q: 1.0 },
];

const initialState: PeqState = {
  enabled: Boolean(parsedSettings.peqEnabled ?? false),
  bands: (parsedSettings.peqBands as PeqBand[]) ?? DEFAULT_PEQ_BANDS,
};

const peqSlice = createSlice({
  name: 'peq',
  initialState,
  reducers: {
    setPeqEnabled: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
    setPeqBand: (state, action: PayloadAction<{ index: number; band: PeqBand }>) => {
      state.bands[action.payload.index] = action.payload.band;
    },
    setPeqBandField: (
      state,
      action: PayloadAction<{ index: number; field: keyof PeqBand; value: any }>
    ) => {
      (state.bands[action.payload.index] as any)[action.payload.field] = action.payload.value;
    },
    resetPeqBands: (state) => {
      // Deep copy — assigning DEFAULT_PEQ_BANDS directly would share the frozen reference
      // and the next setPeqBandField dispatch would throw when Immer tries to mutate it
      state.bands = DEFAULT_PEQ_BANDS.map((b) => ({ ...b }));
    },
  },
});

export const { setPeqEnabled, setPeqBand, setPeqBandField, resetPeqBands } = peqSlice.actions;
export default peqSlice.reducer;
