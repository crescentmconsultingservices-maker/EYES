'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  MarkerType,
  type Node,
  type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import styles from './KnowledgeGraph.module.css';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      style: {
        background: '#0D0D12', // Match EYES dark theme
        color: '#E0E0E0',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '10px',
        fontSize: '14px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      }
    };

    if (newNode.id === 'User') {
      newNode.style.border = '1px solid #4F46E5'; // Highlight the user node
      newNode.style.background = '#1E1B4B';
    }

    return newNode;
  });

  return { nodes: newNodes, edges };
};

export default function KnowledgeGraph({ userId }: { userId?: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredEdge, setHoveredEdge] = useState<any>(null);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch(`/api/graph${userId ? `?userId=${userId}` : ''}`);
        const data = await res.json();
        if (data.nodes && data.edges) {
          // Style edges based on type
          const styledEdges = data.edges.map((e: any) => {
            const isCommitment = e.label === 'commitment';
            const isDelay = e.label === 'delayed_on';
            return {
              ...e,
              animated: isCommitment, // Add moving particle effect for active commitments
              style: { 
                stroke: isCommitment ? '#34D399' : isDelay ? '#EF4444' : '#6B7280', 
                strokeWidth: 2,
                strokeDasharray: e.label === 'decided_against' ? '5,5' : '0'
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isCommitment ? '#34D399' : isDelay ? '#EF4444' : '#6B7280',
              },
            };
          });

          const layouted = getLayoutedElements(data.nodes, styledEdges, 'LR');
          setNodes(layouted.nodes);
          setEdges(layouted.edges);
        }
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchGraph();
  }, [userId]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, type: ConnectionLineType.SmoothStep, animated: true }, eds)),
    []
  );

  const onEdgeMouseEnter = (event: React.MouseEvent, edge: any) => {
    setHoveredEdge(edge);
  };

  const onEdgeMouseLeave = () => {
    setHoveredEdge(null);
  };

  if (loading) {
    return <div className={styles.loadingContainer}>Loading Memory Graph...</div>;
  }

  return (
    <div className={styles.graphWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        className={styles.reactFlow}
      >
        <Background color="#222" gap={16} />
        <Controls style={{ background: '#111', fill: '#fff', border: '1px solid #333' }} />
      </ReactFlow>

      {/* Hover Tooltip for Edges to show the 'receipt' */}
      {hoveredEdge && hoveredEdge.data?.evidence && (
        <div className={styles.edgeTooltip}>
          <div className={styles.tooltipLabel}>{hoveredEdge.label.toUpperCase()}</div>
          <div className={styles.tooltipEvidence}>"{hoveredEdge.data.evidence}"</div>
          <div className={styles.tooltipConfidence}>Confidence: {(hoveredEdge.data.confidence * 100).toFixed(1)}%</div>
        </div>
      )}
    </div>
  );
}
