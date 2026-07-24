'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function SettingsPage() {
  const router = useRouter();
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
    if (feedbackMessages.length === 0) {
      setFeedbackMessages([
        {
          sender: 'bot',
          text: `Hi ${user?.name || 'there'}! 👋 Welcome to the Feedback Desk. What's on your mind? Tell us any bugs, feature ideas, or thoughts and our dev team will receive it instantly!`,
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
        body: JSON.stringify({ message: userText, module: 'EYES' })
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

  // Load persisted global settings on mount
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

  // Close custom select dropdown on click outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = () => setIsDropdownOpen(false);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isDropdownOpen]);

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

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [wipeError, setWipeError] = useState<string | null>(null);

  const handleDeleteAccount = () => {
    openConfirm({
      title: 'Delete Account',
      description:
        'This permanently removes your account, all indexed memories, OAuth tokens, and audit history. This action cannot be undone.',
      confirmLabel: 'Delete Forever',
      confirmVariant: 'danger',
      requireTyping: 'DELETE',
      onConfirm: async () => {
        setDeleteError(null);
        const res = await fetch('/api/user/delete', { method: 'DELETE' });
        if (res.ok) {
          router.replace('/login');
        } else {
          setDeleteError('Failed to delete account. Please contact support.');
        }
      },
    });
  };

  const handleWipeArchive = () => {
    openConfirm({
      title: 'Purge Data Archive',
      description:
        'This wipes all indexed memories from every connected platform. Your account and settings remain. This cannot be undone.',
      confirmLabel: 'Wipe Archive',
      confirmVariant: 'danger',
      requireTyping: 'WIPE',
      onConfirm: async () => {
        setWipeError(null);
        const res = await fetch('/api/user/wipe', { method: 'POST' });
        if (!res.ok) {
          setWipeError('Failed to purge archive. Please try again.');
        }
      },
    });
  };

  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className="scanline" />
      
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>

      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <h1 className={styles.title}>Account Settings</h1>
          <p className={styles.subtitle}>Manage your account preferences and data settings.</p>

          <div className={styles.contentLayout}>
            {/* Tabs Sidebar */}
            <div className={styles.tabList}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                Profile Details
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'tuning' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('tuning')}
              >
                Sensitivity
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'theme' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('theme')}
              >
                Interface Theme
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'privacy' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('privacy')}
              >
                Privacy Shields
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'security' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('security')}
              >
                Secure Access
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'feedback' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('feedback')}
              >
                Feedback & Support
              </button>
            </div>

            {/* Tab Content */}
            <div className={styles.panel}>
              {activeTab === 'profile' && (
                <div className={styles.profileSection}>
                  <div className={styles.fieldGroup}>
                    <label>DISPLAY NAME</label>
                    <input 
                      id="display-name"
                      name="displayName"
                      type="text"
                      autoComplete="name"
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={styles.input} 
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>EMAIL ADDRESS</label>
                    <input id="email-display" name="email" type="email" autoComplete="email" value={user?.email || ''} className={styles.input} disabled />
                  </div>
                  
                  {saveStatus && <p className={saveStatus.includes('success') ? styles.successText : styles.errorText}>{saveStatus}</p>}
                  
                  <button 
                    className={styles.saveBtn} 
                    onClick={handleUpdateProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Updating...' : 'Update Profile'}
                  </button>
                </div>
              )}

              {activeTab === 'tuning' && (
                <div className={styles.tuningSection}>
                  <div className={styles.fieldGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>RISK SENSITIVITY</label>
                      <span className={styles.statBadge}>{riskSensitivity}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px', marginBottom: '8px' }}>
                      {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
                        <button
                          key={level}
                          onClick={() => setRiskSensitivity(level)}
                          className={`${styles.levelBtn} ${riskSensitivity === level ? styles.levelBtnActive : ''}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className={styles.fieldDesc}>Adjust how aggressively the system flags potential risks.</p>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label>SYNC DEPTH</label>
                    <div className={styles.customSelectWrapper}>
                      <div 
                        className={styles.customSelectValue} 
                        onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(!isDropdownOpen); }}
                      >
                        {syncDepth === 'shallow' ? 'Shallow (Last 30 Days)' : syncDepth === 'balanced' ? 'Balanced (Last 6 Months)' : 'Deep (Full History)'}
                        <span style={{ fontSize: '10px' }}>▼</span>
                      </div>
                      {isDropdownOpen && (
                        <div className={styles.customSelectMenu}>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('shallow'); setIsDropdownOpen(false); }}>Shallow (Last 30 Days)</div>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('balanced'); setIsDropdownOpen(false); }}>Balanced (Last 6 Months)</div>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('deep'); setIsDropdownOpen(false); }}>Deep (Full History)</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {settingsSaved && activeTab === 'tuning' && (
                    <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
                  )}
                  <button className={styles.saveBtn} onClick={handleSaveSettings}>
                    Save Sensitivity Settings
                  </button>
                </div>
              )}


              {activeTab === 'privacy' && (
                <div className={styles.privacySection}>
                  <div className={styles.fieldGroup}>
                    <label>EXCLUDE SENDERS / DOMAINS</label>
                    <p className={styles.fieldDesc}>These entries will never be indexed or scanned by the analysis engine.</p>
                    
                    <div className={styles.listContainer}>
                      {excludedSenders.map(sender => (
                        <div key={sender} className={styles.listItem}>
                          <span>{sender}</span>
                          <button 
                            className={styles.itemRemove}
                            onClick={() => setExcludedSenders(prev => prev.filter(s => s !== sender))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <input
                        id="exclude-sender"
                        name="excludeSender"
                        type="text"
                        autoComplete="off"
                        placeholder="Add email or domain..."
                        value={newSender}
                        onChange={(e) => setNewSender(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSender && !excludedSenders.includes(newSender)) {
                            setExcludedSenders(prev => [...prev, newSender]);
                            setNewSender('');
                          }
                        }}
                        className={styles.input}
                      />
                      <button
                        className={styles.addBtn}
                        onClick={() => {
                          if (newSender && !excludedSenders.includes(newSender)) {
                            setExcludedSenders(prev => [...prev, newSender]);
                            setNewSender('');
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className={styles.divider} style={{ margin: '32px 0' }} />

                  <div className={styles.fieldGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <label>GDPR DATA COLLECTION (MISTRAL FINE-TUNING)</label>
                        <p className={styles.fieldDesc} style={{ maxWidth: '80%' }}>
                          Allow EYES to anonymously log your AI queries (prompts, completions, latency) to improve future Mistral models. No PII is collected.
                        </p>
                      </div>
                      <div 
                        onClick={() => setGdprConsent(!gdprConsent)}
                        style={{
                          width: '40px',
                          height: '24px',
                          background: gdprConsent ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '12px',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          background: '#fff',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '3px',
                          left: gdprConsent ? '19px' : '3px',
                          transition: 'left 0.2s',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                  </div>

                  {settingsSaved && activeTab === 'privacy' && (
                    <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
                  )}
                  <button className={styles.saveBtn} onClick={handleSaveSettings}>
                    Save Privacy Settings
                  </button>
                </div>
              )}

              {activeTab === 'theme' && (
                <div className={styles.themeSection}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>Interface Theme</h3>
                  <p className={styles.fieldDesc} style={{ marginBottom: '24px' }}>
                    Select your preferred appearance mode for the EYES dashboard.
                  </p>

                  <div className={styles.themeGrid}>
                    <div 
                      className={`${styles.themeCard} ${theme === 'dark' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('dark')}
                    >
                      <div className={styles.themePreviewDark} />
                      <span>Dark Mode</span>
                    </div>

                    <div 
                      className={`${styles.themeCard} ${theme === 'light' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('light')}
                    >
                      <div className={styles.themePreviewLight} />
                      <span>Light Mode</span>
                    </div>

                    <div 
                      className={`${styles.themeCard} ${theme === 'ember' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('ember')}
                    >
                      <div className={styles.themePreviewEmber} />
                      <span>Ember Mode</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className={styles.securitySection}>
                  <div className={styles.securityInfo}>
                    <h3>OAuth Connections</h3>
                    <p>Your account is currently secured via GitHub.</p>
                  </div>
                  
                  <div className={styles.divider} style={{ margin: '32px 0' }} />

                  <div className={styles.dangerZone}>
                    <h3>Danger Zone</h3>
                    <p className={styles.fieldDesc}>Actions here are permanent and cannot be undone.</p>
                    
                    <div className={styles.dangerAction}>
                      <div>
                        <strong>Purge Data Archive</strong>
                        <p>Wipe all indexed memories from all connected platforms.</p>
                        {wipeError && <p style={{ color: 'var(--accent-red, #ef4444)', fontSize: '12px', marginTop: '4px' }}>{wipeError}</p>}
                      </div>
                      <button 
                        className={styles.dangerBtnOutline}
                        onClick={handleWipeArchive}
                      >
                        Purge All Data
                      </button>
                    </div>

                    <div className={styles.dangerAction} style={{ marginTop: '24px' }}>
                      <div>
                        <strong>Delete Account</strong>
                        <p>Permanently remove your account and all associated data.</p>
                        {deleteError && <p style={{ color: 'var(--accent-red, #ef4444)', fontSize: '12px', marginTop: '4px' }}>{deleteError}</p>}
                      </div>
                      <button className={styles.dangerBtn} onClick={handleDeleteAccount}>Delete Account</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'feedback' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '520px', animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Interactive Feedback Desk</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Send feature suggestions, bug reports, or feedback directly to our core engineering team.</p>
                  </div>

                  {/* Chat Container */}
                  <div style={{ 
                    flex: 1, 
                    background: 'rgba(0,0,0,0.2)', 
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
                          background: msg.sender === 'user' ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.06)',
                          color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
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

                  {/* Chat Input Bar */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      placeholder="Type your feedback to the dev team..."
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
                        background: 'var(--accent-primary, #6366f1)', 
                        color: '#ffffff', 
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
      </div>
    </div>
  );
}
