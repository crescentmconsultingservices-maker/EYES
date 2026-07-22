'use client';

import React from 'react';

interface EmbeddedTabProps {
  appType: 'knowledge-graph' | 'data-grid' | 'document-viewer';
  data: any;
}

export default function EmbeddedTab({ appType, data }: EmbeddedTabProps) {
  
  if (appType === 'knowledge-graph') {
    return (
      <div style={{ background: '#0a0a0c', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h4 style={{ margin: 0, color: '#e2e8f0', fontSize: '14px' }}>Network Visualization</h4>
          <span style={{ color: '#38bdf8', fontSize: '12px', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>Interactive</span>
        </div>
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #334155', borderRadius: '8px' }}>
          <p style={{ color: '#64748b', fontSize: '14px' }}>[ Interactive WebGL Graph Canvas: {data.nodes} nodes, {data.edges} edges ]</p>
        </div>
      </div>
    );
  }

  if (appType === 'data-grid') {
    return (
      <div style={{ background: '#0a0a0c', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#e2e8f0', fontSize: '14px' }}>Tabular Data View</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Metric</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {(data.rows || []).map((row: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                <td style={{ padding: '8px' }}>{row.date}</td>
                <td style={{ padding: '8px' }}>{row.metric}</td>
                <td style={{ textAlign: 'right', padding: '8px', color: '#10b981' }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
      <p style={{ margin: 0, color: '#94a3b8' }}>Unknown Embedded App Type</p>
    </div>
  );
}
