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
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security' | 'theme' | 'feedback' | 'organization'>('profile');
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

  // B2B Organization States
  interface OrgMember {
    id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    joined_at: string;
    profile: { name: string; avatar: string };
  }
  interface OrgInvitation {
    id: string;
    email: string;
    role: 'owner' | 'admin' | 'member';
    token: string;
    expires_at: string;
    accepted_at: string | null;
  }
  interface OrgDetails {
    organization: { id: string; name: string; corporate_domain: string | null; privacy_shield_enabled: boolean };
    members: OrgMember[];
    invitations: OrgInvitation[];
  }

  const [orgDetails, setOrgDetails] = useState<OrgDetails | null>(null);
  const [isFetchingOrg, setIsFetchingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSaveStatus, setOrgSaveStatus] = useState<string | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [privacyShield, setPrivacyShield] = useState(true);

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

  useEffect(() => {
    if (activeTab === 'organization' && user?.organizationId) {
      fetchOrgDetails();
    }
  }, [activeTab, user]);

  const fetchOrgDetails = async () => {
    setIsFetchingOrg(true);
    setOrgError(null);
    try {
      const res = await fetch('/api/organization/details');
      if (res.ok) {
        const data = await res.json();
        setOrgDetails(data);
        setOrgName(data.organization.name);
        setPrivacyShield(data.organization.privacy_shield_enabled);
      } else {
        const data = await res.json();
        setOrgError(data.error || 'Failed to fetch organization details');
      }
    } catch {
      setOrgError('Network error fetching organization details');
    } finally {
      setIsFetchingOrg(false);
    }
  };

  const handleSaveOrgSettings = async () => {
    if (!orgName.trim() || isSavingOrg) return;
    setIsSavingOrg(true);
    setOrgSaveStatus(null);
    try {
      const res = await fetch('/api/organization/details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, privacyShieldEnabled: privacyShield })
      });
      if (res.ok) {
        const data = await res.json();
        setOrgDetails(prev => prev ? { ...prev, organization: data.organization } : null);
        setOrgSaveStatus('Organization settings saved successfully!');
      } else {
        const data = await res.json();
        setOrgSaveStatus(data.error || 'Failed to save settings.');
      }
    } catch {
      setOrgSaveStatus('Error saving organization settings.');
    } finally {
      setIsSavingOrg(false);
      setTimeout(() => setOrgSaveStatus(null), 3000);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim() || isInviting) return;
    setIsInviting(true);
    setInviteStatus(null);
    try {
      const res = await fetch('/api/organization/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInviteStatus(`Invitation generated: ${data.inviteUrl}`);
        setInviteEmail('');
        fetchOrgDetails();
      } else {
        setInviteStatus(data.error || 'Failed to send invitation');
      }
    } catch {
      setInviteStatus('Error sending invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
      const res = await fetch(`/api/organization/invite?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchOrgDetails();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to revoke invitation');
      }
    } catch {
      alert('Error revoking invitation');
    }
  };

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
              {user?.accountType === 'organization' && (
                <button 
                  className={`${styles.tabBtn} ${activeTab === 'organization' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('organization')}
                >
                  Organization Space
                </button>
              )}
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

              {activeTab === 'organization' && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Organization Console</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Configure workspace-wide intelligence controls, privacy compliance, and team access.</p>
                  </div>

                  {isFetchingOrg ? (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div className={styles.loaderLine} style={{ margin: '0 auto 12px' }} />
                      <p>Fetching organization space details...</p>
                    </div>
                  ) : orgError ? (
                    <div style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: 'var(--accent-red)' }}>
                      {orgError}
                    </div>
                  ) : orgDetails ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                      
                      {/* Section 1: General Settings */}
                      <div>
                        <div className={styles.fieldGroup}>
                          <label>COMPANY / ORGANIZATION NAME</label>
                          <input 
                            type="text" 
                            value={orgName} 
                            onChange={(e) => setOrgName(e.target.value)}
                            className={styles.input} 
                            placeholder="Enter organization name..."
                          />
                        </div>

                        <div className={styles.fieldGroup}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <label>ORGANIZATION PRIVACY SHIELD</label>
                              <p className={styles.fieldDesc} style={{ maxWidth: '85%' }}>
                                When active, all organizational syncs filter out non-public or sensitive personal indicators (such as credentials, GDPR sensitive records, and financial markers) at the edge.
                              </p>
                            </div>
                            <div 
                              onClick={() => setPrivacyShield(!privacyShield)}
                              style={{
                                width: '40px',
                                height: '24px',
                                background: privacyShield ? 'var(--accent-primary, #6366f1)' : 'rgba(255, 255, 255, 0.1)',
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
                                left: privacyShield ? '19px' : '3px',
                                transition: 'left 0.2s',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                              }} />
                            </div>
                          </div>
                        </div>

                        {orgSaveStatus && (
                          <p className={orgSaveStatus.includes('success') ? styles.successText : styles.errorText}>
                            {orgSaveStatus}
                          </p>
                        )}

                        <button 
                          className={styles.saveBtn} 
                          onClick={handleSaveOrgSettings}
                          disabled={isSavingOrg || !orgName.trim()}
                        >
                          {isSavingOrg ? 'Saving Configuration...' : 'Save Workspace Policy'}
                        </button>
                      </div>

                      <div className={styles.divider} style={{ height: '1px', background: 'var(--border-subtle)', margin: '0' }} />

                      {/* Section 2: Team Member Management */}
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0' }}>Workspace Members</h4>
                        <p className={styles.fieldDesc} style={{ marginBottom: '16px' }}>List of personnel with access to the organization's shared memory pool.</p>

                        <div className={styles.listContainer}>
                          {orgDetails.members.map((member) => (
                            <div key={member.id} className={styles.listItem}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ 
                                  width: '28px', 
                                  height: '28px', 
                                  borderRadius: '50%', 
                                  background: 'var(--accent-primary, #6366f1)', 
                                  color: '#fff', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  fontWeight: 'bold', 
                                  fontSize: '12px' 
                                }}>
                                  {member.profile.avatar}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{member.profile.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    Joined {new Date(member.joined_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              <span className={styles.statBadge}>{member.role.toUpperCase()}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={styles.divider} style={{ height: '1px', background: 'var(--border-subtle)', margin: '0' }} />

                      {/* Section 3: Invite Team Members */}
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0' }}>Invite Collaborators</h4>
                        <p className={styles.fieldDesc} style={{ marginBottom: '16px' }}>Invite employees to join your organization space and synchronize workspace assets.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <input 
                              type="email" 
                              placeholder="colleague@company.com" 
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              className={styles.input}
                              style={{ flex: 1 }}
                            />
                            
                            <select 
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value as any)}
                              className={styles.input}
                              style={{ width: '120px', cursor: 'pointer' }}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                              <option value="owner">Owner</option>
                            </select>

                            <button 
                              className={styles.addBtn}
                              onClick={handleInviteMember}
                              disabled={isInviting || !inviteEmail.trim()}
                              style={{ height: '46px' }}
                            >
                              {isInviting ? 'Inviting...' : 'Send Invite'}
                            </button>
                          </div>

                          {inviteStatus && (
                            <div style={{ 
                              padding: '12px', 
                              borderRadius: '8px', 
                              background: 'rgba(255,255,255,0.03)', 
                              border: '1px solid var(--border-subtle)',
                              fontSize: '12px',
                              lineHeight: 1.5,
                              color: 'var(--text-primary)'
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: '4px' }}>
                                {inviteStatus.startsWith('Invitation generated') ? 'Invitation generated successfully!' : inviteStatus}
                              </div>
                              {inviteStatus.startsWith('Invitation generated') && (
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px' }}>
                                  <input 
                                    type="text" 
                                    readOnly 
                                    value={inviteStatus.split(': ')[1]} 
                                    style={{ 
                                      flex: 1, 
                                      background: 'rgba(0,0,0,0.2)', 
                                      border: 'none', 
                                      padding: '6px 8px', 
                                      borderRadius: '4px', 
                                      fontSize: '11px',
                                      color: 'var(--text-secondary)'
                                    }}
                                  />
                                  <button
                                    onClick={() => handleCopyLink(inviteStatus.split(': ')[1])}
                                    style={{ 
                                      background: 'var(--text-primary)', 
                                      color: 'var(--bg-primary)', 
                                      border: 'none', 
                                      borderRadius: '4px', 
                                      padding: '6px 12px', 
                                      fontSize: '11px', 
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {copiedLink === inviteStatus.split(': ')[1] ? 'Copied!' : 'Copy'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Pending Invitations list */}
                        {orgDetails.invitations.length > 0 && (
                          <div>
                            <h5 style={{ fontSize: '12px', fontWeight: 700, margin: '16px 0 8px 0', color: 'var(--text-secondary)' }}>Pending Invites</h5>
                            <div className={styles.listContainer}>
                              {orgDetails.invitations.map((invite) => (
                                <div key={invite.id} className={styles.listItem}>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{invite.email}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span className={styles.statBadge} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                                      {invite.accepted_at ? 'ACCEPTED' : 'PENDING'}
                                    </span>
                                    {!invite.accepted_at && (
                                      <button 
                                        className={styles.itemRemove} 
                                        onClick={() => handleRevokeInvitation(invite.id)}
                                        title="Revoke Invitation"
                                        style={{ fontSize: '18px' }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No organization details available.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
