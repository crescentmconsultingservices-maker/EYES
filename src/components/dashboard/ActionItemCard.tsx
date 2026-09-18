'use client';

import React, { useState } from 'react';
import styles from './ActionQueue.module.css';
import type { ActionItem } from '@/types/dashboard';

interface ActionItemCardProps {
  action: ActionItem;
  onExecuted?: (id: string) => void;
  onDismissed?: (id: string) => void;
  defaultExpanded?: boolean;
  compact?: boolean;
}

const PLATFORM_ICONS: Record<string, string> = {
  gmail: '📧',
  'google-calendar': '📅',
  github: '🐙',
  linear: '🔷',
  trello: '📋',
  slack: '💬',
  notion: '📄',
  discord: '🎮',
};

export function getConversationalSummary(action: ActionItem) {
  const platformName = action.platform.toLowerCase() === 'gmail' ? 'an email' : `a ${action.platform} message`;
  let sender = 'Someone';

  const match = action.description?.match(/^([a-zA-Z0-9\s\-_]+)\s+asked:/i);
  if (match) {
    sender = match[1];
  } else if (action.description?.includes('asked:')) {
    sender = action.description.split('asked:')[0].trim();
  } else {
    const firstWord = action.title.split(' ')[0] || '';
    const actionVerbs = [
      'review', 'send', 'create', 'reply', 'submit', 'schedule', 'update',
      'approve', 'dismiss', 'check', 'verify', 'vote', 'invite', 'trade', 'resolve', 'attend'
    ];
    if (firstWord && !actionVerbs.includes(firstWord.toLowerCase())) {
      sender = firstWord;
    } else {
      sender = 'Someone';
    }
  }

  let cleanDesc = action.description || '';
  if (cleanDesc.includes('Citations:')) {
    cleanDesc = cleanDesc.split('Citations:')[0].trim();
  }
  cleanDesc = cleanDesc.replace(/^.*asked:\s*/i, '').replace(/^"|"$/g, '').trim();
  if (!cleanDesc) {
    cleanDesc = action.title;
  }

  return { sender, platformName, cleanDesc };
}

export function parseCitations(desc: string): string[] {
  const citations: string[] = [];
  const lines = desc.split('\n');
  let inCitations = false;
  for (const line of lines) {
    if (line.toLowerCase().includes('citations:')) {
      inCitations = true;
      continue;
    }
    if (inCitations && line.trim().startsWith('-')) {
      citations.push(line.trim().slice(1).trim());
    }
  }
  return citations;
}

export function getNativePlatformLink(action: ActionItem): string | null {
  if (action.platform_link) return action.platform_link;

  const platform = action.platform.toLowerCase();
  const sourceId = action.source_id;

  if (platform === 'gmail') {
    if (sourceId) {
      return `https://mail.google.com/mail/u/0/#all/${sourceId}`;
    }
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(action.title)}`;
  }

  if (platform === 'slack') {
    if (sourceId && !sourceId.startsWith('test_')) {
      return `https://slack.com/app_redirect?channel=${sourceId}`;
    }
    return 'https://slack.com';
  }

  if (platform === 'github') {
    if (sourceId) return `https://github.com/${sourceId}`;
    return 'https://github.com';
  }

  if (platform === 'linear') {
    if (sourceId) return `https://linear.app/issue/${sourceId}`;
    return 'https://linear.app';
  }

  return null;
}

