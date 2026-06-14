import { useState, useEffect } from 'react';

type StateListener = () => void;

/**
 * A lightweight custom implementation of Zustand's create function.
 * Enables reactive state management across React components offline.
 */
export function createStore<T>(
  initializer: (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T
  ) => T
) {
  let state: T;
  const listeners = new Set<StateListener>();

  const set = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const nextState = typeof partial === 'function' ? (partial as Function)(state) : partial;
    if (nextState !== state) {
      state = Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener());
    }
  };

  const get = () => state;

  state = initializer(set, get);

  const useStore = <U = T>(selector: (state: T) => U = (s) => s as any): U => {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
      const listener = () => forceUpdate((c) => c + 1);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);

    return selector(state);
  };

  // Expose store actions for usage outside React components
  Object.assign(useStore, {
    getState: get,
    setState: set,
    subscribe: (listener: StateListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });

  return useStore as typeof useStore & {
    getState: typeof get;
    setState: typeof set;
    subscribe: (listener: StateListener) => () => void;
  };
}
