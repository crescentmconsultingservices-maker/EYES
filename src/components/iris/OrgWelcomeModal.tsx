'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface OrgWelcomeModalProps {
  isOpen: boolean;
  orgName: string;
  userName?: string;
  role?: string;
  onClose: () => void;
  onAskPriorities: () => void;
}

export default function OrgWelcomeModal({
  isOpen,
  orgName,
  userName,
  role = 'member',
  onClose,
  onAskPriorities,
}: OrgWelcomeModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const displayName = userName || 'Team Member';
  const displayRole = role.toUpperCase();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(5, 5, 8, 0.78)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        background: '#121216',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        maxWidth: '680px',
        width: '100%',
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)',
        overflow: 'hidden',
        color: '#f4f4f5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
      }}>
        {/* Ambient Top Glow */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '320px',
          height: '140px',
          background: 'radial-gradient(ellipse at top, rgba(99, 102, 241, 0.35) 0%, rgba(99, 102, 241, 0) 70%)',
          pointerEvents: 'none',
        }} />

        {/* Modal Header */}
        <div style={{ padding: '32px 36px 20px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                IRIS Cognitive Briefing
              </span>
              <span style={{
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
              }}>
                ROLE: {displayRole}
              </span>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#71717a',
                fontSize: '22px',
                lineHeight: '1',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#71717a')}
            >
              ×
            </button>
          </div>

          <h2 style={{
            fontSize: '26px',
            fontWeight: 700,
            margin: '0 0 6px 0',
            color: '#ffffff',
            letterSpacing: '-0.02em',
          }}>
            Welcome to {orgName}
          </h2>
          <p style={{ fontSize: '14px', color: '#a1a1aa', margin: 0 }}>
            Greetings, <strong>{displayName}</strong>. You are now connected to your company&apos;s collective memory pool.
          </p>
        </div>

        {/* IRIS Executive Speech Bubble */}
        <div style={{ padding: '0 36px', marginBottom: '24px' }}>
          <div style={{
            background: 'rgba(99, 102, 241, 0.06)',
            borderLeft: '4px solid #6366f1',
            borderRadius: '0 12px 12px 0',
            padding: '16px 20px',
            fontSize: '13.5px',
            lineHeight: 1.6,
            color: '#e4e4e7',
          }}>
            &ldquo;I am <strong>IRIS</strong>, your organization&apos;s executive intelligence companion. I synthesize meeting notes, cross-platform communications, and project roadmaps into a continuous knowledge graph so our team never loses context.&rdquo;
          </div>
        </div>

        {/* 3 Pillar Feature Highlights */}
        <div style={{
          padding: '0 36px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '28px',
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '12px',
            padding: '14px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
              Collective Knowledge
            </div>
            <div style={{ fontSize: '11.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
              Query organizational decisions, commitments, and roadmaps in real-time.
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '12px',
            padding: '14px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80', marginBottom: '4px' }}>
              Edge Privacy Shield
            </div>
            <div style={{ fontSize: '11.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
              Personal credentials and private records are filtered at the edge and never shared.
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '12px',
            padding: '14px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', marginBottom: '4px' }}>
              Cognitive Synthesis
            </div>
            <div style={{ fontSize: '11.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
              Automatic contradiction alerts and task dependencies across departments.
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div style={{
          padding: '20px 36px 28px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Explore Workstation Directly
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                onClose();
                router.push('/integrations');
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Connect Work Accounts
            </button>

            <button
              onClick={onAskPriorities}
              style={{
                background: 'var(--accent-primary, #6366f1)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              Ask IRIS Team Priorities →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
