'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Connector {
  id: string;
  name: string;
  description: string;
  iconColor: string;
}

const LIVE_CONNECTORS: Connector[] = [
  { id: 'google', name: 'Google Workspace', description: 'OAuth — full inbox, calendar, and drive indexing.', iconColor: '#EA4335' },
  { id: 'github', name: 'GitHub', description: 'OAuth — commits, PRs, and issues indexing.', iconColor: '#333' },
  { id: 'slack', name: 'Slack', description: 'OAuth — channel history indexing per workspace.', iconColor: '#E01E5A' },
  { id: 'notion', name: 'Notion', description: 'OAuth — pages, databases, and tasks indexing.', iconColor: '#000' },
  { id: 'discord', name: 'Discord', description: 'OAuth — server messages indexing.', iconColor: '#5865F2' },
];

export default function IntegrationsHubPage() {
  const router = useRouter();
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/connect/list');
      if (res.ok) {
        const data = await res.json();
        setConnectedPlatforms(data.connectedPlatforms || []);
      }
    } catch (e) {
      console.error('Failed to fetch connections');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = (id: string) => {
    setActionLoading(id);
    window.location.href = `/api/connect/${id}/start`;
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm(`Are you sure you want to disconnect ${id}? This will revoke access immediately.`)) return;
    
    setActionLoading(id);
    try {
      const res = await fetch(`/api/connect/revoke?platform=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConnectedPlatforms(prev => prev.filter(p => p !== id));
      } else {
        alert('Failed to disconnect. Please try again.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <main style={{
      maxWidth: '820px',
      margin: '0 auto',
      padding: '60px 24px',
      fontFamily: "'DM Sans', sans-serif",
      color: '#fff',
      lineHeight: 1.7,
      minHeight: '100vh',
    }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '8px', letterSpacing: '-0.02em' }}>Integrations Hub</h1>
      <p style={{ color: '#888', marginBottom: '48px', fontSize: '1.1rem' }}>
        Connect your external tools to securely pipe data into your EYES vault using AES-256-GCM encryption.
      </p>

      {isLoading ? (
        <div style={{ color: '#888' }}>Loading active connections...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {LIVE_CONNECTORS.map((connector) => {
            const isConnected = connectedPlatforms.includes(connector.id);
            const isActioning = actionLoading === connector.id;

            return (
              <div key={connector.id} style={{
                background: '#111',
                border: '1px solid #222',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: isConnected ? '0 0 20px rgba(34, 197, 94, 0.05)' : 'none',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: connector.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', color: '#fff' }}>
                        {connector.name.charAt(0)}
                      </div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{connector.name}</h3>
                    </div>
                    {isConnected && (
                      <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>
                        Connected
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.5 }}>
                    {connector.description}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(connector.id)}
                      disabled={isActioning}
                      style={{
                        background: 'transparent',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: isActioning ? 'not-allowed' : 'pointer',
                        opacity: isActioning ? 0.7 : 1,
                      }}
                    >
                      {isActioning ? 'Revoking...' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(connector.id)}
                      disabled={isActioning}
                      style={{
                        background: '#fff',
                        border: 'none',
                        color: '#000',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: isActioning ? 'not-allowed' : 'pointer',
                        opacity: isActioning ? 0.7 : 1,
                      }}
                    >
                      {isActioning ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '64px', paddingTop: '24px', borderTop: '1px solid #222' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>Import Offline Data</h2>
        <p style={{ color: '#888', fontSize: '0.95rem', marginBottom: '16px' }}>
          For platforms without live APIs (like ChatGPT and Claude), you can export your history manually and import it into your Vault.
        </p>
        <button
          onClick={() => alert('Vault Import UI coming soon!')}
          style={{ background: '#222', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          Open Vault Importer
        </button>
      </div>
    </main>
  );
}
