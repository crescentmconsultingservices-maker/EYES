'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  type: 'bug' | 'feature' | 'feedback';
  area: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  system_context?: Record<string, unknown> | null;
  admin_response?: string | null;
  responded_at?: string | null;
  created_at: string;
}

export default function AdminFeedbackPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'closed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'open' | 'resolved' | 'closed'>('resolved');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/admin/feedback?status=${filter}`);
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (Array.isArray(data.tickets)) {
        setTickets(data.tickets);
        if (selectedTicket) {
          const updated = data.tickets.find((t: Ticket) => t.id === selectedTicket.id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
      setFetchError('Network error connecting to feedback API.');
    } finally {
      setLoading(false);
    }
  }, [filter, selectedTicket]);

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim() || submittingReply) return;

    setSubmittingReply(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTicket.id,
          status: replyStatus,
          adminResponse: replyText.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage('Response dispatched to user successfully!');
        setReplyText('');
        fetchTickets();
      } else {
        setActionMessage(data.error || 'Failed to submit response.');
      }
    } catch {
      setActionMessage('Network error sending response.');
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#f4f4f5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Bar */}
      <header style={{ borderBottom: '1px solid #27272a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#121215' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" style={{ color: '#a1a1aa', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>← EYES Home</Link>
          <span style={{ color: '#3f3f46' }}>/</span>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>Developer Feedback & Support Desk</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => fetchTickets()}
            style={{ padding: '6px 14px', borderRadius: '6px', background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
          <Link
            href="/admin/funnel"
            style={{ padding: '6px 14px', borderRadius: '6px', background: 'transparent', color: '#a1a1aa', border: '1px solid #27272a', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
          >
            Funnel Analytics
          </Link>
        </div>
      </header>

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', height: 'calc(100vh - 65px)' }}>
        {/* Left Sidebar: Ticket List */}
        <div style={{ borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', background: '#101014' }}>
          {/* Filters */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #27272a', display: 'flex', gap: '6px' }}>
            {(['all', 'open', 'resolved', 'closed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === s ? '#6366f1' : '#1e1e24',
                  color: filter === s ? '#ffffff' : '#a1a1aa',
                  textTransform: 'capitalize',
                }}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Ticket Scroll List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {fetchError ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: '#f87171', fontSize: '12.5px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                ⚠️ {fetchError === 'Forbidden' ? 'Access Denied: Current user email is not in ADMIN_EMAILS.' : fetchError}
              </div>
            ) : loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>No tickets matching filter.</div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                const statusColor = t.status === 'resolved' ? '#22c55e' : t.status === 'in_progress' ? '#eab308' : '#38bdf8';
                return (
                  <div
                    key={t.id}
                    onClick={() => { setSelectedTicket(t); setReplyText(t.admin_response || ''); }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #6366f1' : '1px solid #27272a',
                      background: isSelected ? 'rgba(99,102,241,0.12)' : '#18181b',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: `${statusColor}22`, color: statusColor }}>
                        {t.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '11px', color: '#71717a' }}>
                        {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.subject}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#a1a1aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.user_email}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Ticket Detail & Reply */}
        <div style={{ overflowY: 'auto', padding: '24px 32px' }}>
          {selectedTicket ? (
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header */}
              <div style={{ borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '3px 8px', borderRadius: '6px' }}>
                    {selectedTicket.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: '#a1a1aa' }}>Area: {selectedTicket.area}</span>
                  <span style={{ fontSize: '12px', color: '#71717a' }}>Ticket #{selectedTicket.id.slice(0, 8)}</span>
                </div>

                <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
                  {selectedTicket.subject}
                </h2>

                <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
                  From: <strong>{selectedTicket.user_name || 'User'}</strong> (&lt;{selectedTicket.user_email}&gt;) · {new Date(selectedTicket.created_at).toLocaleString()}
                </div>
              </div>

              {/* Message Body */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                  Reported Issue / Details:
                </label>
                <div style={{ padding: '16px', borderRadius: '8px', background: '#18181b', border: '1px solid #27272a', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#f4f4f5' }}>
                  {selectedTicket.message}
                </div>
              </div>

              {/* Diagnostics if attached */}
              {selectedTicket.system_context && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                    Attached Diagnostics:
                  </label>
                  <pre style={{ padding: '12px', borderRadius: '8px', background: '#121215', border: '1px solid #27272a', fontSize: '11px', color: '#38bdf8', overflowX: 'auto' }}>
                    {JSON.stringify(selectedTicket.system_context, null, 2)}
                  </pre>
                </div>
              )}

              {/* Existing Response Display */}
              {selectedTicket.admin_response && (
                <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e', marginBottom: '6px' }}>
                    Current Response {selectedTicket.responded_at ? `(${new Date(selectedTicket.responded_at).toLocaleDateString()})` : ''}:
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#f4f4f5', whiteSpace: 'pre-wrap' }}>
                    {selectedTicket.admin_response}
                  </div>
                </div>
              )}

              {/* Response Form */}
              <form onSubmit={handleSendReply} style={{ borderTop: '1px solid #27272a', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  {selectedTicket.admin_response ? 'Update Developer Reply' : 'Post Developer Reply'}
                </h3>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12.5px', color: '#a1a1aa' }}>Update Status:</label>
                  <select
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value as 'open' | 'resolved' | 'closed')}
                    style={{ padding: '6px 10px', borderRadius: '6px', background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: '12.5px' }}
                  >
                    <option value="resolved">🟢 Resolved</option>
                    <option value="open">🔵 Open / In Review</option>
                    <option value="closed">⚪ Closed</option>
                  </select>
                </div>

                <textarea
                  rows={4}
                  placeholder="Type official response to user. This will be displayed in their Settings -> My Submissions tab and emailed to them."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#18181b', border: '1px solid #3f3f46', color: '#f4f4f5', fontSize: '13px', outline: 'none', resize: 'vertical' }}
                />

                {actionMessage && (
                  <div style={{ fontSize: '12.5px', color: actionMessage.includes('successfully') ? '#22c55e' : '#ef4444' }}>
                    {actionMessage}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={submittingReply || !replyText.trim()}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: '#6366f1',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: submittingReply ? 'not-allowed' : 'pointer',
                      opacity: submittingReply || !replyText.trim() ? 0.6 : 1,
                    }}
                  >
                    {submittingReply ? 'Dispatching Reply...' : 'Send Developer Response'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '14px' }}>
              Select a ticket from the left panel to inspect and respond.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
