'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';
import KnowledgeGraph from '@/components/dashboard/KnowledgeGraph';
import { useAuth } from '@/context/AuthContext';

interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'company' | 'self';
  summary: string;
  commitments: string[];
  recentChanges: string[];
}

export default function EntityDossier() {
  const { user } = useAuth();
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : 'Founder');

  const [selectedEntityId, setSelectedEntityId] = useState<string>('self');
  const [showMindMapPanel, setShowMindMapPanel] = useState<boolean>(false);

  const entities: Entity[] = [
    {
      id: 'self',
      name: `${userName} (Founder)`,
      type: 'self',
      summary: 'Founder Office & Lead Architect. Active on EYES memory graph, IRIS UI Specification alignment, and revenue leak detection audit.',
      commitments: [
        'Finalize IRIS Phase 0–Phase 2 UI implementation by end of week.',
        'Review Supabase vector store auth headers with security team.'
      ],
      recentChanges: [
        'Updated globals.css with Paper & Ink design tokens.',
        'Refactored VoiceOrb SpeechRecognition error handling.'
      ]
    },
    {
      id: 'eyes-project',
      name: 'EYES Platform',
      type: 'project',
      summary: 'Digital memory dashboard and automated revenue audit engine for personal and enterprise data.',
      commitments: [
        '10x speedup parallel email scanner pipeline.',
        'IRIS Paper & Ink design system migration.'
      ],
      recentChanges: [
        'Superseded dark periwinkle chat bubbles with un-bubbled flowing prose.',
        'Integrated 4-layer Receipt Panel.'
      ]
    },
    {
      id: 'vendo-co',
      name: 'Vendo (YC S26)',
      type: 'company',
      summary: 'External competitor logged in intel synthesis pass. Released open-source host UI composition library.',
      commitments: [
        'Monitor API schema changes in public repository.'
      ],
      recentChanges: [
        'Logged in overnight intel pass on 2026-07-24.'
      ]
    }
  ];

  const currentEntity = entities.find(e => e.id === selectedEntityId) || entities[0];

  return (
    <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 40px 80px 40px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 5 · LIVING WIKI
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Entity Dossiers
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '15px', margin: 0, lineHeight: 1.5 }}>
          Synthesized living wiki per person, project, or company — including your own Self-Dossier.
        </p>
      </header>

      {/* Entity Selector Tabs (Section 09 Spec) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', overflowX: 'auto', borderBottom: '1px solid #e7e1d4', paddingBottom: '14px' }}>
        {entities.map((ent) => (
          <button
            key={ent.id}
            onClick={() => setSelectedEntityId(ent.id)}
            style={{
              background: selectedEntityId === ent.id ? 'var(--card, #fbfaf6)' : 'var(--paper-2, #f2ede3)',
              color: selectedEntityId === ent.id ? 'var(--accent, #bf3d11)' : 'var(--ink-soft, #3b372f)',
              border: selectedEntityId === ent.id ? '1px solid var(--accent-soft, #f0d9cd)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '13px',
              fontFamily: 'var(--font-inter, sans-serif)',
              fontWeight: selectedEntityId === ent.id ? 600 : 500,
              cursor: 'pointer',
              boxShadow: selectedEntityId === ent.id ? '0 2px 10px rgba(60,40,20,0.06)' : 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {ent.type === 'self' ? '👤 Self-Dossier' : ent.name}
          </button>
        ))}
      </div>

      {/* 2-Column Responsive Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Main Dossier Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Header Summary Card */}
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '12px', padding: '28px', boxShadow: 'var(--shadow-paper, 0 2px 20px rgba(60,40,20,0.05))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
                {currentEntity.type === 'self' ? 'FOUNDER SELF-DOSSIER' : `${currentEntity.type.toUpperCase()} DOSSIER`}
              </span>
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--live, #2e8b7a)', fontWeight: 600 }}>
                ● Synthesized Living Graph
              </span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '26px', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 10px 0' }}>
              {currentEntity.name}
            </h2>

            <p style={{ fontSize: '15.5px', lineHeight: 1.6, color: 'var(--ink-soft, #3b372f)', margin: 0 }}>
              {currentEntity.summary}
            </p>
          </div>

          {/* Section: Open Commitments */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', margin: '0 0 12px 0' }}>
              Open Commitments & Directives
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {currentEntity.commitments.map((item, idx) => (
                <UnderstandingCard
                  key={idx}
                  title={item}
                  body={`Active in graph for ${currentEntity.name}. Claim openable to original source thread.`}
                  kicker="COMMITMENT"
                  statusBadge="Active"
                  badgeType="good"
                  receipt={{
                    source_url: '/iris?view=timeline',
                    span: item,
                    sender: currentEntity.name,
                    timestamp: '2026-07-24 · 09:00 UTC'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Section: Recent Changes */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', margin: '12px 0 12px 0' }}>
              Recent Belief Changes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {currentEntity.recentChanges.map((item, idx) => (
                <UnderstandingCard
                  key={idx}
                  title={item}
                  body={`Verified belief state transition logged on EYES memory graph.`}
                  kicker="STATE CHANGE"
                  statusBadge="Verified"
                  badgeType="slate"
                  receipt={{
                    source_url: '/iris?view=signals',
                    span: item,
                    sender: currentEntity.name,
                    timestamp: '2026-07-24 · 11:00 UTC'
                  }}
                />
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Graph Connections Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 14px rgba(60,40,20,0.03)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '1.15rem', fontWeight: 600, color: '#16140f', margin: '0 0 8px 0' }}>
              Graph Neighborhood
            </h3>
            <p style={{ fontSize: '13px', color: '#3b372f', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Explore bi-temporal entity connections and historical belief transitions.
            </p>
            <button
              onClick={() => setShowMindMapPanel(!showMindMapPanel)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--paper-2, #f2ede3)',
                border: '1px solid #e7e1d4',
                borderRadius: '8px',
                color: 'var(--accent, #bf3d11)',
                fontSize: '13px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {showMindMapPanel ? '▲ Hide Graph Simulation' : '🕸️ Expand Graph Mind Map →'}
            </button>
          </div>

          {showMindMapPanel && (
            <div style={{ height: '500px', borderRadius: '12px', border: '1px solid var(--border-paper, #e7e1d4)', overflow: 'hidden', position: 'relative' }}>
              <KnowledgeGraph />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
