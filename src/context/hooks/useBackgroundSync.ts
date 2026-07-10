import { useEffect } from 'react';
import type { User } from '../AuthContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTO_BACKGROUND_SYNC_ENABLED = process.env.NEXT_PUBLIC_AUTO_BACKGROUND_SYNC === 'true';

export function useBackgroundSync(
  supabase: SupabaseClient,
  user: User | null,
  isLoading: boolean,
  pathname: string
) {
  useEffect(() => {
    if (!AUTO_BACKGROUND_SYNC_ENABLED) return;
    if (isLoading || !user) return;

    const isPublicRoute = ['/login', '/signup'].includes(pathname);
    if (isPublicRoute) return;
    if (pathname.startsWith('/connect')) return;
    if (!user.onboardingCompleted) return; // Prevent 401s in terminal before onboarding is done

    let cancelled = false;
    let syncInFlight = false;

    const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    const runBackgroundSync = async () => {
      if (cancelled || syncInFlight) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      // Smart Timer: Check if ANY tab has synced in the last 5 minutes
      if (typeof window !== 'undefined') {
        const lastSyncStr = window.localStorage.getItem('last_eyes_sync');
        if (lastSyncStr) {
          const lastSync = parseInt(lastSyncStr, 10);
          if (Date.now() - lastSync < SYNC_INTERVAL_MS) {
            return; // Too soon, let the other tab handle it
          }
        }
        // Claim the lock
        window.localStorage.setItem('last_eyes_sync', Date.now().toString());
      }

      syncInFlight = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        // Background sync is now handled exclusively via cron/Vercel Scheduler
        // No client-side fan-out required.
      } catch (error) {
        console.warn('[Auth] Background sync fan-out failed:', error);
      } finally {
        syncInFlight = false;
        // Note: no manual pulse here — the Supabase realtime subscription on
        // sync_status will fire queueRefresh() automatically when rows change.
      }
    };

    const initialDelay = setTimeout(() => {
      void runBackgroundSync();
    }, 2500);

    const interval = setInterval(() => {
      void runBackgroundSync();
    }, SYNC_INTERVAL_MS);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (debounceTimer) clearTimeout(debounceTimer);
        // 5-second debounce to prevent spamming when rapidly switching tabs
        debounceTimer = setTimeout(() => {
          void runBackgroundSync();
        }, 5000);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [isLoading, pathname, supabase, user]);
}
