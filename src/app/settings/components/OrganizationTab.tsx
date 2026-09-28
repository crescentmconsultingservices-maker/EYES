import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import styles from '../settings.module.css';

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

export default function OrganizationTab() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { openConfirm } = useConfirm();

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
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchOrgDetails();
  }, [user]);

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

  if (isFetchingOrg && !orgDetails) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading organization details...</div>;
  }

  if (orgError && !orgDetails) {
    return (
      <div style={{ padding: '20px', background: 'rgba(255,50,50,0.1)', color: 'var(--text-primary)', borderRadius: '8px' }}>
        <p>Error loading workspace: {orgError}</p>
        <button onClick={fetchOrgDetails} className={styles.saveBtn} style={{ marginTop: '10px' }}>Retry</button>
      </div>
    );
  }

  if (!orgDetails) {
    return (
      <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Create an Organization Workspace</h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.5 }}>
            Upgrade to a shared workspace to pool memory indices across your team. Everyone in the workspace can search across shared documents, chats, and codebases seamlessly.
          </p>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="e.g. Acme Corp" 
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              className={styles.input}
              style={{ maxWidth: '240px' }}
            />
            <button 
              onClick={handleCreateOrg} 
              disabled={isCreatingOrg || !newOrgName.trim()} 
              className={styles.saveBtn}
              style={{ width: 'auto', padding: '0 24px' }}
            >
              {isCreatingOrg ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
          {createOrgError && <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginTop: '12px' }}>{createOrgError}</p>}
        </div>
      </div>
    );
  }

  const isOwnerOrAdmin = orgDetails.members.find(m => m.user_id === user?.id)?.role !== 'member';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Settings Panel */}
      <div className={styles.securitySection} style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Workspace Settings</h3>
        <p className={styles.fieldDesc} style={{ marginBottom: '20px' }}>Manage your organization identity and global privacy controls.</p>
        
        <div className={styles.fieldGroup}>
          <label>WORKSPACE NAME</label>
          <input 
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            disabled={!isOwnerOrAdmin}
            className={styles.input}
          />
        </div>

        <div className={styles.fieldGroup} style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label>ORGANIZATION PRIVACY SHIELD</label>
              <p className={styles.fieldDesc} style={{ maxWidth: '90%' }}>
                When enabled, data ingested by any member of this workspace will automatically be excluded from global AI model training across all providers (OpenAI, Anthropic, Mistral). This enforces zero-retention policies globally.
              </p>
            </div>
            <div 
              onClick={() => isOwnerOrAdmin && setPrivacyShield(!privacyShield)}
              style={{
                width: '40px',
                height: '24px',
                background: privacyShield ? 'var(--text-primary)' : 'var(--bg-secondary)',
                borderRadius: '12px',
                position: 'relative',
                cursor: isOwnerOrAdmin ? 'pointer' : 'not-allowed',
                opacity: isOwnerOrAdmin ? 1 : 0.6,
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

        {isOwnerOrAdmin && (
          <div style={{ marginTop: '24px' }}>
            {orgSaveStatus && <p className={orgSaveStatus.includes('success') ? styles.successText : styles.errorText} style={{ marginBottom: '12px' }}>{orgSaveStatus}</p>}
            <button className={styles.saveBtn} onClick={handleSaveOrgSettings} disabled={isSavingOrg}>
              {isSavingOrg ? 'Saving...' : 'Save Workspace Settings'}
            </button>
          </div>
        )}
      </div>

      {/* Team Management */}
      <div className={styles.securitySection} style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Team Members</h3>
            <p className={styles.fieldDesc}>Manage access and roles for your shared memory index.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          {orgDetails.members.map(member => (
            <div key={member.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
                  {member.profile.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {member.profile.name || 'Unknown User'} 
                    {member.user_id === user?.id && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 400 }}>(You)</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{member.role}</div>
                </div>
              </div>

              {(isOwnerOrAdmin || member.user_id === user?.id) && member.role !== 'owner' && (
                <button 
                  onClick={() => handleRemoveMember(member)}
                  disabled={removingMemberId === member.id}
                  className={styles.dangerBtnOutline} 
                  style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
                >
                  {removingMemberId === member.id ? 'Removing...' : (member.user_id === user?.id ? 'Leave' : 'Remove')}
                </button>
              )}
            </div>
          ))}
        </div>

        {isOwnerOrAdmin && (
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Pending Invitations</h4>
            {orgDetails.invitations.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '24px' }}>No pending invitations.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {orgDetails.invitations.map(inv => (
                  <div key={inv.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--border)', borderRadius: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{inv.email}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Invited as {inv.role}</div>
                    </div>
                    <button 
                      onClick={() => handleRevokeInvitation(inv.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Invite New Member</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>EMAIL ADDRESS</label>
                  <input 
                    type="email" 
                    placeholder="colleague@company.com" 
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>ROLE</label>
                  <select 
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as any)}
                    className={styles.input}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button 
                  onClick={handleInviteMember}
                  disabled={isInviting || !inviteEmail}
                  className={styles.saveBtn}
                  style={{ width: 'auto', padding: '0 20px', height: '42px' }}
                >
                  {isInviting ? 'Sending...' : 'Generate Invite'}
                </button>
              </div>

              {inviteStatus && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px'
                }}>
                  <span style={{ color: inviteStatus.includes('Error') || inviteStatus.includes('Failed') ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {inviteStatus}
                  </span>
                  
                  {inviteStatus.includes('http') && (
                    <button 
                      onClick={() => handleCopyLink(inviteStatus.split(': ')[1])}
                      style={{ 
                        background: 'var(--text-primary)', 
                        color: 'var(--bg-primary)', 
                        border: 'none', 
                        padding: '4px 12px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
