'use client';

import React from 'react';
import styles from '../MainContent.module.css';

interface TimelineViewProps {
  onBack: () => void;
}

interface TimelineEvent {
  id: string;
  platform: string;
  title: string;
  content: string;
  timestamp: string;
  author?: string;
  event_type?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TimelineView({ onBack }: TimelineViewProps) {
  const [data, setData] = React.useState<{ year: string; count: number }[]>([]);
  const [events, setEvents] = React.useState<TimelineEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/timeline-stats');
        const json = await response.json();
        if (json.timelineData) {
          setData(json.timelineData);
        }
        if (json.events) {
          setEvents(json.events);
        }
      } catch (err) {
        console.error('Failed to load timeline:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const maxCount = Math.max(...data.map(d => d.count), 100);
  const barWidth = 60;
  const gap = 40;
  const startX = 100;
  const graphHeight = 300;

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <div className={styles.soloView}>
      <h2 className={styles.soloTitle}>TIME LINE</h2>
      
      {loading ? (
        <div className={styles.timelineLoading}>Indexing in progress...</div>
      ) : (
        <>
          <div className={styles.graphContainer}>
            <div className={styles.yAxisLabel}>Items Indexed</div>
            
            <svg viewBox="0 0 1000 350" className={styles.svgGraph}>
               <defs>
                  <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-primary, #e06a3b)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--accent-primary, #e06a3b)" stopOpacity="0.5" />
                  </linearGradient>
               </defs>

               {/* Grid Lines */}
               <line x1="80" y1="20" x2="980" y2="20" stroke="var(--border-subtle, rgba(255,255,255,0.1))" strokeDasharray="4 4" />
               <line x1="80" y1="120" x2="980" y2="120" stroke="var(--border-subtle, rgba(255,255,255,0.1))" strokeDasharray="4 4" />
               <line x1="80" y1="220" x2="980" y2="220" stroke="var(--border-subtle, rgba(255,255,255,0.1))" strokeDasharray="4 4" />

               {/* Y-Axis Scale */}
               <text x="70" y="25" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount)}</text>
               <text x="70" y="125" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount * 0.66)}</text>
               <text x="70" y="225" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount * 0.33)}</text>
               <text x="70" y="325" textAnchor="end" className={styles.axisScaleText}>0</text>

               <line x1="80" y1="20" x2="80" y2="320" stroke="var(--border-primary, rgba(255,255,255,0.2))" strokeWidth="1" />
               <line x1="80" y1="320" x2="980" y2="320" stroke="var(--border-primary, rgba(255,255,255,0.2))" strokeWidth="1" />

               {/* Dynamic Bar Series */}
               {data.map((d, i) => {
                  const h = Math.max((d.count / maxCount) * graphHeight, 8);
                  const xPos = startX + i * (barWidth + gap);
                  return (
                    <React.Fragment key={d.year}>
                      <rect 
                        x={xPos} 
                        y={320 - h} 
                        width={barWidth} 
                        height={h} 
                        rx="4" 
                        fill="url(#barG)" 
                      />
                      <text
                        x={xPos + barWidth / 2}
                        y={340}
                        textAnchor="middle"
                        className={styles.axisScaleText}
                        style={{ fontWeight: 700 }}
                      >
                        {d.year}
                      </text>
                    </React.Fragment>
                  )
               })}
            </svg>
            <div className={styles.xAxisLabel}>Indexing Timeline (Year Volume)</div>
          </div>

          {/* Temporal Event Stream */}
          <div style={{ marginTop: '40px', padding: '0 8px' }}>
            <h3 style={{ fontSize: '1rem', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: '24px', textTransform: 'uppercase' }}>
              ✦ Chronological Activity Feed ({events.length} Events)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '24px', marginLeft: '12px' }}>
              {events.map((ev) => (
                <div key={ev.id} style={{
                  position: 'relative',
                  background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute',
                    left: '-31px',
                    top: '20px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: 'var(--accent-primary, #e06a3b)',
                    boxShadow: '0 0 10px var(--accent-primary, #e06a3b)'
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.08)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        color: 'var(--accent-primary, #e06a3b)'
                      }}>
                        {ev.platform}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : 'Recent'}
                      </span>
                    </div>
                    {ev.event_type && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6, letterSpacing: '0.05em' }}>
                        {ev.event_type}
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary, #fff)', fontWeight: '600' }}>
                    {ev.title}
                  </h4>
                  {ev.content && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #aaa)', lineHeight: '1.4' }}>
                      {ev.content}
                    </p>
                  )}
                  {ev.author && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue, #3b82f6)', fontWeight: '500', marginTop: '4px' }}>
                      By {ev.author}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
