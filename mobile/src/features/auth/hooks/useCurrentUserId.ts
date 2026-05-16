import { useAuthStore } from '@/src/features/auth/stores';

/**
 * Returns the current anonymous user's id, or `null` until the session boots.
 *
 * Callers that need to block UI until auth is ready can also read
 * `useAuthStore(s => s.ready)`.
 */
export function useCurrentUserId(): string | null {
  return useAuthStore((s) => s.userId);
}
