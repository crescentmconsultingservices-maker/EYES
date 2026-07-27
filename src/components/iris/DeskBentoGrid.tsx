'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DeskBentoGrid() {
  const { user } = useAuth();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(35);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const stopAllAudio = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.3);
      setTimeout(() => {
        oscillatorsRef.current.forEach(osc => {
          try { osc.stop(); } catch {}
        });
        oscillatorsRef.current = [];
        setIsPlayingAudio(false);
        setPlaybackProgress(0);
      }, 300);
    } else {
      setIsPlayingAudio(false);
      setPlaybackProgress(0);
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
  };

  const restartAudio = () => {
    stopAllAudio();
    setPlaybackProgress(0);
    setTimeout(() => {
      toggleAmbientSound();
    }, 150);
  };

  const toggleAmbientSound = () => {
    if (isPlayingAudio) {
      stopAllAudio();
    } else {
      setIsPlayingAudio(true);

      // Start progress simulation
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      progressTimerRef.current = setInterval(() => {
        setPlaybackProgress(prev => (prev >= 100 ? 0 : prev + 1.5));
      }, 500);

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioCtxRef.current = ctx;
          if (ctx.state === 'suspended') ctx.resume();

          const masterGain = ctx.createGain();
          masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
          masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.8);
          gainNodeRef.current = masterGain;

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, ctx.currentTime);

          masterGain.connect(filter);
          filter.connect(ctx.destination);

          const freqs = [220.00, 329.63, 440.00, 554.37];
          const newOscillators: OscillatorNode[] = [];

          freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.setValueAtTime(0.12 + idx * 0.04, ctx.currentTime);
            lfoGain.gain.setValueAtTime(1.5, ctx.currentTime);
            lfo.connect(osc.frequency);
            lfo.start();

            oscGain.gain.setValueAtTime(0.18 / freqs.length, ctx.currentTime);
            osc.connect(oscGain);
            oscGain.connect(masterGain);

            osc.start();
            newOscillators.push(osc);
          });

          oscillatorsRef.current = newOscillators;
        }
      } catch (err) {
        console.warn('Ambient pad error:', err);
      }

      if (synthRef.current) {
        try {
          if (synthRef.current.paused) synthRef.current.resume();
          synthRef.current.cancel();

          const userName = user?.name ? user.name.split(' ')[0] : (user?.email ? user.email.split('@')[0] : 'Founder');
          const briefText = `Good morning, ${userName}. Here is your IRIS morning brief. What needs doing now: Priority 1, Finalize Series B Pitch Deck. Priority 2, VP of Engineering interviews. Priority 3, Q4 Product Roadmap Alignment. Overnight synthesis pass notes 3 items updated. Ambient pad active.`;

          const utterance = new SpeechSynthesisUtterance(briefText);
          utterance.rate = 0.95;
          utterance.pitch = 1.0;

          const voices = synthRef.current.getVoices();
          const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen')));
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }

          utterance.onend = () => stopAllAudio();
          utterance.onerror = () => stopAllAudio();

          synthRef.current.speak(utterance);
        } catch (err) {
          console.warn('Speech synthesis error:', err);
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  const barHeights = [22, 45, 68, 35, 80, 52, 90, 42, 75, 30, 95, 60, 40, 85, 48, 70, 32, 88, 55, 38, 25];

  // Mock data for Widgets strictly adhering to IRIS UI Specification (§05 - Surface 1)
  const nowPriorities = [
    { id: 1, title: 'Finalize Series B Pitch Deck', sub: 'Updated with Q3 revenue growth metrics & burn rate analysis', tag: 'HIGH PRIORITY', tagBg: '#fef3c7', tagColor: '#7a2a0e' },
    { id: 2, title: 'VP of Engineering Candidate Interview', sub: 'Final round technical leadership review scheduled for 15:00', tag: 'DUE SOON', tagBg: '#fef3c7', tagColor: '#7a2a0e' },
    { id: 3, title: 'Q4 Product Roadmap Alignment', sub: 'Scope locking with engineering leads on IRIS voice duplex engine', tag: 'STRATEGIC', tagBg: '#f0d9cd', tagColor: '#7a2a0e' },
  ];

  const changedOvernight = [
    { id: 1, title: 'Revenue Leak Scan completed', sub: '3 potential churn risks identified ($14.2k MRR at risk)', time: '04:12' },
    { id: 2, title: 'GitHub Commit Velocity +24%', sub: '7 core features merged to production main branch', time: '02:45' },
    { id: 3, title: 'Security Compliance Audit Pass', sub: 'SOC2 readiness score upgraded to 94%', time: '01:30' },
  ];

  const slippingItems = [
    { id: 1, title: 'SaaS Contract Renewal Review', delayNote: "hasn't moved since the 11th — still current?", time: '3 days stagnant' },
    { id: 2, title: 'SOC2 Vendor Evidence Upload', delayNote: "delayed on vendor response — check in required?", time: '5 days stagnant' },
  ];

  const todayTimeline = [
    { time: '08:30', label: 'Synthesis pass completed', status: 'verified' },
    { time: '10:00', label: 'Executive Standup & Roadmap', status: 'current' },
    { time: '12:15', label: 'Series B Deck Update', status: 'pending' },
    { time: '15:00', label: 'VP Eng Candidate Interview', status: 'pending' },
    { time: '17:30', label: 'Engineering Sync', status: 'pending' },
  ];

  const userName = user?.name ? user.name.split(' ')[0] : (user?.email ? user.email.split('@')[0] : 'Founder');

  return (
    <div style={{
      padding: '32px 40px',
      background: 'var(--bg-primary)',
      minHeight: '100vh',
      color: 'var(--text-primary)',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      {/* Import Google Fonts for Fraunces, Inter, and JetBrains Mono */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        
        .fraunces-title {
          font-family: 'Fraunces', serif;
        }
        .mono-text {
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.16em;
        }
        .claim-hover {
          transition: all 0.2s ease;
          border-bottom: 1px dashed transparent;
        }
        .claim-hover:hover {
          border-bottom: 1px solid var(--accent);
          color: var(--accent);
          cursor: pointer;
        }
        @keyframes soundwaveMotion {
          0% { transform: scaleY(0.35); opacity: 0.6; }
          50% { transform: scaleY(1.35); opacity: 1; }
          100% { transform: scaleY(0.4); opacity: 0.7; }
        }
        @keyframes liveDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 139, 122, 0.4); }
          50% { opacity: 0.6; transform: scale(1.1); box-shadow: 0 0 0 6px rgba(46, 139, 122, 0); }
        }
      `}</style>

      {/* --- HERO GREETING BLOCK (PDF §05: Top-left largest block) --- */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: '16px',
        padding: '32px 36px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: 'var(--live, #2e8b7a)',
              display: 'inline-block',
              animation: 'liveDotPulse 2s ease-in-out infinite'
            }} />
            <span className="mono-text" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
              DESK · STATE OF NOW
            </span>
          </div>

          {/* Fraunces Display Greeting */}
          <h1 className="fraunces-title" style={{ fontSize: '2.4rem', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 8px 0', lineHeight: 1.1 }}>
            Good morning, {userName}.
          </h1>

          {/* JetBrains Mono sub-line */}
          <p className="mono-text" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase' }}>
            Tuesday · while you slept, understanding kept moving
          </p>
        </div>

        {/* ONE EMOTIONAL BEAT */}
        <div style={{
          background: 'var(--accent-soft)',
          borderLeft: '3px solid var(--accent)',
          padding: '12px 18px',
          borderRadius: '0 8px 8px 0'
        }}>
          <p className="fraunces-title" style={{ fontStyle: 'italic', fontSize: '1.05rem', color: 'var(--accent)', margin: 0, fontWeight: 500 }}>
            “The company is an organic system; every decision leaves a trace.”
          </p>
        </div>
      </div>

      {/* --- NOW-STRIP WIDGET --- */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: '14px',
        padding: '16px 24px',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        overflowX: 'auto'
      }}>
        <div className="mono-text" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>TODAY STRIP</span>
          <span style={{ color: 'var(--border-primary)' }}>│</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flex: 1 }}>
          {todayTimeline.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
              <span className="mono-text" style={{ fontSize: '11px', fontWeight: 700, color: item.status === 'verified' ? 'var(--good, #2f6b4f)' : item.status === 'current' ? 'var(--accent)' : 'var(--text-muted)' }}>
                {item.time}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: item.status === 'current' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {item.label}
              </span>
              {idx < todayTimeline.length - 1 && (
                <span style={{ color: 'var(--border-primary)', marginLeft: '16px' }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* --- MAIN 2-COLUMN DUAL DASHBOARD GRID --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '28px', alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* WIDGET 1: WHAT NEEDS DOING NOW */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
                <h2 className="fraunces-title" style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  What needs doing now
                </h2>
              </div>
              <span className="mono-text" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                TOP 3 PRIORITIES
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {nowPriorities.map(p => (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div>
                    <h3 className="claim-hover" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                      {p.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                      {p.sub}
                    </p>
                  </div>

                  <span className="mono-text" style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase'
                  }}>
                    {p.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* DUAL WIDGET ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            {/* WIDGET 2: CHANGED OVERNIGHT */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="fraunces-title" style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Changed overnight
                </h3>
                <span className="mono-text" style={{ fontSize: '9px', color: 'var(--good, #2f6b4f)', textTransform: 'uppercase', fontWeight: 700 }}>
                  SYNTHESIS PASS
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {changedOvernight.map(item => (
                  <div key={item.id} style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-primary)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="claim-hover" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      <span className="mono-text" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                        {item.time}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.35 }}>
                      {item.sub}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* WIDGET 3: SLIPPING */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="fraunces-title" style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Slipping
                </h3>
                <span className="mono-text" style={{ fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700 }}>
                  CHECK-IN TONE
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {slippingItems.map(item => (
                  <div key={item.id} style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-primary)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="claim-hover" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      <span className="mono-text" style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 600 }}>
                        {item.time}
                      </span>
                    </div>
                    <p className="fraunces-title" style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--accent)', margin: 0, lineHeight: 1.35 }}>
                      "{item.delayNote}"
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: WIDGET 5 - AMBIENT AUDIO BRIEF PLAYER */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
          borderRadius: '16px',
          padding: '28px 24px',
          boxShadow: 'var(--shadow-sm)',
          position: 'sticky',
          top: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPlayingAudio ? 'var(--accent)' : 'var(--text-muted)' }} />
              <h2 className="fraunces-title" style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Ambient Brief & Pad
              </h2>
            </div>
            <span className="mono-text" style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 700 }}>
              KOKORO-82M
            </span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.45 }}>
            Synthesized morning executive briefing paired with low-pass ambient background pad.
          </p>

          {/* DYNAMIC SOUNDWAVE EQUALIZER */}
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '12px',
            padding: '20px 16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '60px', marginBottom: '16px' }}>
              {barHeights.map((h, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    width: '3.5px', 
                    height: `${h}px`, 
                    background: isPlayingAudio ? 'var(--accent)' : 'var(--text-primary)', 
                    borderRadius: '2px',
                    transformOrigin: 'bottom',
                    animationName: isPlayingAudio ? 'soundwaveMotion' : 'none',
                    animationDuration: `${0.5 + (idx % 4) * 0.15}s`,
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite',
                    animationDirection: 'alternate',
                    animationDelay: `${(idx % 6) * 0.1}s`,
                    transition: 'background 0.3s ease, height 0.3s ease'
                  }} 
                />
              ))}
            </div>

            {/* Audio Track Timeline Bar */}
            <div 
              onClick={restartAudio}
              style={{ position: 'relative', width: '100%', height: '6px', background: 'var(--border-primary)', borderRadius: '3px', overflow: 'hidden', cursor: 'pointer' }}
              title="Click to Restart Brief"
            >
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${playbackProgress}%`,
                background: 'var(--accent)',
                transition: 'width 0.3s linear'
              }} />
            </div>
          </div>

          {/* Audio Player Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
            {/* Replay Button */}
            <button
              type="button"
              onClick={restartAudio}
              style={{
                background: 'var(--bg-card-hover)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s ease'
              }}
              title="Replay Brief from Start"
            >
              ↺
            </button>

            {/* Play / Pause Button */}
            <button
              type="button"
              onClick={toggleAmbientSound}
              style={{
                background: isPlayingAudio ? 'var(--accent)' : 'var(--text-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                boxShadow: isPlayingAudio ? '0 0 18px rgba(191, 61, 17, 0.35)' : 'var(--shadow-sm)',
                transition: 'all 0.2s ease'
              }}
              title={isPlayingAudio ? 'Pause Brief' : 'Play Brief'}
            >
              {isPlayingAudio ? '❚❚' : '▶'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
