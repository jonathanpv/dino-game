const createStoreImpl = (createState) => {
  let state;
  const listeners = new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object") ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const destroy = () => listeners.clear();
  const api = { setState, getState, subscribe, destroy };
  state = createState(setState, getState, api);
  return api;
};

const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// Create the store with initial state
const store = createStore((set, get) => ({
  character: 'vita',
  health: 100,
  position: { x: 0, y: 0 },
  isKicking: false,
  isHurt: false,
  setCharacter: (character) => set({ character }),
  setHealth: (health) => set({ health }),
  setPosition: (position) => set({ position }),
  setKicking: (isKicking) => set({ isKicking }),
  setHurt: (isHurt) => set({ isHurt }),
  takeDamage: (amount) => {
    const currentHealth = get().health;
    set({ health: Math.max(0, currentHealth - amount) });
  }
}));

// Export the store
window.store = store; 