export function ActionItemCard({
  action,
  onExecuted,
  onDismissed,
  defaultExpanded = true,
  compact = false,
}: ActionItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(action.title);
  const [editedAction, setEditedAction] = useState(action.suggested_action);
  const [startTime, setStartTime] = useState(action.startTime || '');
  const [endTime, setEndTime] = useState(action.endTime || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExecuted, setIsExecuted] = useState(action.status === 'executed');
  const [isDismissed, setIsDismissed] = useState(action.status === 'dismissed');
  const [refiningTone, setRefiningTone] = useState<string | null>(null);

  if (isDismissed) return null;

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: action.id,
          title: editedTitle,
          suggested_action: editedAction,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setIsExecuted(true);
        setIsEditing(false);
        if (onExecuted) onExecuted(action.id);
      } else {
        const errorMsg = data.executionResult?.details || data.executionResult?.error || data.error || 'Failed to execute action.';
        console.error('[ActionCard] Execute error response:', errorMsg);
      }
    } catch (err) {
      console.error('[ActionCard] Execute error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // AUTO-APPROVE: executes with original (un-edited) content and flags auto_approved=true
  const handleAutoApprove = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: action.id,
          title: action.title,
          suggested_action: action.suggested_action,
          auto_approved: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setIsExecuted(true);
        if (onExecuted) onExecuted(action.id);
      } else {
        const errorMsg = data.executionResult?.details || data.executionResult?.error || data.error || 'Auto-approve failed.';
        console.error('[ActionCard] Auto-approve error:', errorMsg);
      }
    } catch (err) {
      console.error('[ActionCard] Auto-approve network error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/actions/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.id, status: 'dismissed' }),
      });
      if (res.ok) {
        setIsDismissed(true);
        if (onDismissed) onDismissed(action.id);
      }
    } catch (err) {
      console.error('[ActionCard] Dismiss error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyQuickRefine = async (tone: 'shorter' | 'formal' | 'calendar') => {
    setRefiningTone(tone);
    try {
      const res = await fetch('/api/actions/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editedAction || action.suggested_action,
          type: tone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.refined) {
          setEditedAction(data.refined);
        }
      }
    } catch (err) {
      console.error('[ActionCard] Quick refine failed:', err);
    } finally {
      setRefiningTone(null);
    }
  };

  const nativeLink = getNativePlatformLink(action);
  const citations = parseCitations(action.description || '');
  const { sender, platformName, cleanDesc } = getConversationalSummary(action);

  return (
    <div
      className={`${styles.actionCard} ${isExecuted ? styles.executedCard : ''}`}
      style={compact ? { margin: '8px 0', borderRadius: '12px' } : undefined}
    >
      <div className={styles.cardMain} onClick={() => !compact && setIsExpanded(!isExpanded)} style={{ cursor: compact ? 'default' : 'pointer' }}>
        <div className={styles.platformIcon} title={action.platform}>
          {PLATFORM_ICONS[action.platform.toLowerCase()] ?? '⚡'}
        </div>
        <div className={styles.cardContent}>
          <div className={styles.cardHead}>
            {isEditing ? (
              <input
                type="text"
                className={styles.editTitleInput}
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h4 className={styles.actionTitle}>
                {editedTitle}
                {isExecuted && <span style={{ color: 'var(--accent-green)', fontSize: '0.8rem', marginLeft: '6px' }}>✓ EXECUTED</span>}
              </h4>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className={styles.confidence}>
                {Math.round(action.confidence * 100)}% CONFIDENCE
              </span>
              {!compact && (
                <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className={styles.expandedDetails}>
              {/* Conversational Assistant Banner */}
              <div style={{
                background: 'rgba(0, 194, 255, 0.04)',
                border: '1px solid rgba(0, 194, 255, 0.15)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '0.75rem', letterSpacing: '0.05em', color: 'var(--accent-blue, #3b82f6)' }}>EYES ASSISTANT</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.45', fontWeight: '500' }}>
                  Hey! <strong style={{ color: 'var(--text-primary)' }}>{sender}</strong> sent {platformName}: <em style={{ color: 'var(--accent-blue, #2563eb)', fontStyle: 'normal', fontWeight: 'bold' }}>&quot;{cleanDesc}&quot;</em>. What do you want to say?
                </p>
              </div>

              {/* Source Context Citation */}
              <div className={styles.citationBox} style={{ margin: '8px 0 12px', padding: '10px 12px', borderLeft: '3px solid var(--accent-blue, #3b82f6)', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <span className={styles.suggestionLabel} style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--accent-blue, #3b82f6)', marginBottom: '4px', fontWeight: 'bold' }}>
                  🧠 SOURCE CITATION / CONTEXT
                </span>
                <p className={styles.actionDesc} style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {citations.length > 0 ? citations.join(' ──► ') : (action.description || 'No matching history context found.')}
                </p>
              </div>

              {/* Proposed Command / Reply Box */}
              <div className={styles.suggestionBox}>
                <span className={styles.suggestionLabel}>
                  {action.action_type === 'EMAIL_REPLY' || action.action_type === 'SLACK_REPLY' ? 'AI DRAFT REPLY' : 'PROPOSED COMMAND'}
                </span>
                {isEditing ? (
                  <textarea
                    className={styles.editActionTextarea}
                    value={editedAction}
                    onChange={(e) => setEditedAction(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    rows={3}
                  />
                ) : (
                  <p className={styles.suggestionText}>{editedAction}</p>
                )}

                {/* Quick refinement chips */}
                {isEditing && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={Boolean(refiningTone)}
                      onClick={(e) => { e.stopPropagation(); applyQuickRefine('shorter'); }}
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '5px 12px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {refiningTone === 'shorter' ? 'Refining...' : '📝 Make Shorter'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(refiningTone)}
                      onClick={(e) => { e.stopPropagation(); applyQuickRefine('formal'); }}
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '5px 12px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {refiningTone === 'formal' ? 'Refining...' : '👔 More Formal'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(refiningTone)}
                      onClick={(e) => { e.stopPropagation(); applyQuickRefine('calendar'); }}
                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '5px 12px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {refiningTone === 'calendar' ? 'Refining...' : '📅 Add Calendar Link'}
                    </button>
                  </div>
                )}
              </div>

              {/* Start & End Time Controls for CALENDAR and REMINDER */}
              {(action.action_type === 'CALENDAR' || action.action_type === 'REMINDER') && (
                <div className={styles.timeControls} style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>START TIME</label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>END TIME</label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.cardFooter} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={styles.approveBtn}
            onClick={(e) => { e.stopPropagation(); handleApprove(); }}
            disabled={isProcessing || isExecuted}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            {isProcessing ? 'EXECUTING...' : isExecuted ? 'EXECUTED ✓' : isEditing ? 'SAVE & EXECUTE' : 'EXECUTE'}
          </button>

          {!isEditing && !isExecuted && (
            <button
              type="button"
              className={styles.editBtn}
              style={{ color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', padding: '6px 14px', fontSize: '0.8rem' }}
              disabled={isProcessing}
              onClick={(e) => { e.stopPropagation(); handleAutoApprove(); }}
            >
              AUTO-APPROVE
            </button>
          )}

          {!isExecuted && (
            <button
              type="button"
              className={styles.editBtn}
              onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              {isEditing ? 'CANCEL' : 'REFINE'}
            </button>
          )}

          {nativeLink && (
            <a
              href={nativeLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.editBtn}
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--accent-green)',
                borderColor: 'var(--accent-green)',
                padding: '6px 14px',
                fontSize: '0.8rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span>🔗</span>
              <span>OPEN IN {action.platform.toUpperCase()}</span>
            </a>
          )}

          {!isExecuted && (
            <button
              type="button"
              className={styles.dismissBtn}
              style={{ padding: '6px 10px', minWidth: 'auto', fontSize: '0.9rem', marginLeft: 'auto' }}
              title="Dismiss"
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              disabled={isProcessing}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
