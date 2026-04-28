/**
 * IMBY - Pub/Sub State Management
 * Lightweight store with subscription support
 */

const createStore = (initialState) => {
  let state = { ...initialState };
  const listeners = new Map();

  return {
    getState: () => ({ ...state }),

    setState: (updates) => {
      const prevState = state;
      state = { ...state, ...updates };

      Object.keys(updates).forEach(key => {
        if (prevState[key] !== state[key] && listeners.has(key)) {
          listeners.get(key).forEach(fn => fn(state[key], prevState[key]));
        }
      });

      if (listeners.has('*')) {
        listeners.get('*').forEach(fn => fn(state, prevState));
      }
    },

    subscribe: (key, callback) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(callback);
      return () => listeners.get(key).delete(callback);
    },

    subscribeAll: (callback) => {
      if (!listeners.has('*')) listeners.set('*', new Set());
      listeners.get('*').add(callback);
      return () => listeners.get('*').delete(callback);
    }
  };
};

export const store = createStore({
  center: [34.0522, -118.2437],
  zoom: 10,
  selectedParcel: null,
  selectedZipcode: null,
  year: 2026,
  isPlaying: false,

  reforms: {
    removeR1: false,
    noHeightLimits: false,
    noFARLimits: false,
    noParkingMinimums: false,
    noSetbacks: false,
    noHillsideOrdinance: false,
    noCEQA: false
  },

  sidePanelExpanded: false,
  activeTab: 'overview',
  loadedZipcodes: [],
  isLoading: false,

  unitsLost: null,
  gdpImpact: null
});
