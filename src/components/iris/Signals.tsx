'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';
import { useAuth } from '@/context/AuthContext';

interface Post {
  id: string;
  author: string;
  authorRole: string;
  timestamp: string;
  title: string;
  body: string;
  meaning: string;
  score: number;
  badgeType: 'live' | 'good' | 'accent' | 'slate';
  receipt: any;
}

export default function Signals() {
  const { user } = useAuth();
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : 'Founder');

  const [posts, setPosts] = useState<Post[]>([
    {
      id: 'sig-1',
      author: 'IRIS Synthesis Engine',
      authorRole: 'Auto-Post · Score 9.4/10',
      timestamp: 'Today · 10:14 UTC',
      title: 'Competitor Vendo (YC S26) Open-Source Launch',
      body: 'Vendo published their live UI composition framework for host products.',
      meaning: 'What it means: Proves UI composition thesis, but lacks personal memory context. Our receipted understanding layer remains our core moat.',
      score: 9.4,
      badgeType: 'accent',
      receipt: {
        source_url: '/iris?view=dossiers',
        span: 'Competitor Vendo (YC S26) Open-Source Launch — Proves UI composition thesis.',
        sender: 'Intel Synthesis Worker',
        timestamp: '2026-07-24 · 10:14 UTC',
        confidence: 0.98
      }
    },
    {
      id: 'sig-2',
      author: `${userName} (Founder)`,
      authorRole: 'Founder Office',
      timestamp: 'Today · 09:30 UTC',
      title: 'Paper & Ink Token Integration Completed',
      body: 'All surfaces now inherit the warm #faf7f1 palette, Fraunces serif display titles, and JetBrains Mono evidence.',
      meaning: 'What it means: The interface is now visually cohesive and aligned to the IRIS UI Specification v1.0.',
      score: 8.8,
      badgeType: 'good',
      receipt: {
        source_url: '/iris?view=desk',
        span: 'Paper & Ink Token Integration Completed in globals.css.',
        sender: `${userName} (Founder)`,
        timestamp: '2026-07-24 · 09:30 UTC'
      }
    },
    {
      id: 'sig-3',
      author: 'IRIS Security Daemon',
      authorRole: 'Auto-Post · Score 9.1/10',
      timestamp: 'Yesterday · 22:40 UTC',
      title: 'X-Engine-Secret Auth Audit Passed',
      body: 'Verified that all Modal Python engine requests reject unauthenticated calls.',
      meaning: 'What it means: Zero credential leakage risk across production vector memory operations.',
      score: 9.1,
      badgeType: 'live',
      receipt: {
        source_url: '/settings',
        span: 'X-Engine-Secret Auth Audit Passed on Modal engine.',
        sender: 'Security Daemon',
        timestamp: '2026-07-23 · 22:40 UTC'
      }
    }
  ]);

  const [newPostText, setNewPostText] = useState('');

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim()) return;

    const newEntry: Post = {
      id: `sig-${Date.now()}`,
      author: `${userName} (Founder)`,
      authorRole: 'Founder Post',
      timestamp: 'Just now',
      title: newPostText.trim(),
      body: 'Manual update posted directly to the team feed.',
      meaning: 'What it means: Direct founder directive logged into the company memory graph.',
      score: 8.0,
      badgeType: 'accent',
      receipt: {
        source_url: '/iris?view=signals',
        span: newPostText.trim(),
        sender: `${userName} (Founder)`,
        timestamp: new Date().toISOString()
      }
    };

    setPosts([newEntry, ...posts]);
    setNewPostText('');
  };

  return (
    <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 40px 80px 40px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 3 · THE FLOW
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Signals
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '15px', margin: 0, lineHeight: 1.5 }}>
          The company's shared Instagram feed. Only decision-relevant real events (score &gt; 5) with consequence lines render here.
        </p>
      </header>

      {/* 2-Column Responsive Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Main Composer Bar & Feed Stream */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* Top Composer Bar (Section 07 Spec) */}
          <form 
            onSubmit={handlePost}
            style={{
              background: 'var(--card, #fbfaf6)',
              border: '1px solid var(--border-paper, #e7e1d4)',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '28px',
              display: 'flex',
              gap: '14px',
              boxShadow: 'var(--shadow-paper, 0 2px 20px rgba(60,40,20,0.05))'
            }}
          >
            <input
              type="text"
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              placeholder="Post to the team..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '15px',
                fontFamily: 'var(--font-inter, sans-serif)',
                color: 'var(--ink, #16140f)'
              }}
            />
            <button
              type="submit"
              disabled={!newPostText.trim()}
              style={{
                background: newPostText.trim() ? 'var(--accent, #bf3d11)' : 'var(--paper-2, #f2ede3)',
                color: newPostText.trim() ? '#ffffff' : 'var(--ink-faint, #6b6557)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontWeight: 600,
                cursor: newPostText.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease'
              }}
            >
              Post →
            </button>
          </form>

          {/* Feed Stream Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {posts.map((post) => (
              <div key={post.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)' }}>
                    {post.author} <span style={{ fontWeight: 400, color: 'var(--ink-faint, #6b6557)', fontSize: '11px', fontFamily: 'var(--font-jetbrains, monospace)' }}>({post.authorRole})</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--ink-faint, #6b6557)' }}>
                    {post.timestamp}
                  </span>
                </div>

                <UnderstandingCard
                  title={post.title}
                  body={post.body}
                  statusBadge={`Signal ${post.score}`}
                  badgeType={post.badgeType}
                  receipt={post.receipt}
                >
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #e7e1d4', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', color: 'var(--accent-ink, #7a2a0e)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    {post.meaning}
                  </div>
                </UnderstandingCard>
              </div>
            ))}
          </div>

        </div>

        {/* RIGHT COLUMN: Signal Feed Insights & Filter Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 14px rgba(60,40,20,0.03)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '1.15rem', fontWeight: 600, color: '#16140f', margin: '0 0 8px 0' }}>
              Decision-Relevance Rule
            </h3>
            <p style={{ fontSize: '13px', color: '#3b372f', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Only items with a score &gt; 5.0 and explicit consequence lines render in the company feed. Five real beat fifty.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                <span style={{ color: '#6b6557' }}>Relevance Threshold:</span>
                <span style={{ color: '#bf3d11', fontWeight: 600 }}>SCORE &gt; 5.0</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                <span style={{ color: '#6b6557' }}>Auto-Posts Today:</span>
                <span style={{ color: '#2f6b4f', fontWeight: 600 }}>3 EVENTS</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
