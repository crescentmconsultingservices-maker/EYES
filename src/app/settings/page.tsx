'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { QRCodeSVG } from 'qrcode.react';

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, theme, setGlobalTheme, supabase } = useAuth();
  const { openConfirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security' | 'notifications' | 'theme' | 'feedback' | 'organization'>('profile');
  const [riskSensitivity, setRiskSensitivity] = useState('MEDIUM');
  const [syncDepth, setSyncDepth] = useState('balanced');
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [gdprConsent, setGdprConsent] = useState(true);
  const [newSender, setNewSender] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [pronouns, setPronouns] = useState('');

  useEffect(() => {
    if (user) {
      if (user.name && !displayName) setDisplayName(user.name);
      if (user.fullName && !fullName) setFullName(user.fullName);
      if (user.pronouns && !pronouns) setPronouns(user.pronouns);
    }
  }, [user]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // MFA Setup States
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaFactorIdToVerify, setMfaFactorIdToVerify] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isEnrollingMfa, setIsEnrollingMfa] = useState(false);

  // Web Push States
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isPushSubscribing, setIsPushSubscribing] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.pushManager) {
          reg.pushManager.getSubscription().then(sub => {
            if (sub) setIsPushEnabled(true);
          });
        }
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleEnableWebPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushMessage('Web Push is not supported in this browser.');
      return;
    }
    setPushMessage(null);
    setIsPushSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied.');
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BPS70teypoClkO-DPJbr762pHiYV_r57_7ztk8Hc-CUjYFjbzMyeonTRAduDGme57IQuSLA__v5h8Zb_kTL_Fa8';
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      if (!res.ok) throw new Error('Failed to save subscription.');
      
      setIsPushEnabled(true);
      setPushMessage('Notifications enabled!');
    } catch (e: any) {
      setPushMessage(e.message || 'Error enabling notifications.');
    } finally {
      setIsPushSubscribing(false);
    }
  };

  const handleTestWebPush = async () => {
    setPushMessage(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to send test notification.');
      setPushMessage('Test notification sent!');
    } catch (e: any) {
      setPushMessage(e.message || 'Error sending test notification.');
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      const fetchFactors = async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (!error && data) setMfaFactors(data.all || []);
      };
      fetchFactors();
    }
  }, [activeTab, supabase]);

  const handleEnrollMfa = async () => {
    setMfaError(null);
    setIsEnrollingMfa(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) {
      setMfaError(error.message);
      setIsEnrollingMfa(false);
      return;
    }
    setMfaFactorIdToVerify(data.id);
    setMfaQr(data.totp.uri);
    setIsEnrollingMfa(false);
  };

  const handleVerifyMfa = async () => {
    if (!mfaVerifyCode || !mfaFactorIdToVerify) return;
    setMfaError(null);
    setIsEnrollingMfa(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorIdToVerify });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({ factorId: mfaFactorIdToVerify, challengeId: challenge.data.id, code: mfaVerifyCode });
      if (verify.error) throw verify.error;
      
      const { data } = await supabase.auth.mfa.listFactors();
      if (data) setMfaFactors(data.all || []);
      setMfaFactorIdToVerify(null);
      setMfaQr(null);
      setMfaVerifyCode('');
    } catch (e: any) {
      setMfaError(e.message || "Failed to verify code.");
    } finally {
      setIsEnrollingMfa(false);
    }
  };

  const handleUnenrollMfa = async (factorId: string) => {
    setMfaError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMfaError(error.message);
      return;
    }
    const { data } = await supabase.auth.mfa.listFactors();
    if (data) setMfaFactors(data.all || []);
  };

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

  // Structured Support & Feedback Desk States
  interface FeedbackTicket {
    id: string;
    type: 'bug' | 'feature' | 'feedback';
    area: string;
    subject: string;
    message: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    admin_response?: string | null;
    responded_at?: string | null;
    created_at: string;
  }
  const [feedbackTab, setFeedbackTab] = useState<'submit' | 'history'>('submit');
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'feedback'>('feedback');
  const [feedbackArea, setFeedbackArea] = useState('Chat & Neural Search');
  const [feedbackSubject, setFeedbackSubject] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [userTickets, setUserTickets] = useState<FeedbackTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user]);

  const fetchUserTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await fetch('/api/user/feedback');
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        setUserTickets(data.tickets);
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'feedback') {
      fetchUserTickets();
    }
  }, [activeTab]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackSubject.trim() || !feedbackMessage.trim() || isSubmittingTicket) return;
    setIsSubmittingTicket(true);
    setTicketError(null);
    setTicketSuccess(null);

    const diagnostics = includeDiagnostics ? {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      theme,
      windowSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
      timestamp: new Date().toISOString(),
    } : undefined;

    try {
      const res = await fetch('/api/user/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          area: feedbackArea,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
          systemContext: diagnostics,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTicketSuccess(`Ticket #${data.ticket?.id ? data.ticket.id.slice(0, 8) : 'Created'} dispatched! Notification sent to our engineering team.`);
        setFeedbackSubject('');
        setFeedbackMessage('');
        if (data.ticket) {
          setUserTickets(prev => [data.ticket, ...prev]);
        }
      } else {
        setTicketError(data.error || 'Failed to submit feedback.');
      }
    } catch {
      setTicketError('Network error submitting feedback.');
    } finally {
      setIsSubmittingTicket(false);
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

  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'organization') {
      fetchOrgDetails();
    }
  }, [activeTab, user]);

  const safeParseJson = async (res: Response) => {
    try {
      const text = await res.text();
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const fetchOrgDetails = async () => {
    setIsFetchingOrg(true);
    setOrgError(null);
    try {
      const res = await fetch('/api/organization/details');
      const data = await safeParseJson(res);
      if (res.ok) {
        setOrgDetails(data);
        if (data.organization?.name) setOrgName(data.organization.name);
        if (typeof data.organization?.privacy_shield_enabled === 'boolean') setPrivacyShield(data.organization.privacy_shield_enabled);
      } else {
        if (res.status === 404) {
          setOrgDetails(null);
          setOrgError(null);
        } else {
          setOrgError(data.error || 'Failed to fetch organization details');
        }
      }
    } catch {
      setOrgError('Network error fetching organization details');
    } finally {
      setIsFetchingOrg(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || isCreatingOrg) return;
    setIsCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const res = await fetch('/api/organization/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName })
      });
      const data = await safeParseJson(res);
      if (res.ok && data.success && data.organization) {
        const createdOrg = data.organization;
        setNewOrgName('');
        setOrgName(createdOrg.name);
        setPrivacyShield(createdOrg.privacy_shield_enabled ?? true);
        setOrgDetails({
          organization: createdOrg,
          members: [
            {
              id: 'owner-member',
              user_id: user?.id || '',
              role: 'owner',
              joined_at: new Date().toISOString(),
              profile: { name: user?.name || 'Workspace Owner', avatar: '' }
            }
          ],
          invitations: []
        });
        updateUser({ accountType: 'organization', organizationId: createdOrg.id });
        fetchOrgDetails();
      } else {
        setCreateOrgError(data.error || 'Failed to create organization');
      }
    } catch {
      setCreateOrgError('Error creating organization space');
    } finally {
      setIsCreatingOrg(false);
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
      const data = await safeParseJson(res);
      if (res.ok) {
        setOrgDetails(prev => prev ? { ...prev, organization: data.organization } : null);
        setOrgSaveStatus('Organization settings saved successfully!');
      } else {
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
      const data = await safeParseJson(res);
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
    // Optimistically remove from state immediately
    setOrgDetails(prev => prev ? {
      ...prev,
      invitations: prev.invitations.filter(inv => inv.id !== id)
    } : null);

    try {
      const res = await fetch(`/api/organization/invite?id=${id}`, {
        method: 'DELETE'
      });
      const data = await safeParseJson(res);
      if (res.ok && data.success) {
        fetchOrgDetails();
      } else {
        alert(data.error || 'Failed to revoke invitation');
        fetchOrgDetails();
      }
    } catch {
      alert('Error revoking invitation');
      fetchOrgDetails();
    }
  };

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const handleRemoveMember = (member: OrgMember) => {
    const isSelf = member.user_id === user?.id;
    openConfirm({
      title: isSelf ? 'Leave Workspace?' : `Remove ${member.profile.name}?`,
      description: isSelf
        ? 'You will lose access to this organization workspace and its shared memories. Your account will revert to an individual account.'
        : `This will remove ${member.profile.name} from the organization workspace. They will lose access to the shared memory pool immediately.`,
      confirmLabel: isSelf ? 'Leave Workspace' : 'Remove Member',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setRemovingMemberId(member.id);
        // Optimistically remove member from list
        setOrgDetails(prev => prev ? {
          ...prev,
          members: prev.members.filter(m => m.id !== member.id)
        } : null);

        try {
          const res = await fetch(`/api/organization/members?memberId=${member.id}`, {
            method: 'DELETE'
          });
          const data = await safeParseJson(res);
          if (res.ok && data.success) {
            if (isSelf) {
              updateUser({ accountType: 'individual', organizationId: null });
              router.refresh();
            } else {
              fetchOrgDetails();
            }
          } else {
            alert(data.error || 'Failed to remove member');
            fetchOrgDetails();
          }
        } catch {
          alert('Network error removing member');
          fetchOrgDetails();
        } finally {
          setRemovingMemberId(null);
        }
      }
    });
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 3000);
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
    if (displayName === user?.name && fullName === (user?.fullName || '') && pronouns === (user?.pronouns || '')) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const result = await updateUser({ name: displayName, fullName, pronouns });
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
            <div className={styles.tabList} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Group 1: PERSONAL IDENTITY */}
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 700, marginBottom: '8px', paddingLeft: '6px' }}>Personal Identity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabActive : ''}`} onClick={() => setActiveTab('profile')}>Profile Details</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'security' ? styles.tabActive : ''}`} onClick={() => setActiveTab('security')}>Secure Access</button>
                </div>
              </div>

              {/* Group 2: AGENT BEHAVIOR */}
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 700, marginBottom: '8px', paddingLeft: '6px' }}>Agent Behavior</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button className={`${styles.tabBtn} ${activeTab === 'tuning' ? styles.tabActive : ''}`} onClick={() => setActiveTab('tuning')}>Sensitivity</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'privacy' ? styles.tabActive : ''}`} onClick={() => setActiveTab('privacy')}>Privacy Shields</button>
                </div>
              </div>

              {/* Group 3: APP EXPERIENCE */}
              <div>
                <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 700, marginBottom: '8px', paddingLeft: '6px' }}>App Experience</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button className={`${styles.tabBtn} ${activeTab === 'theme' ? styles.tabActive : ''}`} onClick={() => setActiveTab('theme')}>Interface Theme</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'notifications' ? styles.tabActive : ''}`} onClick={() => setActiveTab('notifications')}>Notifications</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'feedback' ? styles.tabActive : ''}`} onClick={() => setActiveTab('feedback')}>Feedback & Support</button>
                </div>
              </div>

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
                    <label>FULL LEGAL NAME</label>
                    <input 
                      id="full-name"
                      name="fullName"
                      type="text"
                      placeholder="e.g. ChandraMohan"
                      value={fullName} 
                      onChange={(e) => setFullName(e.target.value)}
                      className={styles.input} 
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>PRONOUNS</label>
                    <input 
                      id="pronouns"
                      name="pronouns"
                      type="text"
                      placeholder="e.g. He/Him, She/Her, They/Them"
                      value={pronouns} 
                      onChange={(e) => setPronouns(e.target.value)}
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
                          background: gdprConsent ? 'var(--text-primary)' : 'var(--bg-secondary)',
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
                    <h3>Two-Factor Authentication (MFA)</h3>
                    <p className={styles.fieldDesc}>Add an extra layer of security to your account using an authenticator app.</p>
                    
                    {mfaError && <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '8px' }}>{mfaError}</p>}
                    
                    {mfaFactors.filter(f => f.status === 'verified').length > 0 ? (
                      <div style={{ marginTop: '16px' }}>
                        <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Two-Factor Authentication is active.</p>
                        {mfaFactors.filter(f => f.status === 'verified').map(f => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Authenticator App (Added {new Date(f.created_at).toLocaleDateString()})</span>
                            <button onClick={() => handleUnenrollMfa(f.id)} className={styles.dangerBtnOutline} style={{ padding: '4px 8px', fontSize: '12px' }}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : mfaFactorIdToVerify && mfaQr ? (
                      <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Scan this QR code</h4>
                        <p className={styles.fieldDesc} style={{ marginBottom: '16px' }}>Use an authenticator app like Google Authenticator or Authy to scan this code.</p>
                        <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'inline-block', marginBottom: '16px' }}>
                          <QRCodeSVG value={mfaQr} size={150} />
                        </div>
                        <div>
                          <input 
                            type="text" 
                            placeholder="Enter 6-digit code" 
                            value={mfaVerifyCode}
                            onChange={e => setMfaVerifyCode(e.target.value)}
                            className={styles.input}
                            style={{ maxWidth: '200px', display: 'inline-block', marginRight: '12px' }}
                          />
                          <button onClick={handleVerifyMfa} disabled={isEnrollingMfa || mfaVerifyCode.length !== 6} className={styles.saveBtn} style={{ width: 'auto', padding: '10px 16px' }}>
                            {isEnrollingMfa ? 'Verifying...' : 'Verify Setup'}
                          </button>
                          <button onClick={() => { setMfaFactorIdToVerify(null); setMfaQr(null); }} className={styles.dangerBtnOutline} style={{ marginLeft: '12px', border: 'none' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={handleEnrollMfa} disabled={isEnrollingMfa} className={styles.saveBtn} style={{ marginTop: '16px', width: 'auto', padding: '10px 16px' }}>
                        {isEnrollingMfa ? 'Setting up...' : 'Setup Authenticator App'}
                      </button>
                    )}
                  </div>
                  

                  
                  <div className={styles.divider} style={{ margin: '32px 0' }} />

                  <div className={styles.dangerZone}>
                    <h3>Data Archive</h3>
                    
                    <div className={styles.dangerAction}>
                      <div>
                        <strong>Purge Data Archive</strong>
                        <p>Delete all synchronized data.</p>
                        {wipeError && <p style={{ color: 'var(--text-primary)', fontSize: '12px', marginTop: '4px' }}>{wipeError}</p>}
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
                        {deleteError && <p style={{ color: 'var(--text-primary)', fontSize: '12px', marginTop: '4px' }}>{deleteError}</p>}
                      </div>
                      <button className={styles.dangerBtn} onClick={handleDeleteAccount}>Delete Account</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className={styles.securitySection}>
                  <div className={styles.securityInfo}>
                    <h3>Web Push Notifications</h3>
                    <p className={styles.fieldDesc}>Receive native desktop/mobile alerts when background tasks finish or security events occur.</p>
                    {pushMessage && <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '8px' }}>{pushMessage}</p>}
                    
                    {isPushEnabled ? (
                      <div style={{ marginTop: '16px' }}>
                        <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Push Notifications are active on this device.</p>
                        <button onClick={handleTestWebPush} className={styles.saveBtn} style={{ marginTop: '12px', width: 'auto', padding: '10px 16px' }}>
                          Send Test Notification
                        </button>
                      </div>
                    ) : (
                      <button onClick={handleEnableWebPush} disabled={isPushSubscribing} className={styles.saveBtn} style={{ marginTop: '16px', width: 'auto', padding: '10px 16px' }}>
                        {isPushSubscribing ? 'Enabling...' : 'Enable Notifications'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'feedback' && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Support & Feedback Center
                      </h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Submit bug reports, feature requests, or direct feedback. Our engineering team reviews and responds directly.
                      </p>
                    </div>

                    {/* Sub-tabs navigation */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setFeedbackTab('submit')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: feedbackTab === 'submit' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          borderBottom: feedbackTab === 'submit' ? '2px solid var(--text-primary)' : '2px solid transparent',
                          paddingBottom: '4px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Submit Ticket
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFeedbackTab('history'); fetchUserTickets(); }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: feedbackTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          borderBottom: feedbackTab === 'history' ? '2px solid var(--text-primary)' : '2px solid transparent',
                          paddingBottom: '4px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        My Submissions {userTickets.length > 0 ? `(${userTickets.length})` : ''}
                      </button>
                    </div>
                  </div>

                  {ticketSuccess && (
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>{ticketSuccess}</span>
                      <button 
                        onClick={() => setFeedbackTab('history')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                      >
                        View in My Submissions →
                      </button>
                    </div>
                  )}

                  {ticketError && (
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '16px'
                    }}>
                      {ticketError}
                    </div>
                  )}

                  {feedbackTab === 'submit' ? (
                    <form onSubmit={handleSubmitTicket} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      {/* Category Selection */}
                      <div>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Ticket Category
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {[
                            { id: 'feedback', label: 'Feedback' },
                            { id: 'bug', label: 'Bug Report' },
                            { id: 'feature', label: 'Feature Request' },
                          ].map(item => {
                            const active = feedbackType === item.id;
                            return (
                              <button
                                type="button"
                                key={item.id}
                                onClick={() => setFeedbackType(item.id as 'bug' | 'feature' | 'feedback')}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '20px',
                                  border: active ? '1px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                                  background: active ? 'var(--text-primary)' : 'var(--bg-secondary)',
                                  color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Area Selection & Subject */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Area
                          </label>
                          <select
                            value={feedbackArea}
                            onChange={(e) => setFeedbackArea(e.target.value)}
                            style={{
                              width: '100%',
                              height: '42px',
                              padding: '0 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              outline: 'none',
                              appearance: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="Chat & Neural Search">Chat & Neural Search</option>
                            <option value="Connectors & Ingestion">Connectors & Ingestion</option>
                            <option value="Action Queue">Action Queue</option>
                            <option value="Privacy & Security">Privacy & Security</option>
                            <option value="UI & Aesthetics">UI & Aesthetics</option>
                            <option value="General System">General System</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Subject
                          </label>
                          <input
                            type="text"
                            placeholder="Brief summary of the issue or idea..."
                            value={feedbackSubject}
                            onChange={(e) => setFeedbackSubject(e.target.value)}
                            required
                            style={{
                              width: '100%',
                              height: '42px',
                              padding: '0 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-subtle)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>

                      {/* Detailed Message */}
                      <div>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          Details & Observations
                        </label>
                        <textarea
                          rows={4}
                          placeholder="Describe what happened, steps to reproduce, or why this feature would help you..."
                          value={feedbackMessage}
                          onChange={(e) => setFeedbackMessage(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Diagnostics toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={includeDiagnostics}
                          onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                        />
                        <span>Attach diagnostic context (browser info, theme, timestamp) to help engineers resolve faster</span>
                      </label>

                      {/* Submit button */}
                      <div style={{ marginTop: '8px' }}>
                        <button
                          type="submit"
                          disabled={isSubmittingTicket || !feedbackSubject.trim() || !feedbackMessage.trim()}
                          style={{
                            width: '100%',
                            background: 'var(--text-primary)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '12px 24px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: isSubmittingTicket ? 'not-allowed' : 'pointer',
                            opacity: isSubmittingTicket || !feedbackSubject.trim() || !feedbackMessage.trim() ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSubmittingTicket ? 'Dispatching Ticket...' : 'Submit Feedback & Dispatch Ticket'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* My Submissions / Ticket History */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {loadingTickets ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          Loading your submitted tickets...
                        </div>
                      ) : userTickets.length === 0 ? (
                        <div style={{
                          padding: '40px 20px',
                          textAlign: 'center',
                          background: 'rgba(0,0,0,0.02)',
                          border: '1px dashed var(--border)',
                          borderRadius: '12px',
                        }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>No tickets submitted yet</div>
                          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '6px auto 16px' }}>
                            Any bugs, suggestions, or questions you submit will appear here with live resolution status and developer answers.
                          </p>
                          <button
                            type="button"
                            onClick={() => setFeedbackTab('submit')}
                            style={{
                              background: 'var(--text-primary)',
                              color: 'var(--bg-primary)',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Submit Your First Ticket
                          </button>
                        </div>
                      ) : (
                        userTickets.map((ticket) => (
                          <div
                            key={ticket.id}
                            style={{
                              padding: '16px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-primary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                   padding: '3px 8px',
                                   borderRadius: '12px',
                                   fontSize: '11px',
                                   fontWeight: 700,
                                   background: 'var(--bg-secondary)',
                                   color: 'var(--text-primary)',
                                }}>
                                  {ticket.status.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  #{ticket.id.slice(0, 8)} · {ticket.area}
                                </span>
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {new Date(ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {ticket.subject}
                            </div>

                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                              {ticket.message}
                            </div>

                            {/* Developer Reply Card */}
                            {ticket.admin_response && (
                              <div style={{
                                marginTop: '8px',
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: 'var(--bg-secondary)',
                                borderLeft: '3px solid var(--text-primary)',
                              }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                  Developer Response {ticket.responded_at ? `(${new Date(ticket.responded_at).toLocaleDateString()})` : ''}:
                                </div>
                                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                  {ticket.admin_response}
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
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
