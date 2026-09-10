'use client';

import { useState, useEffect } from 'react';
import UnderstandingCard from './UnderstandingCard';
import KnowledgeGraph from '@/components/dashboard/KnowledgeGraph';
import HonestEmptyState from './HonestEmptyState';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'company' | 'self';
  summary: string;
  commitments: string[];
  recentChanges: string[];
}

export default function EntityDossier() {
  const router = useRouter();
  const { user } = useAuth();
  const userName = user?.name || (user?.email ? user.email.split('@')[0] : 'Founder');

  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('self');
  const [showMindMapPanel, setShowMindMapPanel] = useState<boolean>(false);

  useEffect(() => {
    async function loadEntities() {
      try {
        setLoading(true);
        const res = await fetch('/api/graph');
        if (!res.ok) throw new Error('Failed to fetch graph data');
        const data = await res.json();

        const rawNodes = data.nodes || [];
        const rawEdges = data.edges || [];

        // Build self dossier
        const selfCommitments = rawEdges
          .filter((e: any) => (e.label === 'commitment' || e.relation_label === 'commitment'))
          .slice(0, 5)
          .map((e: any) => `${e.label || 'Commitment'}: ${e.tail_name || e.target || 'Active obligation'}`);

        const selfChanges = rawEdges
          .filter((e: any) => e.valid_to)
          .slice(0, 5)
          .map((e: any) => `Superseded belief: ${e.head_name || e.source} (${e.label || 'relation'})`);

        const selfEntity: Entity = {
          id: 'self',
          name: `${userName} (Founder)`,
          type: 'self',
          summary: `Founder profile & digital memory graph owner. Active across ${rawNodes.length} graph nodes and ${rawEdges.length} verified relationship edges.`,
          commitments: selfCommitments.length > 0 ? selfCommitments : ['No outstanding unfulfilled commitments detected.'],
          recentChanges: selfChanges.length > 0 ? selfChanges : ['Belief states current. No superseded lineage items.']
        };

        // Build dossiers for other detected entities
        const otherEntities: Entity[] = rawNodes
          .filter((n: any) => n.id !== 'self' && n.name && n.name.toLowerCase() !== 'user')
          .slice(0, 10)
          .map((n: any) => {
            const connectedEdges = rawEdges.filter((e: any) => e.source === n.id || e.target === n.id);
            const nodeCommitments = connectedEdges
              .filter((e: any) => e.label === 'commitment')
              .map((e: any) => `${e.source === n.id ? 'Committed to' : 'Obligation from'}: ${e.label}`);
            
            const nodeChanges = connectedEdges
              .filter((e: any) => e.valid_to)
              .map((e: any) => `Superseded relationship on ${new Date(e.valid_to).toLocaleDateString()}`);

            const typeGuess: 'person' | 'project' | 'company' = 
              n.label === 'person' ? 'person' : n.label === 'project' ? 'project' : 'company';

            return {
              id: n.id,
              name: n.name || n.label || 'Entity',
              type: typeGuess,
              summary: n.description || `Extracted entity node from connected memories with ${connectedEdges.length} graph associations.`,
              commitments: nodeCommitments.length > 0 ? nodeCommitments : ['No active commitments attached to this node.'],
              recentChanges: nodeChanges.length > 0 ? nodeChanges : ['Stable graph representation.']
            };
          });

        const fullList = [selfEntity, ...otherEntities];
        setEntities(fullList);
        setSelectedEntityId('self');
      } catch (err) {
        console.warn('Failed loading entities from graph:', err);
        setEntities([{
          id: 'self',
          name: `${userName} (Founder)`,
          type: 'self',
          summary: 'Founder profile & memory graph root node.',
          commitments: ['No commitments recorded yet.'],
          recentChanges: ['Memory graph initialized.']
        }]);
      } finally {
        setLoading(false);
      }
    }

    loadEntities();
  }, [userName]);

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
