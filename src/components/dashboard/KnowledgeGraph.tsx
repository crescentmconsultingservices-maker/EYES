'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from './KnowledgeGraph.module.css';

// ForceGraph3D requires canvas/window so it must be dynamically imported in Next.js
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

export default function KnowledgeGraph({ userId, width, height }: { userId?: string, width?: number, height?: number }) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
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




  const handleNodeClick = useCallback((node: any) => {
    if (selectedNode === node) {
      // Toggle off
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      setSelectedNode(null);
      return;
    }

    const newHighlightNodes = new Set();
    const newHighlightLinks = new Set();
    newHighlightNodes.add(node);

    // 1st degree connections
    graphData.links.forEach(link => {
      const s = link.source;
      const t = link.target;
      if (s.id === node.id || t.id === node.id) {
        newHighlightLinks.add(link);
        newHighlightNodes.add(s);
        newHighlightNodes.add(t);
      }
    });

    // 2nd degree connections
    const firstDegreeNodes = Array.from(newHighlightNodes);
    graphData.links.forEach(link => {
      const s = link.source;
      const t = link.target;
      if (firstDegreeNodes.includes(s) || firstDegreeNodes.includes(t)) {
        newHighlightLinks.add(link);
        newHighlightNodes.add(s);
        newHighlightNodes.add(t);
      }
    });

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
    setSelectedNode(node);

    // Aim camera at node
    if (fgRef.current) {
      const distance = 100;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        3000
      );
    }
  }, [selectedNode, graphData.links]);

  if (loading) {
    return <div className={styles.loadingContainer} style={{ height: height || '100vh' }}>Booting Neural Orbit...</div>;
  }

  return (
    <div className={styles.graphWrapper} style={height ? { height: `${height}px` } : {}}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="" 
        nodeColor={(node: any) => {
          if (highlightNodes.size === 0) return 'rgba(224, 106, 59, 0.8)'; // Default Ember
          return highlightNodes.has(node) ? (node === selectedNode ? 'rgba(255, 255, 255, 1)' : 'rgba(224, 106, 59, 0.9)') : 'rgba(224, 106, 59, 0.1)';
        }}
        linkColor={(link: any) => {
          if (highlightLinks.size === 0) return 'rgba(255,255,255,0.2)';
          return highlightLinks.has(link) ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255,255,255,0.02)';
        }}
        linkWidth={(link: any) => highlightLinks.has(link) ? 2 : 1}
        nodeThreeObjectExtend={true}
        nodeThreeObject={(node: any) => {
          // Dynamic import inside the render loop for SSR safety
          const SpriteText = require('three-spritetext').default;
          const sprite = new SpriteText(node.name || '');
          
          // Apply highlight fading to text as well
          if (highlightNodes.size === 0) {
            sprite.color = 'lightgrey';
          } else {
            sprite.color = highlightNodes.has(node) ? (node === selectedNode ? '#ffffff' : '#38bdf8') : 'rgba(200,200,200,0.1)';
          }
          
          sprite.textHeight = node === selectedNode ? 6 : 4;
          sprite.position.y = 8;
          return sprite;
        }}
        onNodeClick={handleNodeClick}
        width={width}
        height={height}
      />
    </div>
  );
}
