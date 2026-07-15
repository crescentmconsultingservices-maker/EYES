'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from './KnowledgeGraph.module.css';

// ForceGraph2D requires canvas/window so it must be dynamically imported in Next.js
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export default function KnowledgeGraph({ userId }: { userId?: string }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch(`/api/graph${userId ? `?userId=${userId}` : ''}`);
        const data = await res.json();
        if (data.nodes && data.edges) {
          // React-Force-Graph expects 'links' array instead of 'edges'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const links = data.edges.map((e: any) => ({
            ...e,
            source: e.source,
            target: e.target,
            val: e.label === 'commitment' ? 2 : 1, // line thickness weight
            color: e.label === 'commitment' ? '#34D399' : e.label === 'delayed_on' ? '#EF4444' : '#6B7280'
          }));
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nodes = data.nodes.map((n: any) => ({
            id: n.id,
            name: n.data.label,
            val: n.id === 'User' ? 12 : 5, // User is big, memory nodes are small
            color: n.id === 'User' ? '#4F46E5' : '#2D2D3A'
          }));
          
          setGraphData({ nodes, links });
        }
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchGraph();
  }, [userId]);
  
  // Custom Canvas Rendering for Nodes (Beautiful Glassmorphic Circles + Text)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCanvasObject = useCallback((node: any, ctx: any, globalScale: any) => {
    const label = node.name;
    const fontSize = node.id === 'User' ? 14 / globalScale : 11 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    
    // Draw Node Circle
    const radius = node.val;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.lineWidth = 1 / globalScale;
    ctx.strokeStyle = node.id === 'User' ? '#818CF8' : '#4B5563';
    ctx.stroke();

    // Draw Text Label hovering below the node
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(label, node.x, node.y + radius + (8 / globalScale));
  }, []);

  if (loading) {
    return <div className={styles.loadingContainer}>Booting Neural Orbit...</div>;
  }

  return (
    <div className={styles.graphWrapper}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#050505"
        nodeCanvasObject={nodeCanvasObject}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkColor={(link: any) => link.color}
        linkWidth={1.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        // Floating particles traveling along the glowing green commitment edges
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkDirectionalParticles={(link: any) => link.label === 'commitment' ? 3 : 0}
        linkDirectionalParticleSpeed={0.005}
        d3VelocityDecay={0.4}
        onEngineStop={() => {
            // Zoom to fit the graph organically once physics layout settles
            if (fgRef.current) fgRef.current.zoomToFit(400, 50);
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onNodeClick={(node: any) => {
          // Center camera gracefully on clicked node
          if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 1000);
            fgRef.current.zoom(4, 2000);
          }
        }}
        // Native tooltip for hovering over lines to see the receipt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkLabel={(link: any) => `
          <div style="background: rgba(10, 10, 15, 0.95); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="color: #888; font-size: 10px; margin-bottom: 6px;">${link.label.toUpperCase()}</div>
            <div style="color: #E2E8F0; font-style: italic; max-width: 300px; white-space: normal;">"${link.data.evidence}"</div>
            <div style="color: #34D399; margin-top: 6px; font-size: 10px;">Confidence: ${(link.data.confidence * 100).toFixed(1)}%</div>
          </div>
        `}
      />
    </div>
  );
}
