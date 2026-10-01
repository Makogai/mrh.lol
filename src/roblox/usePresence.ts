import { useCallback, useSyncExternalStore } from 'react';
import { getServerSnapshot, getSnapshot, subscribe, watch } from './presence';

/**
 * `presence` is the shared snapshot (neutral on the server and on the first client render). Attach `watchRef` to an
 * element of the consumer: while that element is on screen, the store keeps the status fresh.
 */
export function usePresence() {
  const presence = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const watchRef = useCallback((el: Element | null) => (el ? watch(el) : undefined), []);
  return { presence, watchRef };
}
