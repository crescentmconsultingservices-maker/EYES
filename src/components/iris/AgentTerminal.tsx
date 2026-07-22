'use client';

import React, { useEffect, useState, useRef } from 'react';

interface AgentTerminalProps {
  task: string;
}

export default function AgentTerminal({ task }: AgentTerminalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isDone, setIsDone] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([]);
    setIsDone(false);

    const eventSource = new EventSource(`/api/iris/agent-stream?task=${encodeURIComponent(task)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          setLogs(prev => [...prev, data.text]);
        }
      } catch (e) {
        console.error('Error parsing SSE data', e);
      }
    };

    eventSource.addEventListener('done', () => {
      setIsDone(true);
      eventSource.close();
    });

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [task]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{
      background: '#0a0a0c',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '16px',
      fontFamily: '"Fira Code", monospace',
      fontSize: '12px',
      color: '#a3e635',
      height: '250px',
      overflowY: 'auto',
      boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
    }}>
      <div style={{ marginBottom: '12px', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        MCP Agent Orchestrator
      </div>
      
      {logs.map((log, i) => (
        <div key={i} style={{ 
          marginBottom: '4px', 
          color: log.includes('[WARN]') ? '#fbbf24' : log.includes('[SUCCESS]') ? '#34d399' : '#a3e635' 
        }}>
          {log}
        </div>
      ))}
      
      {!isDone && (
        <div style={{ animation: 'pulse 1s infinite alternate', opacity: 0.7, marginTop: '8px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '16px', background: '#a3e635' }}></span>
        </div>
      )}

      {isDone && (
        <div style={{ marginTop: '16px', color: '#94a3b8' }}>
          -- Connection Closed --
        </div>
      )}
      <div ref={terminalEndRef} />
    </div>
  );
}
