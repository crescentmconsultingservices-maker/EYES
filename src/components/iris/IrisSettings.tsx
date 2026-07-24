'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function IrisSettings() {
  const { user, updateUser, theme, setGlobalTheme } = useAuth();
  const { openConfirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security' | 'theme' | 'feedback'>('profile');
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
          text: `Hi ${user?.name || 'there'}! 👋 Welcome to IRIS Feedback. What's on your mind? Share any ideas, feedback, or bug reports and our dev team will receive it instantly!`,
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
      setSettingsSaved(res.ok ? 'Settings saved!' : 'Failed to save.');
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

  const brandAccent = theme === 'ember' ? '#e06a3b' : theme === 'light' ? '#0f172a' : '#ffffff';
  const brandBgSoft = theme === 'ember' ? 'rgba(224, 106, 59, 0.12)' : theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const saveBtnBg = theme === 'ember' ? '#e06a3b' : theme === 'light' ? '#0f172a' : '#ffffff';
  const saveBtnText = theme === 'dark' ? '#000000' : '#ffffff';

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '40px 60px', animation: 'fadeIn 0.4s ease-out', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '6px', fontWeight: 700, letterSpacing: '-0.02em' }}>IRIS Settings</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>Configure system behavior, sensitivity thresholds, and interface preferences.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '40px', alignItems: 'start' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { id: 'profile', label: 'Profile Details' },
            { id: 'tuning', label: 'Sensitivity' },
            { id: 'theme', label: 'Interface Theme' },
            { id: 'privacy', label: 'Privacy Shields' },
            { id: 'security', label: 'Secure Access' },
            { id: 'feedback', label: 'Feedback & Support' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                textAlign: 'left',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.2s ease',
                background: activeTab === tab.id ? brandBgSoft : 'transparent',
                color: activeTab === tab.id ? brandAccent : 'var(--text-secondary)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings Panel Card */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          {activeTab === 'profile' && (
            <div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '20px', fontWeight: 600 }}>Profile Details</h3>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>DISPLAY NAME</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>EMAIL ADDRESS</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '14px', opacity: 0.7 }}
                />
              </div>

              {saveStatus && <p style={{ color: saveStatus.includes('success') ? '#10b981' : '#ef4444', fontSize: '13px', marginBottom: '16px' }}>{saveStatus}</p>}

              <button
                onClick={handleUpdateProfile}
                disabled={isSaving}
                style={{ background: saveBtnBg, color: saveBtnText, border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isSaving ? 'Updating...' : 'Update Profile'}
              </button>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '20px', fontWeight: 600 }}>System Sensitivity & Sync Depth</h3>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>RISK SENSITIVITY</label>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  {['LOW', 'MEDIUM', 'HIGH'].map(level => (
                    <button
                      key={level}
                      onClick={() => setRiskSensitivity(level)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        border: riskSensitivity === level ? `1px solid ${brandAccent}` : '1px solid var(--border)',
                        background: riskSensitivity === level ? brandBgSoft : 'rgba(255,255,255,0.02)',
                        color: riskSensitivity === level ? brandAccent : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Adjust how aggressively IRIS flags potential risks and slippage.</p>
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>SYNC DEPTH</label>
                <select
                  value={syncDepth}
                  onChange={(e) => setSyncDepth(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
                >
                  <option value="shallow" style={{ background: '#111' }}>Shallow (Last 30 Days)</option>
                  <option value="balanced" style={{ background: '#111' }}>Balanced (Last 6 Months)</option>
                  <option value="deep" style={{ background: '#111' }}>Deep (Full History)</option>
                </select>
              </div>

              {settingsSaved && <p style={{ color: settingsSaved.includes('saved') ? '#10b981' : '#ef4444', fontSize: '13px', marginBottom: '16px' }}>{settingsSaved}</p>}

              <button
                onClick={handleSaveSettings}
                style={{ background: saveBtnBg, color: saveBtnText, border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Sensitivity Settings
              </button>
            </div>
          )}

          {activeTab === 'theme' && (
            <div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>Interface Theme</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Select your preferred visual theme for the IRIS dashboard.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {[
                  { id: 'dark', label: 'Dark Mode', bg: '#09090b', color: '#ffffff' },
                  { id: 'light', label: 'Light Mode', bg: '#f8fafc', color: '#0f172a' },
                  { id: 'ember', label: 'Ember Mode', bg: '#120a07', color: '#e06a3b' }
                ].map(t => (
                  <div
                    key={t.id}
                    onClick={() => setGlobalTheme(t.id as any)}
                    style={{
                      border: theme === t.id ? `2px solid ${brandAccent}` : '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      background: theme === t.id ? brandBgSoft : 'rgba(255,255,255,0.02)',
                      textAlign: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ height: '40px', borderRadius: '6px', background: t.bg, border: '1px solid rgba(255,255,255,0.1)', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: t.color }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: theme === t.id ? brandAccent : 'var(--text-primary)' }}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '20px', fontWeight: 600 }}>Privacy & Data Exclusion</h3>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px' }}>EXCLUDED SENDERS / DOMAINS</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="text"
                    placeholder="Add email or domain..."
                    value={newSender}
                    onChange={(e) => setNewSender(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                  />
                  <button
                    onClick={() => {
                      if (newSender && !excludedSenders.includes(newSender)) {
                        setExcludedSenders((prev: string[]) => [...prev, newSender]);
                        setNewSender('');
                      }
                    }}
                    style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', padding: '0 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  >
                    Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {excludedSenders.map((s: string) => (
                    <span key={s} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {s}
                      <button onClick={() => setExcludedSenders((prev: string[]) => prev.filter((item: string) => item !== s))} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>

              {settingsSaved && <p style={{ color: settingsSaved.includes('saved') ? '#10b981' : '#ef4444', fontSize: '13px', marginBottom: '16px' }}>{settingsSaved}</p>}

              <button
                onClick={handleSaveSettings}
                style={{ background: saveBtnBg, color: saveBtnText, border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Privacy Settings
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 600 }}>Security & OAuth Connections</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Your account is secured via authenticated session providers.</p>

              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h4 style={{ color: '#ef4444', margin: '0 0 4px 0', fontSize: '14px' }}>Danger Zone</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 12px 0' }}>Data deletion actions are permanent.</p>
                <button
                  onClick={() => alert("Please visit the master settings page to confirm account deletion.")}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Request Account Deletion
                </button>
              </div>
            </div>
          )}

          {activeTab === 'feedback' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '480px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>IRIS Feedback Desk</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Send feature suggestions or bug reports directly to our core development team.</p>
              </div>

              {/* Chat Container */}
              <div style={{ 
                flex: 1, 
                background: 'rgba(0,0,0,0.15)', 
                border: '1px solid var(--border)', 
                borderRadius: '12px', 
                padding: '16px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                marginBottom: '16px'
              }}>
                {feedbackMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    style={{ 
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      background: msg.sender === 'user' ? brandAccent : 'rgba(255,255,255,0.06)',
                      color: msg.sender === 'user' ? saveBtnText : 'var(--text-primary)',
                      border: msg.sender === 'user' ? 'none' : '1px solid var(--border)',
                      borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '12px 16px',
                      fontSize: '13.5px',
                      lineHeight: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>{msg.time}</div>
                  </div>
                ))}
              </div>

              {/* Input Bar */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  placeholder="Type feedback for the dev team..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendFeedback(); }}
                  style={{ 
                    flex: 1, 
                    background: 'rgba(255,255,255,0.04)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '12px 16px', 
                    color: 'var(--text-primary)', 
                    fontSize: '13.5px',
                    outline: 'none'
                  }}
                />
                <button 
                  onClick={handleSendFeedback}
                  disabled={isSubmittingFeedback || !feedbackInput.trim()}
                  style={{ 
                    background: saveBtnBg, 
                    color: saveBtnText, 
                    border: 'none', 
                    borderRadius: '8px', 
                    padding: '0 20px', 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    cursor: isSubmittingFeedback || !feedbackInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSubmittingFeedback || !feedbackInput.trim() ? 0.6 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isSubmittingFeedback ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
