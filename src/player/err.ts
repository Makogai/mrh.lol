import type { PlayerErrorCode } from './index';

export interface PlayerError extends Error { name: 'PlayerError'; code: PlayerErrorCode }

// A plain Error with a tag instead of a subclass: smaller output, and `e.name === 'PlayerError'` is the contract.
export function perr(code: PlayerErrorCode, message: string, cause?: unknown): PlayerError {
  return Object.assign(new Error(code + ': ' + message, { cause }), { name: 'PlayerError' as const, code });
}
