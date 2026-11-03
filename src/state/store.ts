import { useSyncExternalStore } from 'react';

/** 最小的可訂閱狀態：set 之後通知所有訂閱者 */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private state: T) {}

  get = (): T => this.state;

  set(next: T | ((current: T) => T)): void {
    this.state = typeof next === 'function' ? (next as (current: T) => T)(this.state) : next;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
