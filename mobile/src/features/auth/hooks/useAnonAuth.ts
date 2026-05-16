import { useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/features/auth/stores';

/**
 * Bootstraps a persistent anonymous Supabase session.
 *
 * On first launch: signs in anonymously, session is persisted via
 * expo-secure-store (configured in lib/supabase). Subsequent launches
 * restore the same auth.uid(), so meetings + storage stay tied to the device.
 *
 * Mount once at the root layout.
 */
export function useAnonAuth() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      let userId = data.session?.user.id ?? null;
      console.log('[useAnonAuth] getSession uid:', userId);

      if (!userId) {
        const { data: signIn, error } = await supabase.auth.signInAnonymously();
        console.log('[useAnonAuth] signInAnonymously uid:', signIn?.user?.id);
        if (error) {
          console.error('[useAnonAuth] signInAnonymously failed:', error);
          if (!cancelled) setSession(null);
          return;
        }
        userId = signIn.user?.id ?? null;
      }

      if (!cancelled) setSession(userId);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setSession]);
}
