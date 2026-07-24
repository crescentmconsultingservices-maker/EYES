'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';
import KnowledgeGraph from '@/components/dashboard/KnowledgeGraph';

interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'company' | 'self';
  summary: string;
  commitments: string[];
  recentChanges: string[];
}

export default function EntityDossier() {
  const [selectedEntityId, setSelectedEntityId] = useState<string>('self');
  const [showMindMapPanel, setShowMindMapPanel] = useState<boolean>(false);

  const entities: Entity[] = [
    {
      id: 'self',
      name: 'Abhi (Founder)',
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
    <div style={{ maxWidth: '880px', width: '100%', margin: '0 auto', padding: '32px 16px 80px 16px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 5 · LIVING WIKI
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Entity Dossiers
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '14px', margin: 0 }}>
          Synthesized living wiki per person, project, or company — including your own Self-Dossier.
        </p>
      </header>

      {/* Entity Selector Tabs (Section 09 Spec) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', borderBottom: '1px solid #e7e1d4', paddingBottom: '12px' }}>
        {entities.map((ent) => (
          <button
            key={ent.id}
            onClick={() => setSelectedEntityId(ent.id)}
            style={{
              background: selectedEntityId === ent.id ? 'var(--card, #fbfaf6)' : 'var(--paper-2, #f2ede3)',
              color: selectedEntityId === ent.id ? 'var(--accent, #bf3d11)' : 'var(--ink-soft, #3b372f)',
              border: selectedEntityId === ent.id ? '1px solid var(--accent-soft, #f0d9cd)' : '1px solid transparent',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontFamily: 'var(--font-inter, sans-serif)',
              fontWeight: selectedEntityId === ent.id ? 600 : 500,
              cursor: 'pointer',
              boxShadow: selectedEntityId === ent.id ? '0 2px 10px rgba(60,40,20,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {ent.type === 'self' ? '👤 Self-Dossier' : ent.name}
          </button>
        ))}
      </div>

      {/* Main Dossier Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Header Summary Card */}
        <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '10px', padding: '24px', boxShadow: 'var(--shadow-paper, 0 2px 20px rgba(60,40,20,0.05))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
              {currentEntity.type === 'self' ? 'FOUNDER SELF-DOSSIER' : `${currentEntity.type.toUpperCase()} DOSSIER`}
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--live, #2e8b7a)', fontWeight: 600 }}>
              ● Synthesized Living Graph
            </span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '24px', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 10px 0' }}>
            {currentEntity.name}
          </h2>

          <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--ink-soft, #3b372f)', margin: 0 }}>
            {currentEntity.summary}
          </p>
        </div>

        {/* Section: Open Commitments */}
        <div>
          <h3 style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', margin: '0 0 12px 0' }}>
            Open Commitments & Directives
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

        {/* Mind Map Demotion: Optional Expandable Panel (§09 Spec) */}
        <div style={{ marginTop: '16px', background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', overflow: 'hidden' }}>
          <button
            onClick={() => setShowMindMapPanel(!showMindMapPanel)}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              color: 'var(--ink-deep, #1a1714)',
              fontSize: '14px',
              fontFamily: 'var(--font-inter, sans-serif)',
              fontWeight: 600
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🕸️</span> Explore Graph Connections (Mind Map Neighborhood)
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', color: 'var(--accent, #bf3d11)' }}>
              {showMindMapPanel ? 'Collapse ▲' : 'Expand ▼'}
            </span>
          </button>

          {showMindMapPanel && (
            <div style={{ height: '500px', borderTop: '1px solid var(--border-paper, #e7e1d4)', position: 'relative' }}>
              <KnowledgeGraph />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
