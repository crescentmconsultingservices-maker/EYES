'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from './KnowledgeGraph.module.css';

// ForceGraph3D requires canvas/window so it must be dynamically imported in Next.js
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

export default function KnowledgeGraph({ userId }: { userId?: string }) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);



  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch(`/api/graph${userId ? `?userId=${userId}` : ''}`);
        const data = await res.json();
        if (data.nodes && data.edges) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nodes = data.nodes.map((n: any) => ({
            id: n.id,
            name: n.data.label
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const links = data.edges.map((e: any) => ({
            ...e,
            source: e.source,
            target: e.target,
          }));

          // --- ARTIFICIAL SPRAWLING WEB GENERATOR ---
          // The database has separate disconnected clusters. 
          // To make it look like a sprawling, branching tree (like the repo), we artificially tie them together randomly.
          if (nodes.length > 0) {
            const connectedSet = new Set([nodes[0].id]);
            
            // 1. Tie disconnected clusters to a random node in the connected set to branch outwards
            data.edges.forEach((e: any) => {
              if (!connectedSet.has(e.source) && !connectedSet.has(e.target)) {
                const connectedArray = Array.from(connectedSet);
                const randomTarget = connectedArray[Math.floor(Math.random() * connectedArray.length)];
                links.push({ source: e.source, target: randomTarget });
                connectedSet.add(e.source);
                connectedSet.add(e.target);
              } else {
                connectedSet.add(e.source);
                connectedSet.add(e.target);
              }
            });

            // 2. Tie any completely isolated floating nodes to a random node in the connected set
            nodes.forEach((n: any, i: number) => {
              const hasAnyLink = links.some((l: any) => l.source === n.id || l.target === n.id);
              if (!hasAnyLink && i > 0) {
                const connectedArray = Array.from(connectedSet);
                const randomTarget = connectedArray[Math.floor(Math.random() * connectedArray.length)];
                links.push({ source: n.id, target: randomTarget });
                connectedSet.add(n.id);
              }
            });
          }

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




  if (loading) {
    return <div className={styles.loadingContainer}>Booting Neural Orbit...</div>;
  }

  return (
    <div className={styles.graphWrapper}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="name"
      />
    </div>
  );
}
