'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ActionQueue.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import { createClient } from '@/utils/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { ActionItemCard } from './ActionItemCard';
import type { ActionItem } from '@/types/dashboard';


interface ActionQueueViewProps {
  onBack: () => void;
}

function useCountdown(lastRunAt: string | null, intervalMs = 30 * 60 * 1000) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!lastRunAt) { setRemaining(''); return; }
    const tick = () => {
      const nextRun = new Date(lastRunAt).getTime() + intervalMs;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setRemaining('any moment'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRunAt, intervalMs]);
  return remaining;
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ActionQueueView({ onBack }: ActionQueueViewProps) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'priority' | 'meetings' | 'communications' | 'tasks' | 'gmail' | 'slack' | 'linear' | 'gcal'>('priority');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  // undoToast: holds the dismissed item so Undo can cancel the pending DB write
  const [undoToast, setUndoToast] = useState<{ action: ActionItem } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useCountdown(lastRunAt);

  // ── Step 1: Load instantly from DB ───────────────────────────────────────────
  const loadFromDB = useCallback(async () => {
    try {
      const res = await fetch('/api/actions/queue', { method: 'GET' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Queue load error: ${res.status}`);
      const data = await res.json();

      const fetchedActions: ActionItem[] = data.actions ?? [];
      setActions(fetchedActions);
      setLastRunAt(data.meta?.lastRunAt ?? new Date().toISOString());

      // Step 2: If stale, trigger background extraction (non-blocking)
      if (data.meta?.isStale) {
        console.log('[ActionQueue] Stale — triggering background extraction...');
        triggerBackgroundExtraction();
      }
    } catch (e) {
      console.error('[ActionQueue] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger extraction in background — UI doesn't wait for this
  const triggerBackgroundExtraction = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/actions/extract', { method: 'POST' });
      // Real-time subscription will push new actions — no need to re-fetch
    } catch (e) {
      console.warn('[ActionQueue] Background extraction failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Manual re-scan button
  const handleRescan = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/actions/extract', { method: 'POST' });
    } catch (e) {
      console.warn('[ActionQueue] Re-scan failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFromDB();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const actionId = params.get('id');
      if (actionId) {
        setExpandedId(actionId);
      }
    }
  }, [loadFromDB]);

  useEffect(() => {
    if (expandedId && actions.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(expandedId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [expandedId, actions]);

  // ── Step 3: Real-time subscription — replaces 30s polling ────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('action_queue_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_queue' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === 'INSERT') {
            const newAction = payload.new as unknown as ActionItem;
            if (newAction.status === 'pending') {
              setActions(prev => {
                if (prev.find(a => a.id === newAction.id)) return prev;
                return [newAction, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as unknown as ActionItem;
            if (updated.status !== 'pending') {
              // Remove from UI if no longer pending
              setActions(prev => prev.filter(a => a.id !== updated.id));
            } else {
              setActions(prev => prev.map(a => a.id === updated.id ? updated : a));
            }
          } else if (payload.eventType === 'DELETE') {
            setActions(prev => prev.filter(a => a.id !== (payload.old as unknown as ActionItem).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────────────

  // Dismiss with 3-second undo window before committing to DB
  const handleDismiss = (action: ActionItem) => {
    // Cancel any previous pending toast first
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      // Commit the previous dismissed item immediately before showing new toast
      if (undoToast) {
        fetch('/api/actions/queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: undoToast.action.id, status: 'dismissed' }),
        }).catch(e => console.warn('[ActionQueue] Dismiss persist failed:', e));
      }
    }

    // Optimistically remove from list
    setActions(prev => prev.filter(a => a.id !== action.id));

    // Schedule DB write after 3 seconds (cancellable via undoTimerRef)
    undoTimerRef.current = setTimeout(() => {
      fetch('/api/actions/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.id, status: 'dismissed' }),
      }).catch(e => console.warn('[ActionQueue] Dismiss persist failed:', e));
      undoTimerRef.current = null;
      setUndoToast(null);
    }, 3000);

    setUndoToast({ action });
  };

  const handleUndoDismiss = () => {
    if (!undoToast) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    // Restore the action to the top of the list
    setActions(prev => [undoToast.action, ...prev]);
    setUndoToast(null);
  };

  // Cleanup: cancel pending undo timer if the component unmounts (Bug #16)
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const filtered = actions.filter(a => {
    const p = a.platform.toLowerCase();
    const confVal = a.confidence <= 1 ? Math.round(a.confidence * 100) : a.confidence;
    if (activeFilter === 'priority') return confVal >= 80;
    if (activeFilter === 'meetings') return a.action_type === 'CALENDAR' || a.action_type === 'REMINDER';
    if (activeFilter === 'communications') return ['gmail', 'slack', 'discord'].includes(p);
    if (activeFilter === 'tasks') return ['github', 'linear', 'trello'].includes(p);
    if (activeFilter === 'gmail') return p === 'gmail';
    if (activeFilter === 'slack') return p === 'slack';
    if (activeFilter === 'linear') return p === 'linear';
    if (activeFilter === 'gcal') return p === 'google-calendar' || p === 'gcal' || a.action_type === 'CALENDAR';
    return true;
  });

  const lastRunDisplay = lastRunAt
    ? `Last scan: ${new Date(lastRunAt).toLocaleTimeString()}`
    : 'Never scanned';

  return (
    <div className={styles.queueRoot}>
      <header className={styles.queueHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.mainTitle}>Action Command Bridge</h1>
          <p className={styles.subtitle}>
            Review and approve actions discovered across your connected sources.
            {' '}<span style={{ opacity: 0.5, fontSize: '0.75rem' }}>{lastRunDisplay}</span>
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={handleRescan}
          disabled={refreshing}
          style={{ alignSelf: 'flex-start' }}
        >
          {refreshing ? 'SCANNING...' : 'RE-SCAN NOW'}
        </button>
      </header>

      <div className={styles.contentGrid}>
        <main className={styles.actionListContainer}>
          <div className={styles.listHeader}>
            <span className={styles.countBadge}>
              {filtered.length} PENDING ACTIONS
              {refreshing && <span style={{ marginLeft: 8, opacity: 0.6 }}>● scanning</span>}
            </span>
            <div className={styles.filterChips} style={{ gap: '6px', flexWrap: 'wrap' }}>
              <button className={activeFilter === 'all' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('all')}>All</button>
              <button className={activeFilter === 'priority' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('priority')}>⚡ Priority</button>
              <button className={activeFilter === 'gmail' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('gmail')}>📧 Gmail</button>
              <button className={activeFilter === 'slack' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('slack')}>💬 Slack</button>
              <button className={activeFilter === 'linear' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('linear')}>🔷 Linear</button>
              <button className={activeFilter === 'gcal' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('gcal')}>📅 Calendar</button>
              <button className={activeFilter === 'communications' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('communications')}>Comms</button>
              <button className={activeFilter === 'tasks' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('tasks')}>Tasks</button>
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingBox}>
              {/* Commented out loading animation:
              <div className={styles.neuralPulseRing}>
                <div className={styles.pulseInner} />
              </div>
              */}
              <span className={styles.loadingTitle}>LOADING ACTION QUEUE...</span>
              <p className={styles.loadingDetail}>Reading your connected sources…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyCard}>
              {/* Commented out scanning ring UI:
              <div className={styles.scanRingWrap}>
                <div className={styles.scanRing}>
                  <div className={styles.scanRingInner} />
                  <div className={styles.scanRingPulse} />
                </div>
                <span className={styles.scanRingIcon}>⚡</span>
              </div>
              */}
              <h3 className={styles.emptyTitle}>System Active — Queue Clear</h3>

              {/* Countdown */}
              {countdown && (
                <p className={styles.countdownText}>
                  Next scan in <strong>{countdown}</strong>
                </p>
              )}



              {/* Recently handled section removed as requested */}
            </div>
          ) : (
            <div className={`${styles.cardList} stagger-1`}>
              {filtered.map(action => (
                <ActionItemCard
                  key={action.id}
                  action={action}
                  onExecuted={(id) => {
                    setActions(prev => prev.filter(a => a.id !== id));
                  }}
                  onDismissed={() => {
                    handleDismiss(action);
                  }}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Undo-dismiss toast */}
      {undoToast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card, var(--bg-primary))',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px', padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, animation: 'fadeInUp 0.25s ease-out',
          fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
        }}>
          <span>Action dismissed</span>
          <button
            onClick={handleUndoDismiss}
            style={{
              background: 'var(--text-primary)', color: 'var(--bg-primary)',
              border: 'none', borderRadius: '8px', padding: '6px 14px',
              fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer',
              letterSpacing: '0.5px', textTransform: 'uppercase',
            }}
          >
            UNDO
          </button>
        </div>
      )}
    </div>
  );
}
