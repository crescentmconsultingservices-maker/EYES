'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import IrisSidebar from '@/components/iris/IrisSidebar';
import IrisTimeline from '@/components/iris/IrisTimeline';
import MorningBrief from '@/components/iris/MorningBrief';
import Signals from '@/components/iris/Signals';
import IrisHeader from '@/components/iris/IrisHeader';
import IrisSettings from '@/components/iris/IrisSettings';
import { useAuth } from '@/context/AuthContext';
import styles from '../chat/ChatPage.module.css';
import { AdaptiveCard } from '@/components/iris/AdaptiveCard';
import ActiveTasksDrawer from '@/components/iris/ActiveTasksDrawer';
import AgentTerminal from '@/components/iris/AgentTerminal';
import EmbeddedTab from '@/components/iris/EmbeddedTab';
import ReceiptPanel from '@/components/iris/ReceiptPanel';
import IntentCards from '@/components/iris/IntentCards';
import KnowledgeGraph from '@/components/dashboard/KnowledgeGraph';
import EntityDossier from '@/components/iris/EntityDossier';
import UniversalInvestigate from '@/components/iris/UniversalInvestigate';

import VoiceOrb, { VoiceOrbRef } from '@/components/iris/VoiceOrb';

interface IrisResponse {
  understanding: {
    answer: string;
    confidence: number;
    temporal_validity: any;
    receipts: any[];
    intent?: string;
    intent_data?: any[];
    app_data?: any;
  }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  understanding?: IrisResponse['understanding'];
  isAgent?: boolean;
}

function IrisDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'investigate';
  
  const { user, isLoading, theme } = useAuth();

  const titleGradient = theme === 'ember'
    ? 'linear-gradient(135deg, #ff8a00, #e52e71)'
    : theme === 'light'
      ? 'linear-gradient(135deg, #0f172a, #475569)'
      : 'linear-gradient(135deg, #ffffff, #94a3b8)';

  const userBubbleBg = theme === 'ember'
    ? 'linear-gradient(135deg, #e06a3b, #d94a1c)'
    : theme === 'light'
      ? 'linear-gradient(135deg, #0f172a, #334155)'
      : 'linear-gradient(135deg, #1e293b, #0f172a)';

  const pillBorder = theme === 'ember'
    ? 'rgba(224, 106, 59, 0.25)'
    : theme === 'light'
      ? 'rgba(15, 23, 42, 0.25)'
      : 'rgba(255, 255, 255, 0.25)';

  const glowColor = theme === 'ember'
    ? 'rgba(224, 106, 59, 0.4)'
    : theme === 'light'
      ? 'rgba(15, 23, 42, 0.15)'
      : 'rgba(255, 255, 255, 0.25)';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [isTasksDrawerOpen, setIsTasksDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceOrbRef = useRef<VoiceOrbRef>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const processQuery = async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || loading) return;
    
    const userMessage = { role: 'user' as const, content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    
    if (trimmed.startsWith('/agent ')) {
      const task = trimmed.replace('/agent ', '').trim();
      setMessages(prev => [...prev, { role: 'assistant', content: task, isAgent: true }]);
      return;
    }

    if (trimmed.startsWith('/app ')) {
      const type = trimmed.replace('/app ', '').trim();
      const appData = type === 'graph' 
        ? { type: 'knowledge-graph', data: { nodes: 42, edges: 112 } }
        : { type: 'data-grid', data: { rows: [{date: '2023-10-01', metric: 'MRR', value: '$12,000'}, {date: '2023-10-02', metric: 'MRR', value: '$12,400'}] } };

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        understanding: { 
          answer: `Here is the embedded interactive ${type} application you requested.`, 
          confidence: 0.99, 
          temporal_validity: null,
          receipts: [],
          intent: 'render_app',
          app_data: appData
        } 
      }]);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/iris/v0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed })
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', understanding: data.understanding }]);
      
      // Trigger TTS to speak the answer
      if (data.understanding?.answer && voiceOrbRef.current) {
        voiceOrbRef.current.speak(data.understanding.answer);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error connecting to IRIS API.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    processQuery(query);
  };

  const handleVoiceTranscribe = (text: string) => {
    if (!text.trim()) return;
    processQuery(text);
  };

  if (isLoading || !user) {
    return (
      <div style={{ background: '#080808', height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#E06A3B', fontSize: '12px', letterSpacing: '0.15em' }}>Connecting…</div>
      </div>
    );
  }

  return (
    <div className={styles.chatRoot}>
      <div className={styles.sidebarWrapper}>
        <IrisSidebar />
      </div>
      <div className={styles.mainWrapper}>
        <div className={styles.headerWrapper}>
          <IrisHeader />
        </div>
        
        <div className={styles.chatContentContainer} style={{ padding: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
          
          {view === 'timeline' ? (
            <IrisTimeline />
          ) : view === 'morning-brief' || view === 'desk' ? (
             <MorningBrief />
          ) : view === 'signals' ? (
             <Signals />
          ) : view === 'dossiers' ? (
             <EntityDossier />
          ) : view === 'investigate' ? (
             <UniversalInvestigate />
          ) : view === 'mind-map' ? (
             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px', overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border)' }}>
               <KnowledgeGraph />
             </div>
          ) : view === 'settings' ? (
             <IrisSettings />
          ) : (
            <>
              <style>{`
                @keyframes slideUpFade {
                  from { opacity: 0; transform: translateY(20px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulseGlow {
                  0% { text-shadow: 0 0 20px ${glowColor}; }
                  50% { text-shadow: 0 0 40px ${glowColor}; }
                  100% { text-shadow: 0 0 20px ${glowColor}; }
                }
                .iris-message-enter {
                  animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .iris-glass-pill {
                  background: #ffffff;
                  border: 1.5px solid #d4cbba;
                  border-radius: 32px;
                  box-shadow: 0 10px 32px rgba(35, 25, 15, 0.1), 0 2px 6px rgba(0, 0, 0, 0.04);
                  transition: all 0.25s ease;
                }
                .iris-glass-pill:focus-within {
                  border-color: var(--accent, #bf3d11);
                  box-shadow: 0 12px 38px rgba(191, 61, 17, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06);
                }
                .iris-glass-pill textarea::placeholder {
                  color: #575247;
                  font-weight: 500;
                  opacity: 0.9;
                }
              `}</style>
              {messages.length === 0 && (
            <div style={{ marginBottom: '40px', marginTop: '10vh', textAlign: 'center', animation: 'slideUpFade 0.6s ease-out' }}>
              <h1 style={{ fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1.2, fontWeight: 800, color: 'var(--ink-deep, #1a1714)', fontFamily: 'var(--font-serif-display, serif)', margin: '0 0 12px 0', letterSpacing: '-0.02em' }}>
                IRIS Analysis Engine
              </h1>
              <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '13px', fontFamily: 'var(--font-jetbrains, monospace)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Strict JSON Contract • Receipt Anchored</p>
            </div>
          )}

          {/* Chat History */}
          <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, paddingBottom: '40px' }}>
            {messages.map((m, i) => (
              <div key={i} className="iris-message-enter" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'user' ? (
                  <div style={{
                    background: 'var(--paper-2, #f2ede3)',
                    color: 'var(--ink-soft, #3b372f)',
                    fontFamily: 'var(--font-jetbrains, monospace)',
                    fontSize: '13px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    maxWidth: '75%',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid var(--border-paper, #e7e1d4)',
                    boxShadow: '0 1px 4px rgba(60,40,20,0.03)'
                  }}>
                    {m.content}
                  </div>
                ) : (
                  <div style={{ width: '100%' }}>
                    {m.isAgent ? (
                      <AgentTerminal task={m.content || 'Default Agent Task'} />
                    ) : m.content ? (
                       <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px' }}>{m.content}</div>
                    ) : m.understanding ? (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {m.understanding.intent && m.understanding.intent !== 'none' && m.understanding.intent_data && (
                          <IntentCards 
                            intent={m.understanding.intent} 
                            intentData={m.understanding.intent_data} 
                            onReceiptClick={(receipt) => setActiveReceipt(receipt)} 
                          />
                        )}
                        <AdaptiveCard 
                          answer={m.understanding.answer}
                          confidence={m.understanding.confidence}
                          receipts={m.understanding.receipts}
                          onReceiptClick={(receipt) => setActiveReceipt(receipt)}
                        />
                        {m.understanding.intent === 'render_app' && m.understanding.app_data && (
                          <EmbeddedTab appType={m.understanding.app_data.type} data={m.understanding.app_data.data} />
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {loading && (
               <div style={{ alignSelf: 'flex-start', color: 'var(--ink-faint, #6b6557)', fontSize: '14px', fontFamily: 'var(--font-jetbrains, monospace)', fontStyle: 'italic', paddingLeft: '16px' }}>
                 IRIS is analyzing... <span className={styles.typingCursor}>▊</span>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Floating Suggestion Chips (§06 Spec) */}
          <div style={{ width: '100%', maxWidth: '700px', margin: '0 auto', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', zIndex: 10 }}>
            {[
              { label: 'what did I commit to', text: 'what did I commit to' },
              { label: 'what\'s slipping', text: 'what\'s slipping' },
              { label: 'what changed about EYES', text: 'what changed about EYES' }
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => processQuery(chip.text)}
                style={{
                  background: '#ffffff',
                  color: 'var(--accent, #bf3d11)',
                  border: '1.5px solid #d4cbba',
                  borderRadius: '16px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-jetbrains, monospace)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 3px 10px rgba(40, 30, 20, 0.05)',
                  transition: 'all 0.18s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-soft, #f0d9cd)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                }}
              >
                + {chip.label}
              </button>
            ))}
          </div>

          <form id="chat-form" onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '700px', margin: '0 auto 0 auto', position: 'sticky', bottom: 0, paddingBottom: '40px', paddingTop: '8px', background: 'transparent' }}>
            <div className="iris-glass-pill" style={{ display: 'flex', padding: '10px 16px 10px 24px', alignItems: 'center' }}>
              <textarea 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (query.trim() && !loading) {
                      handleSubmit(e as unknown as React.FormEvent);
                    }
                  }
                }}
                placeholder="Message IRIS or type /agent <task>..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#16140f', fontSize: '15px', fontWeight: 500, outline: 'none', resize: 'none', maxHeight: '200px', minHeight: '24px', padding: '10px 0', fontFamily: 'inherit', lineHeight: '1.5' }}
                rows={query.split('\n').length > 1 ? Math.min(query.split('\n').length, 8) : 1}
                disabled={loading}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingBottom: '2px' }}>
                <VoiceOrb ref={voiceOrbRef} onTranscribe={handleVoiceTranscribe} />
                <button 
                  type="submit" 
                  disabled={loading || !query.trim()}
                  style={{ 
                    background: query.trim() ? 'var(--accent, #bf3d11)' : '#e8e2d5', 
                    color: query.trim() ? '#ffffff' : '#4a4438', 
                    border: query.trim() ? 'none' : '1px solid #c8beaa', 
                    borderRadius: '50%', 
                    width: '40px', 
                    height: '40px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', 
                    opacity: loading ? 0.7 : 1, 
                    transition: 'all 0.2s ease', 
                    boxShadow: query.trim() ? '0 4px 15px rgba(191, 61, 17, 0.35)' : 'none' 
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsTasksDrawerOpen(true)}
                  style={{ background: '#e8e2d5', color: '#2c2824', border: '1px solid #c8beaa', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  title="Cloud Tasks"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent, #bf3d11)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'var(--accent, #bf3d11)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#e8e2d5'; e.currentTarget.style.color = '#2c2824'; e.currentTarget.style.borderColor = '#c8beaa'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </button>
              </div>
            </div>
          </form>

          {/* Investigation Panel (Right Side Drawer) */}
          <ReceiptPanel receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
            </>
          )}

          <ActiveTasksDrawer isOpen={isTasksDrawerOpen} onClose={() => setIsTasksDrawerOpen(false)} />

        </div>
      </div>
    </div>
  );
}

export default function IrisDashboard() {
  return (
    <Suspense fallback={<div>Loading IRIS...</div>}>
      <IrisDashboardInner />
    </Suspense>
  );
}
