'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';

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
      author: 'Abhi (Founder)',
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
        sender: 'Abhi (Founder)',
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
      author: 'Abhi (Founder)',
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
        sender: 'Abhi (Founder)',
        timestamp: new Date().toISOString()
      }
    };

    setPosts([newEntry, ...posts]);
    setNewPostText('');
  };

  return (
    <div style={{ maxWidth: '680px', width: '100%', margin: '0 auto', padding: '32px 16px 80px 16px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 3 · THE FLOW
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Signals
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
          The company's shared Instagram feed. Only decision-relevant real events (score &gt; 5) with consequence lines render here.
        </p>
      </header>

      {/* Top Composer Bar (Section 07 Spec) */}
      <form 
        onSubmit={handlePost}
        style={{
          background: 'var(--card, #fbfaf6)',
          border: '1px solid var(--border-paper, #e7e1d4)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '28px',
          display: 'flex',
          gap: '12px',
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
            fontSize: '14px',
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
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '12px',
            fontFamily: 'var(--font-jetbrains, monospace)',
            fontWeight: 600,
            cursor: newPostText.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease'
          }}
        >
          Post →
        </button>
      </form>

      {/* Feed Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {posts.map((post) => (
          <div key={post.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Author bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)' }}>
                {post.author} <span style={{ fontWeight: 400, color: 'var(--ink-faint, #6b6557)', fontSize: '11px', fontFamily: 'var(--font-jetbrains, monospace)' }}>({post.authorRole})</span>
              </span>
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--ink-faint, #6b6557)' }}>
                {post.timestamp}
              </span>
            </div>

            {/* S2 Understanding Card with Consequence line */}
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
  );
}
