import type { Ref, RefCallback } from 'react';

/**
 * Combines several refs (object or callback) into one callback ref. Always returns a cleanup so React 19 runs it
 * instead of calling the ref with null, and the cleanup nulls the originals for us.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    const cleanups: Array<() => void> = [];
    for (const ref of refs) {
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        cleanups.push(typeof cleanup === 'function' ? cleanup : () => { ref(null); });
      } else if (ref) {
        ref.current = node;
        cleanups.push(() => { ref.current = null; });
      }
    }
    return () => { for (const c of cleanups) c(); };
  };
}
