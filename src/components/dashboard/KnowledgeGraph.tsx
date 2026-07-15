'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from './KnowledgeGraph.module.css';

// ForceGraph2D requires canvas/window so it must be dynamically imported in Next.js
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export default function KnowledgeGraph({ userId }: { userId?: string }) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const initialCenterRef = useRef(false);

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
          
          // Artificially link all floating nodes back to the User so the graph stays connected (but invisible)
          const userNodeId = 'User';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.nodes.forEach((n: any) => {
            if (n.id !== userNodeId) {
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               const hasLink = links.some((l: any) => 
                  (l.source === n.id && l.target === userNodeId) || 
                  (l.target === n.id && l.source === userNodeId)
               );
               if (!hasLink) {
                 links.push({
                   source: n.id,
                   target: userNodeId,
                   label: 'belongs_to',
                   val: 0.5,
                   color: 'rgba(0, 0, 0, 0)', // Completely transparent so it doesn't clutter the UI
                   data: {
                     evidence: 'Implicit contextual ownership.',
                     confidence: 1.0
                   }
                 });
               }
            }
          });
          
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

  // Force the physics engine to spread the nodes apart physically
  useEffect(() => {
    if (fgRef.current && !loading && graphData.nodes.length > 0) {
      // Strong repulsion to prevent text overlap
      fgRef.current.d3Force('charge').strength(-300);
      // Longer minimum distance for all links
      fgRef.current.d3Force('link').distance(100);
      fgRef.current.d3ReheatSimulation();
    }
  }, [loading, graphData]);

  
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
    let textColor = '#111827';
    if (typeof window !== 'undefined') {
       textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#111827';
    }
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
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
        backgroundColor="rgba(0,0,0,0)"
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
        d3VelocityDecay={0.3}
        onEngineStop={() => {
          if (fgRef.current && !initialCenterRef.current) {
            initialCenterRef.current = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userNode = graphData.nodes.find((n: any) => n.id === 'User');
            if (userNode) {
              fgRef.current.centerAt(userNode.x, userNode.y, 1000);
              fgRef.current.zoom(4, 1000); // Increased zoom so it's readable like the second screenshot
            } else {
              fgRef.current.zoomToFit(1000, 150);
            }
          }
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
