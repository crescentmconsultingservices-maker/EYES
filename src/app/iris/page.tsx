'use client';

import { useState, Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import IrisSidebar from '@/components/iris/IrisSidebar';
import IrisTimeline from '@/components/iris/IrisTimeline';
import MorningBrief from '@/components/iris/MorningBrief';
import Signals from '@/components/iris/Signals';
import IrisHeader from '@/components/iris/IrisHeader';
import { useAuth } from '@/context/AuthContext';
import styles from '../chat/ChatPage.module.css';
import { AdaptiveCard } from '@/components/iris/AdaptiveCard';

import VoiceOrb from '@/components/iris/VoiceOrb';

interface IrisResponse {
  understanding: {
    answer: string;
    confidence: number;
    temporal_validity: any;
    receipts: any[];
  }
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  understanding?: IrisResponse['understanding'];
}

function IrisDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'investigate';
  
  const { user, isLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    const userMessage = { role: 'user' as const, content: query.trim() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/iris/v0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content })
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', understanding: data.understanding }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error connecting to IRIS API.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceTranscribe = (text: string) => {
    const userMessage = { role: 'user' as const, content: "(Voice) " + text };
    setMessages(prev => [...prev, userMessage]);
    // Simulate AI text response to the voice
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Voice input recognized and processed. (Kyutai Mock)' }]);
    }, 1000);
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
        
        <div className={styles.chatContentContainer} style={{ padding: view === 'investigate' ? '40px 40px 0 40px' : '0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {view === 'timeline' ? (
            <IrisTimeline />
          ) : view === 'morning-brief' ? (
             <MorningBrief />
          ) : view === 'signals' ? (
             <Signals />
          ) : (
            <>
              {messages.length === 0 && (
            <div style={{ marginBottom: '40px', marginTop: '10vh', textAlign: 'center' }}>
              <h1 className={styles.brandTitle} style={{ fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: 1.2, color: '#e06a3b' }}>
                IRIS Analysis Engine
              </h1>
              <p className={styles.brandSubtitle}>Strict JSON contract. Receipt anchored.</p>
            </div>
          )}

          {/* Chat History */}
          <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, paddingBottom: '40px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'user' ? (
                  <div style={{ background: '#e06a3b', color: 'white', padding: '12px 16px', borderRadius: '12px 12px 0 12px', maxWidth: '80%', fontSize: '15px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                ) : (
                  <div style={{ width: '100%' }}>
                    {m.content ? (
                       <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px' }}>{m.content}</div>
                    ) : m.understanding ? (
                      <AdaptiveCard 
                        answer={m.understanding.answer}
                        confidence={m.understanding.confidence}
                        receipts={m.understanding.receipts}
                        onReceiptClick={(receipt) => setActiveReceipt(receipt)}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {loading && (
               <div style={{ alignSelf: 'flex-start', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic', paddingLeft: '16px' }}>
                 IRIS is analyzing... <span className={styles.typingCursor}>▊</span>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '700px', margin: 'auto auto 0 auto', position: 'sticky', bottom: 0, paddingBottom: '40px', paddingTop: '20px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '24px', padding: '8px 12px 8px 24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.05)', alignItems: 'center' }}>
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
                placeholder="Message IRIS or tap the orb to speak..."
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '16px', outline: 'none', resize: 'none', maxHeight: '200px', minHeight: '24px', padding: '8px 0', fontFamily: 'inherit' }}
                rows={query.split('\n').length > 1 ? Math.min(query.split('\n').length, 8) : 1}
                disabled={loading}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingBottom: '2px' }}>
                <VoiceOrb onTranscribe={handleVoiceTranscribe} />
                <button 
                  type="submit" 
                  disabled={loading || !query.trim()}
                  style={{ background: query.trim() ? '#e06a3b' : 'var(--border)', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !query.trim() ? 0.7 : 1, transition: 'all 0.2s ease' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </div>
            </div>
          </form>

          {/* Investigation Panel (Right Side Drawer) */}
          {activeReceipt && (
            <>
              {/* Invisible Backdrop for click-away to close */}
              <div 
                onClick={() => setActiveReceipt(null)}
                style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  zIndex: 99,
                  background: 'transparent'
                }}
              />
              <div style={{
                position: 'fixed',
                top: 0, right: 0, bottom: 0,
                width: '400px',
                background: 'rgba(15, 15, 20, 0.95)',
                backdropFilter: 'blur(20px)',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                padding: '24px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
                animation: 'slideIn 0.3s ease-out forwards'
              }}>
                <style>{`
                  @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                  }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '16px', color: '#e2e8f0', margin: 0, fontWeight: 600 }}>Investigation Panel</h2>
                  <button 
                    onClick={() => setActiveReceipt(null)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
                  <p style={{ marginBottom: '8px' }}><strong>Source URL:</strong></p>
                  {activeReceipt.source_url.startsWith('/') ? (
                    <button 
                      onClick={() => router.push(activeReceipt.source_url)}
                      style={{ background: 'transparent', border: 'none', color: '#38bdf8', wordBreak: 'break-all', display: 'block', marginBottom: '24px', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                    >
                      {activeReceipt.source_url} →
                    </button>
                  ) : (
                    <a href={activeReceipt.source_url} style={{ color: '#38bdf8', wordBreak: 'break-all', display: 'block', marginBottom: '24px' }}>
                      {activeReceipt.source_url} →
                    </a>
                  )}
                  
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', marginBottom: '12px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Extracted Context
                    </p>
                    <p style={{ margin: 0, fontStyle: 'italic', color: '#f8fafc' }}>
                      "{activeReceipt.span || 'No specific text span extracted for this source.'}"
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
            </>
          )}

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
