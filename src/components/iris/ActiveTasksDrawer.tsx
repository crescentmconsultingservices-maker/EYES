'use client';

import React, { useState, useEffect } from 'react';

// In a real implementation, this would fetch from a custom Next.js API route
// that queries the Inngest REST API for running tasks for the current user.
// For Step E demonstration, we provide a manual trigger and mock list.

export default function ActiveTasksDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/actions/queue')
        .then(res => res.ok ? res.json() : { items: [] })
        .then(data => {
          const formatted = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.title || item.action || 'Pending Action',
            status: item.status || 'waiting_for_approval',
            data: { context: item.context }
          }));
          setTasks(formatted);
        })
        .catch(() => setTasks([]));
    }
  }, [isOpen]);

  const handleApprove = async (taskId: string) => {
    try {
      // Send the approval event back to Inngest
      const res = await fetch('/api/inngest/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, approved: true })
      });
      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== taskId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (taskId: string) => {
    try {
      const res = await fetch('/api/inngest/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, approved: false })
      });
      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== taskId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '350px',
      background: 'rgba(15, 15, 20, 0.98)', borderLeft: '1px solid rgba(255,255,255,0.1)',
      zIndex: 1000, display: 'flex', flexDirection: 'column',
      padding: '24px', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', color: '#e2e8f0', margin: 0, fontWeight: 600 }}>Active Cloud Tasks</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>No active background tasks.</p>
        ) : (
          tasks.map(task => (
            <div key={task.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#f8fafc' }}>{task.name}</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#cbd5e1' }}>Status: {task.status.replace('_', ' ')}</p>
              
              {task.status === 'waiting_for_approval' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleApprove(task.id)} style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                    Approve
                  </button>
                  <button onClick={() => handleReject(task.id)} style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '24px' }}>
        <button 
          onClick={async () => {
            await fetch('/api/inngest/trigger', { method: 'POST' });
          }}
          style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
        >
          Test: Dispatch Churn Investigation Task
        </button>
      </div>
    </div>
  );
}
