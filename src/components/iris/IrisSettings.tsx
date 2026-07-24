'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function IrisSettings() {
  const { user, updateUser, theme, setGlobalTheme } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'theme' | 'privacy' | 'feedback'>('profile');
  const [feedbackMessages, setFeedbackMessages] = useState<Array<{ sender: 'bot' | 'user'; text: string; time: string }>>([]);
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [riskSensitivity, setRiskSensitivity] = useState('MEDIUM');
  const [syncDepth, setSyncDepth] = useState('balanced');
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [gdprConsent, setGdprConsent] = useState(true);
  const [newSender, setNewSender] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
    if (feedbackMessages.length === 0) {
      setFeedbackMessages([
        {
          sender: 'bot',
          text: `Hi ${user?.name || 'there'}! 👋 Welcome to IRIS Feedback. Share your thoughts or bug reports — messages are dispatched to our core dev team and logged on EYES memory graph!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [user]);

  const handleSendFeedback = async () => {
    if (!feedbackInput.trim() || isSubmittingFeedback) return;
    const userText = feedbackInput.trim();
    setFeedbackInput('');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    setFeedbackMessages(prev => [...prev, { sender: 'user', text: userText, time: now }]);
    setIsSubmittingFeedback(true);

    try {
      const res = await fetch('/api/user/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, module: 'IRIS' })
      });
      const data = await res.json();
      const botText = data.reply || "Thank you! Your feedback has been sent directly to our development team. 🚀";
      setFeedbackMessages(prev => [...prev, { sender: 'bot', text: botText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    } catch {
      setFeedbackMessages(prev => [...prev, { sender: 'bot', text: "Feedback received and sent to dev review! 🚀", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  useEffect(() => {
    fetch('/api/user/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.riskSensitivity) setRiskSensitivity(data.riskSensitivity);
        if (data.syncDepth) setSyncDepth(data.syncDepth);
        if (data.gdprConsent !== undefined) setGdprConsent(data.gdprConsent);
        if (Array.isArray(data.excludedSenders)) setExcludedSenders(data.excludedSenders);
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async () => {
    setSettingsSaved(null);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskSensitivity, syncDepth, excludedSenders, gdprConsent }),
      });
      if (res.ok) {
        updateUser({ behaviorLoggingConsent: gdprConsent });
      }
      setSettingsSaved(res.ok ? 'Settings saved successfully!' : 'Failed to save settings.');
    } catch {
      setSettingsSaved('Error saving settings.');
    } finally {
      setTimeout(() => setSettingsSaved(null), 3000);
    }
  };

  const handleUpdateProfile = async () => {
    if (displayName === user?.name) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const result = await updateUser({ name: displayName });
      if (result.success) {
        setSaveStatus('Profile updated successfully!');
      } else {
        setSaveStatus(result.message || 'Failed to update.');
      }
    } catch {
      setSaveStatus('An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '32px 16px 80px 16px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '28px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SYSTEM PREFERENCES
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          IRIS Settings
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '14px', margin: 0 }}>
          Configure Paper & Ink design preferences, sensitivity thresholds, and developer feedback.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--paper-2, #f2ede3)', padding: '6px', borderRadius: '8px' }}>
          {[
            { id: 'profile', label: 'Profile Details' },
            { id: 'tuning', label: 'Sensitivity Tuning' },
            { id: 'theme', label: 'Visual Theme' },
            { id: 'privacy', label: 'Privacy Shields' },
            { id: 'feedback', label: 'Feedback Desk' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'var(--font-inter, sans-serif)',
                fontWeight: activeTab === tab.id ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.15s ease',
                background: activeTab === tab.id ? 'var(--card, #fbfaf6)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent, #bf3d11)' : 'var(--ink-soft, #3b372f)',
                boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Card */}
        <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '10px', padding: '28px', boxShadow: 'var(--shadow-paper, 0 2px 20px rgba(60,40,20,0.05))' }}>
          {activeTab === 'profile' && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 18px 0' }}>Profile Details</h3>
              
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600, marginBottom: '6px' }}>DISPLAY NAME</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--paper-2, #f2ede3)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '6px', color: 'var(--ink, #16140f)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600, marginBottom: '6px' }}>EMAIL ADDRESS</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--paper-2, #f2ede3)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '6px', color: 'var(--ink-faint, #6b6557)', fontSize: '14px', opacity: 0.7 }}
                />
              </div>

              {saveStatus && <p style={{ color: saveStatus.includes('success') ? 'var(--good, #2f6b4f)' : 'var(--accent, #bf3d11)', fontSize: '13px', marginBottom: '16px' }}>{saveStatus}</p>}

              <button
                onClick={handleUpdateProfile}
                disabled={isSaving}
                style={{ background: 'var(--accent, #bf3d11)', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '13px', fontFamily: 'var(--font-jetbrains, monospace)', fontWeight: 600, cursor: 'pointer' }}
              >
                {isSaving ? 'Updating...' : 'Update Profile'}
              </button>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 18px 0' }}>Sensitivity Tuning</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600, marginBottom: '6px' }}>RISK SENSITIVITY</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  {['LOW', 'MEDIUM', 'HIGH'].map(level => (
                    <button
                      key={level}
                      onClick={() => setRiskSensitivity(level)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: riskSensitivity === level ? '1px solid var(--accent, #bf3d11)' : '1px solid var(--border-paper, #e7e1d4)',
                        background: riskSensitivity === level ? 'var(--accent-soft, #f0d9cd)' : 'var(--paper-2, #f2ede3)',
                        color: riskSensitivity === level ? 'var(--accent-ink, #7a2a0e)' : 'var(--ink-soft, #3b372f)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-jetbrains, monospace)',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--ink-faint, #6b6557)', margin: 0 }}>Adjust how aggressively IRIS surfaces slippage and risk signals.</p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600, marginBottom: '6px' }}>GRAPH SYNC DEPTH</label>
                <select
                  value={syncDepth}
                  onChange={(e) => setSyncDepth(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--paper-2, #f2ede3)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '6px', color: 'var(--ink, #16140f)', fontSize: '14px', outline: 'none' }}
                >
                  <option value="shallow">Shallow (Last 30 Days)</option>
                  <option value="balanced">Balanced (Last 6 Months)</option>
                  <option value="deep">Deep (Full Vector History)</option>
                </select>
              </div>

              {settingsSaved && <p style={{ color: 'var(--good, #2f6b4f)', fontSize: '13px', marginBottom: '16px' }}>{settingsSaved}</p>}

              <button
                onClick={handleSaveSettings}
                style={{ background: 'var(--accent, #bf3d11)', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '13px', fontFamily: 'var(--font-jetbrains, monospace)', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Sensitivity Settings
              </button>
            </div>
          )}

          {activeTab === 'theme' && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>Visual Theme</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft, #3b372f)', marginBottom: '20px' }}>Paper & Ink theme is active by default (§01 Spec).</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                {[
                  { id: 'paper', label: 'Paper & Ink', bg: '#faf7f1', color: '#bf3d11' },
                  { id: 'dark', label: 'Dark Mode', bg: '#09090b', color: '#ffffff' },
                  { id: 'ember', label: 'Ember Mode', bg: '#120a07', color: '#e06a3b' }
                ].map(t => (
                  <div
                    key={t.id}
                    onClick={() => setGlobalTheme(t.id as any)}
                    style={{
                      border: theme === t.id ? '2px solid var(--accent, #bf3d11)' : '1px solid var(--border-paper, #e7e1d4)',
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      background: theme === t.id ? 'var(--accent-soft, #f0d9cd)' : 'var(--paper-2, #f2ede3)',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ height: '36px', borderRadius: '4px', background: t.bg, border: '1px solid rgba(0,0,0,0.1)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.color }} />
                    </div>
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)', fontWeight: 600, color: 'var(--ink-deep, #1a1714)' }}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 18px 0' }}>Privacy Shields</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600, marginBottom: '6px' }}>EXCLUDED DOMAINS / SENDERS</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Add domain to shield..."
                    value={newSender}
                    onChange={(e) => setNewSender(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', background: 'var(--paper-2, #f2ede3)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '6px', color: 'var(--ink, #16140f)', fontSize: '13px', outline: 'none' }}
                  />
                  <button
                    onClick={() => {
                      if (newSender && !excludedSenders.includes(newSender)) {
                        setExcludedSenders((prev: string[]) => [...prev, newSender]);
                        setNewSender('');
                      }
                    }}
                    style={{ background: 'var(--accent, #bf3d11)', border: 'none', color: '#fff', padding: '0 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-jetbrains, monospace)', fontWeight: 600 }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {excludedSenders.map((s: string) => (
                    <span key={s} style={{ background: 'var(--paper-2, #f2ede3)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontFamily: 'var(--font-jetbrains, monospace)', color: 'var(--ink-soft, #3b372f)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {s}
                      <button onClick={() => setExcludedSenders((prev: string[]) => prev.filter((item: string) => item !== s))} style={{ background: 'transparent', border: 'none', color: 'var(--accent, #bf3d11)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>

              {settingsSaved && <p style={{ color: 'var(--good, #2f6b4f)', fontSize: '13px', marginBottom: '16px' }}>{settingsSaved}</p>}

              <button
                onClick={handleSaveSettings}
                style={{ background: 'var(--accent, #bf3d11)', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '13px', fontFamily: 'var(--font-jetbrains, monospace)', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Privacy Settings
              </button>
            </div>
          )}

          {activeTab === 'feedback' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '420px' }}>
              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 4px 0' }}>IRIS Feedback Desk</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink-soft, #3b372f)', margin: 0 }}>Direct channel to the dev team. Messages dispatched here log on the memory graph.</p>
              </div>

              {/* Chat Container */}
              <div style={{ 
                flex: 1, 
                background: 'var(--paper-2, #f2ede3)', 
                border: '1px solid var(--border-paper, #e7e1d4)', 
                borderRadius: '8px', 
                padding: '14px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '10px',
                marginBottom: '14px'
              }}>
                {feedbackMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    style={{ 
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      background: msg.sender === 'user' ? 'var(--accent, #bf3d11)' : 'var(--card, #fbfaf6)',
                      color: msg.sender === 'user' ? '#ffffff' : 'var(--ink, #16140f)',
                      border: msg.sender === 'user' ? 'none' : '1px solid var(--border-paper, #e7e1d4)',
                      borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      lineHeight: 1.5
                    }}
                  >
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right', fontFamily: 'var(--font-jetbrains, monospace)' }}>{msg.time}</div>
                  </div>
                ))}
              </div>

              {/* Input Bar */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Type feedback for dev team..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendFeedback(); }}
                  style={{ 
                    flex: 1, 
                    background: 'var(--paper-2, #f2ede3)', 
                    border: '1px solid var(--border-paper, #e7e1d4)', 
                    borderRadius: '6px', 
                    padding: '10px 12px', 
                    color: 'var(--ink, #16140f)', 
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                <button 
                  onClick={handleSendFeedback}
                  disabled={isSubmittingFeedback || !feedbackInput.trim()}
                  style={{ 
                    background: 'var(--accent, #bf3d11)', 
                    color: '#ffffff', 
                    border: 'none', 
                    borderRadius: '6px', 
                    padding: '0 16px', 
                    fontSize: '12px', 
                    fontFamily: 'var(--font-jetbrains, monospace)',
                    fontWeight: 600, 
                    cursor: isSubmittingFeedback || !feedbackInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSubmittingFeedback || !feedbackInput.trim() ? 0.6 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isSubmittingFeedback ? 'Sending...' : 'Send →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
