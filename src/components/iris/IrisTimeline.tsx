import { useState, useEffect } from 'react';
import UnderstandingCard from './UnderstandingCard';
import HonestEmptyState from './HonestEmptyState';
import { useRouter } from 'next/navigation';

export interface TimelineEventItem {
  id: string;
  date: string;
  category: 'money' | 'people' | 'product' | 'decisions';
  title: string;
  body: string;
  isSuperseded: boolean;
  kicker: string;
  supersededText?: string;
  replacementTitle?: string;
  receipt: {
    source_url: string;
    span: string;
    sender: string;
    timestamp: string;
    validity?: string;
  };
}

export default function IrisTimeline() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [zoomScale, setZoomScale] = useState<'day' | 'month'>('day');
  const [events, setEvents] = useState<TimelineEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        const res = await fetch('/api/iris/v0/timeline');
        if (!res.ok) throw new Error('Failed to fetch timeline');
        const data = await res.json();
        
        const rawEdges = data.events || [];
        const parsed: TimelineEventItem[] = rawEdges.map((edge: any) => {
          const isSuperseded = Boolean(edge.valid_to);
          const headName = edge.head?.name || 'Entity';
          const tailName = edge.tail?.name || 'Relation';
          const relation = edge.relation_label || 'connected_to';
          
          let category: 'money' | 'people' | 'product' | 'decisions' = 'product';
          const labelLower = (relation + ' ' + (edge.head?.label || '') + ' ' + (edge.tail?.label || '')).toLowerCase();
          if (labelLower.includes('money') || labelLower.includes('fee') || labelLower.includes('payment') || labelLower.includes('revenue')) {
            category = 'money';
          } else if (labelLower.includes('person') || labelLower.includes('people') || labelLower.includes('author')) {
            category = 'people';
          } else if (labelLower.includes('decision') || labelLower.includes('commitment') || labelLower.includes('delayed') || labelLower.includes('blocked')) {
            category = 'decisions';
          }

          const dateStr = edge.valid_from ? new Date(edge.valid_from).toISOString().split('T')[0] : 'Recent';
          const title = `${headName} — ${relation.replace(/_/g, ' ')} ${tailName}`;
          const body = edge.memory_content || `Relationship between ${headName} and ${tailName} confirmed in memory graph.`;

          return {
            id: edge.id,
            date: dateStr,
            category,
            title,
            body,
            isSuperseded,
            kicker: `${isSuperseded ? 'SUPERSEDED BELIEF' : 'ACTIVE BELIEF'} · ${category.toUpperCase()}`,
            supersededText: isSuperseded ? `superseded on ${edge.valid_to ? new Date(edge.valid_to).toLocaleDateString() : 'earlier date'} · preserved in graph` : undefined,
            replacementTitle: isSuperseded ? `${headName} active updated state` : undefined,
            receipt: {
              source_url: edge.source_url || '/iris?view=desk',
              span: edge.memory_content?.slice(0, 180) || title,
              sender: edge.head?.name || 'EYES Memory Graph',
              timestamp: edge.valid_from ? new Date(edge.valid_from).toLocaleString() : 'Recent',
              validity: isSuperseded ? `superseded on ${new Date(edge.valid_to).toLocaleDateString()}` : 'still current'
            }
          };
        });

        setEvents(parsed);
      } catch (err) {
        console.warn('Could not load live timeline events:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, []);

  const filteredEvents = events.filter(evt => selectedCategory === 'all' || evt.category === selectedCategory);

  return (
    <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '32px 40px 80px 40px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 4 · THE PAST
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Timeline
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '15px', margin: 0, lineHeight: 1.5 }}>
          The time machine stream. Superseded beliefs remain visible with strikethroughs and links to replacement state nodes.
        </p>
      </header>

      {/* Control Bar: Categories & Zoom Toggle (Section 08 Spec) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid #e7e1d4', paddingBottom: '14px' }}>
        {/* Category Filter Chips */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {['all', 'money', 'people', 'product', 'decisions'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? 'var(--accent, #bf3d11)' : 'var(--paper-2, #f2ede3)',
                color: selectedCategory === cat ? '#ffffff' : 'var(--ink-soft, #3b372f)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Zoom Scale Toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--paper-2, #f2ede3)', padding: '3px', borderRadius: '6px' }}>
          {(['day', 'month'] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => setZoomScale(scale)}
              style={{
                background: zoomScale === scale ? 'var(--card, #fbfaf6)' : 'transparent',
                color: zoomScale === scale ? 'var(--accent, #bf3d11)' : 'var(--ink-faint, #6b6557)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {scale}
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Main Timeline Axis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '16px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border-paper, #e7e1d4)' }} />

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-faint, #6b6557)', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '13px' }}>
              Querying bi-temporal memory graph...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ paddingLeft: '36px' }}>
              <HonestEmptyState
                headline={selectedCategory === 'all' ? "No timeline events recorded yet." : `No events found for ${selectedCategory}.`}
                subtext="Timeline beliefs are extracted automatically from your connected accounts as perception pipelines process commitments and decisions."
                suggestionText="Connect Services in Settings"
                onSuggestionClick={() => router.push('/iris?view=settings')}
              />
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div key={evt.id} style={{ paddingLeft: '36px', position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: '11px',
                  top: '20px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: evt.isSuperseded ? 'var(--ink-faint, #6b6557)' : 'var(--accent, #bf3d11)',
                  border: '2px solid var(--paper, #faf7f1)',
                  boxShadow: evt.isSuperseded ? 'none' : '0 0 8px rgba(191, 61, 17, 0.4)'
                }} />

                {evt.isSuperseded ? (
                  <UnderstandingCard
                    title={evt.title}
                    body={evt.body}
                    kicker={evt.kicker}
                    statusBadge="Superseded"
                    badgeType="slate"
                    timestamp={evt.date}
                    receipt={evt.receipt}
                    style={{ opacity: 0.75, borderStyle: 'dashed' }}
                  >
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #e7e1d4' }}>
                      <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', color: 'var(--ink-faint, #6b6557)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', textDecoration: 'line-through' }}>
                        {evt.supersededText}
                      </span>
                      <div style={{ marginTop: '4px', fontSize: '12px', fontFamily: 'var(--font-inter, sans-serif)', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
                        ↳ Active Replacement: {evt.replacementTitle} →
                      </div>
                    </div>
                  </UnderstandingCard>
                ) : (
                  <UnderstandingCard
                    title={evt.title}
                    body={evt.body}
                    kicker={evt.kicker}
                    statusBadge="Active"
                    badgeType="good"
                    timestamp={evt.date}
                    receipt={evt.receipt}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* RIGHT COLUMN: Time Machine Metrics & Filter Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 14px rgba(60,40,20,0.03)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '1.15rem', fontWeight: 600, color: '#16140f', margin: '0 0 8px 0' }}>
              Time Machine State
            </h3>
            <p style={{ fontSize: '13px', color: '#3b372f', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Bi-temporal memory graph keeps every historical state intact. Struck-through items preserve lineage.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                <span style={{ color: '#6b6557' }}>Active Category:</span>
                <span style={{ color: '#bf3d11', fontWeight: 600 }}>{selectedCategory.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                <span style={{ color: '#6b6557' }}>Scale Mode:</span>
                <span style={{ color: '#2f6b4f', fontWeight: 600 }}>{zoomScale.toUpperCase()} VIEW</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
