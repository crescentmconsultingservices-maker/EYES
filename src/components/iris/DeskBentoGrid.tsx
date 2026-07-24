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
      }, 300);
    } else {
      setIsPlayingAudio(false);
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
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
      background: '#faf7f1', // --paper base from PDF §01
      minHeight: '100vh',
      color: '#16140f', // --ink primary text
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
          border-bottom: 1px solid #bf3d11;
          color: #bf3d11;
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
        background: '#fbfaf6', // --card (warm white)
        border: '1px solid #e7e1d4',
        borderRadius: '16px',
        padding: '32px 36px',
        marginBottom: '24px',
        boxShadow: '0 2px 20px rgba(60, 40, 20, 0.04)',
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
              background: '#2e8b7a', // --live (muted teal)
              display: 'inline-block',
              animation: 'liveDotPulse 2s ease-in-out infinite'
            }} />
            <span className="mono-text" style={{ fontSize: '11px', fontWeight: 600, color: '#7a2a0e', textTransform: 'uppercase' }}>
              DESK · STATE OF NOW
            </span>
          </div>

          {/* Fraunces Display Greeting */}
          <h1 className="fraunces-title" style={{ fontSize: '2.4rem', fontWeight: 500, color: '#16140f', margin: '0 0 8px 0', lineHeight: 1.1 }}>
            Good morning, {userName}.
          </h1>

          {/* JetBrains Mono sub-line */}
          <p className="mono-text" style={{ fontSize: '0.82rem', color: '#6b6557', margin: 0, textTransform: 'uppercase' }}>
            Tuesday · while you slept, understanding kept moving
          </p>
        </div>

        {/* ONE EMOTIONAL BEAT (PDF §05: Exactly one Fraunces-italic terracotta line as room heartbeat) */}
        <div style={{
          background: '#f0d9cd', // --accent-soft
          borderLeft: '3px solid #bf3d11', // --accent terracotta
          padding: '12px 18px',
          borderRadius: '0 8px 8px 0'
        }}>
          <p className="fraunces-title" style={{ fontStyle: 'italic', fontSize: '1.05rem', color: '#bf3d11', margin: 0, fontWeight: 500 }}>
            “The company is an organic system; every decision leaves a trace.”
          </p>
        </div>
      </div>

      {/* --- NOW-STRIP WIDGET (PDF §05: Thin horizontal band of today's dated items left-to-right by hour) --- */}
      <div style={{
        background: '#fbfaf6',
        border: '1px solid #e7e1d4',
        borderRadius: '14px',
        padding: '16px 24px',
        marginBottom: '28px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        overflowX: 'auto'
      }}>
        <div className="mono-text" style={{ fontSize: '10px', fontWeight: 700, color: '#7a2a0e', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>TODAY STRIP</span>
          <span style={{ color: '#d1d5db' }}>│</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flex: 1 }}>
          {todayTimeline.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
              <span className="mono-text" style={{ fontSize: '11px', fontWeight: 700, color: item.status === 'verified' ? '#2f6b4f' : item.status === 'current' ? '#bf3d11' : '#6b6557' }}>
                {item.time}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: item.status === 'current' ? '#16140f' : '#3b372f' }}>
                {item.label}
              </span>
              {idx < todayTimeline.length - 1 && (
                <span style={{ color: '#e7e1d4', marginLeft: '16px' }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* --- MAIN 2-COLUMN DUAL DASHBOARD GRID --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '28px', alignItems: 'start' }}>

        {/* LEFT COLUMN: WHAT NEEDS DOING NOW + CHANGED OVERNIGHT + SLIPPING */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* WIDGET 1: WHAT NEEDS DOING NOW (PDF §05: Top 3 Priorities) */}
          <div style={{
            background: '#fbfaf6',
            border: '1px solid #e7e1d4',
            borderRadius: '16px',
            padding: '24px 28px',
            boxShadow: '0 2px 14px rgba(60, 40, 20, 0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#bf3d11' }} />
                <h2 className="fraunces-title" style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#16140f' }}>
                  What needs doing now
                </h2>
              </div>
              <span className="mono-text" style={{ fontSize: '10px', color: '#6b6557', textTransform: 'uppercase' }}>
                TOP 3 PRIORITIES
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {nowPriorities.map(p => (
                <div
                  key={p.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e7e1d4',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div>
                    <h3 className="claim-hover" style={{ fontSize: '15px', fontWeight: 600, color: '#16140f', margin: '0 0 4px 0' }}>
                      {p.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#3b372f', margin: 0, lineHeight: 1.4 }}>
                      {p.sub}
                    </p>
                  </div>

                  <span className="mono-text" style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: p.tagBg,
                    color: p.tagColor,
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase'
                  }}>
                    {p.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* DUAL WIDGET ROW: CHANGED OVERNIGHT + SLIPPING */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            {/* WIDGET 2: CHANGED OVERNIGHT (PDF §05: Synthesis pass items) */}
            <div style={{
              background: '#fbfaf6',
              border: '1px solid #e7e1d4',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 2px 14px rgba(60, 40, 20, 0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="fraunces-title" style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#16140f' }}>
                  Changed overnight
                </h3>
                <span className="mono-text" style={{ fontSize: '9px', color: '#2f6b4f', textTransform: 'uppercase', fontWeight: 700 }}>
                  SYNTHESIS PASS
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {changedOvernight.map(item => (
                  <div key={item.id} style={{ background: '#ffffff', border: '1px solid #e7e1d4', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="claim-hover" style={{ fontSize: '13px', fontWeight: 600, color: '#16140f' }}>
                        {item.title}
                      </span>
                      <span className="mono-text" style={{ fontSize: '9px', color: '#6b6557' }}>
                        {item.time}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#3b372f', margin: 0, lineHeight: 1.35 }}>
                      {item.sub}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* WIDGET 3: SLIPPING (PDF §05: delayed_on check-in tone) */}
            <div style={{
              background: '#fbfaf6',
              border: '1px solid #e7e1d4',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 2px 14px rgba(60, 40, 20, 0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="fraunces-title" style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#16140f' }}>
                  Slipping
                </h3>
                <span className="mono-text" style={{ fontSize: '9px', color: '#7a2a0e', textTransform: 'uppercase', fontWeight: 700 }}>
                  CHECK-IN TONE
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {slippingItems.map(item => (
                  <div key={item.id} style={{ background: '#ffffff', border: '1px solid #e7e1d4', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="claim-hover" style={{ fontSize: '13px', fontWeight: 600, color: '#16140f' }}>
                        {item.title}
                      </span>
                      <span className="mono-text" style={{ fontSize: '9px', color: '#bf3d11', fontWeight: 600 }}>
                        {item.time}
                      </span>
                    </div>
                    <p className="fraunces-title" style={{ fontSize: '12px', fontStyle: 'italic', color: '#7a2a0e', margin: 0, lineHeight: 1.35 }}>
                      "{item.delayNote}"
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: WIDGET 5 - AMBIENT AUDIO BRIEF PLAYER (PDF §05) */}
        <div style={{
          background: '#fbfaf6',
          border: '1px solid #e7e1d4',
          borderRadius: '16px',
          padding: '28px 24px',
          boxShadow: '0 2px 14px rgba(60, 40, 20, 0.03)',
          position: 'sticky',
          top: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPlayingAudio ? '#bf3d11' : '#6b6557' }} />
              <h2 className="fraunces-title" style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: '#16140f' }}>
                Ambient Brief & Pad
              </h2>
            </div>
            <span className="mono-text" style={{ fontSize: '9px', color: '#7a2a0e', fontWeight: 700 }}>
              KOKORO-82M
            </span>
          </div>

          <p style={{ fontSize: '13px', color: '#3b372f', margin: '0 0 20px 0', lineHeight: 1.45 }}>
            Synthesized morning executive briefing paired with low-pass ambient background pad.
          </p>

          {/* DYNAMIC SOUNDWAVE EQUALIZER (PDF §05: Ambient Control) */}
          <div style={{
            background: '#faf7f1',
            border: '1px solid #e7e1d4',
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
                    background: isPlayingAudio ? '#bf3d11' : '#16140f', 
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
            <div style={{ position: 'relative', width: '100%', height: '4px', background: '#e7e1d4', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${playbackProgress}%`,
                background: '#bf3d11',
                transition: 'width 0.3s linear'
              }} />
            </div>
          </div>

          {/* Audio Player Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={toggleAmbientSound}
              style={{
                background: isPlayingAudio ? '#bf3d11' : '#16140f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                boxShadow: isPlayingAudio ? '0 0 18px rgba(191, 61, 17, 0.35)' : '0 4px 12px rgba(22, 20, 15, 0.15)',
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
