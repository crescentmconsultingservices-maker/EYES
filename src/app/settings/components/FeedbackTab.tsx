import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from '../settings.module.css';

interface FeedbackTicket {
  id: string;
  type: 'bug' | 'feature' | 'feedback';
  area: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_response?: string | null;
  responded_at?: string | null;
  created_at: string;
}

export default function FeedbackTab() {
  const { theme } = useAuth();
  
  const [feedbackTab, setFeedbackTab] = useState<'submit' | 'history'>('submit');
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'feedback'>('feedback');
  const [feedbackArea, setFeedbackArea] = useState('Chat & Neural Search');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  
  const [userTickets, setUserTickets] = useState<FeedbackTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const fetchUserTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await fetch('/api/user/feedback');
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        setUserTickets(data.tickets);
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchUserTickets();
  }, []);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackSubject.trim() || !feedbackMessage.trim() || isSubmittingTicket) return;
    setIsSubmittingTicket(true);
    setTicketError(null);
    setTicketSuccess(null);

    const diagnostics = includeDiagnostics ? {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      theme,
      windowSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
      timestamp: new Date().toISOString(),
    } : undefined;

    try {
      const res = await fetch('/api/user/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          area: feedbackArea,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
          systemContext: diagnostics,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTicketSuccess(`Ticket #${data.ticket?.id ? data.ticket.id.slice(0, 8) : 'Created'} dispatched! Notification sent to our engineering team.`);
        setFeedbackSubject('');
        setFeedbackMessage('');
        if (data.ticket) {
          setUserTickets(prev => [data.ticket, ...prev]);
        }
      } else {
        setTicketError(data.error || 'Failed to submit feedback.');
      }
    } catch {
      setTicketError('Network error submitting feedback.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Support & Feedback Center
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Submit bug reports, feature requests, or direct feedback. Our engineering team reviews and responds directly.
          </p>
        </div>

        {/* Sub-tabs navigation */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            type="button"
            onClick={() => setFeedbackTab('submit')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: feedbackTab === 'submit' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: feedbackTab === 'submit' ? '2px solid var(--text-primary)' : '2px solid transparent',
              paddingBottom: '4px',
              transition: 'all 0.15s ease',
            }}
          >
            Submit Ticket
          </button>
          <button
            type="button"
            onClick={() => { setFeedbackTab('history'); fetchUserTickets(); }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: feedbackTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: feedbackTab === 'history' ? '2px solid var(--text-primary)' : '2px solid transparent',
              paddingBottom: '4px',
              transition: 'all 0.15s ease',
            }}
          >
            My Submissions {userTickets.length > 0 ? `(${userTickets.length})` : ''}
          </button>
        </div>
      </div>

      {ticketSuccess && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{ticketSuccess}</span>
          <button 
            onClick={() => setFeedbackTab('history')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
          >
            View in My Submissions →
          </button>
        </div>
      )}

      {ticketError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '16px'
        }}>
          {ticketError}
        </div>
      )}

      {feedbackTab === 'submit' ? (
        <form onSubmit={handleSubmitTicket} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Category Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Ticket Category
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'feedback', label: 'Feedback' },
                { id: 'bug', label: 'Bug Report' },
                { id: 'feature', label: 'Feature Request' },
              ].map(item => {
                const active = feedbackType === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setFeedbackType(item.id as 'bug' | 'feature' | 'feedback')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      border: active ? '1px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                      background: active ? 'var(--text-primary)' : 'var(--bg-secondary)',
                      color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Area Selection & Subject */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Area
              </label>
              <select
                value={feedbackArea}
                onChange={(e) => setFeedbackArea(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  appearance: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="Chat & Neural Search">Chat & Neural Search</option>
                <option value="Connectors & Ingestion">Connectors & Ingestion</option>
                <option value="Action Queue">Action Queue</option>
                <option value="Privacy & Security">Privacy & Security</option>
                <option value="UI & Aesthetics">UI & Aesthetics</option>
                <option value="General System">General System</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Subject
              </label>
              <input
                type="text"
                placeholder="Brief summary of the issue or idea..."
                value={feedbackSubject}
                onChange={(e) => setFeedbackSubject(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Detailed Message */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Details & Observations
            </label>
            <textarea
              rows={4}
              placeholder="Describe what happened, steps to reproduce, or why this feature would help you..."
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Diagnostics toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
            />
            <span>Attach diagnostic context (browser info, theme, timestamp) to help engineers resolve faster</span>
          </label>

          {/* Submit button */}
          <div style={{ marginTop: '8px' }}>
            <button
              type="submit"
              disabled={isSubmittingTicket || !feedbackSubject.trim() || !feedbackMessage.trim()}
              style={{
                width: '100%',
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isSubmittingTicket ? 'not-allowed' : 'pointer',
                opacity: isSubmittingTicket || !feedbackSubject.trim() || !feedbackMessage.trim() ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {isSubmittingTicket ? 'Dispatching Ticket...' : 'Submit Feedback & Dispatch Ticket'}
            </button>
          </div>
        </form>
      ) : (
        /* My Submissions / Ticket History */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loadingTickets ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Loading your submitted tickets...
            </div>
          ) : userTickets.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: 'rgba(0,0,0,0.02)',
              border: '1px dashed var(--border)',
              borderRadius: '12px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>No tickets submitted yet</div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '6px auto 16px' }}>
                Any bugs, suggestions, or questions you submit will appear here with live resolution status and developer answers.
              </p>
              <button
                type="button"
                onClick={() => setFeedbackTab('submit')}
                style={{
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Submit Your First Ticket
              </button>
            </div>
          ) : (
            userTickets.map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                    }}>
                      {ticket.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      #{ticket.id.slice(0, 8)} · {ticket.area}
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {new Date(ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {ticket.subject}
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {ticket.message}
                </div>

                {/* Developer Reply Card */}
                {ticket.admin_response && (
                  <div style={{
                    marginTop: '8px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    borderLeft: '3px solid var(--text-primary)',
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Developer Response {ticket.responded_at ? `(${new Date(ticket.responded_at).toLocaleDateString()})` : ''}:
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {ticket.admin_response}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
