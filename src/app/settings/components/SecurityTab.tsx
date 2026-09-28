import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../settings.module.css';

export default function SecurityTab() {
  const router = useRouter();
  const { supabase } = useAuth();
  const { openConfirm } = useConfirm();

  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaFactorIdToVerify, setMfaFactorIdToVerify] = useState<string | null>(null);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [isEnrollingMfa, setIsEnrollingMfa] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [wipeError, setWipeError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFactors = async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!error && data) setMfaFactors(data.all || []);
    };
    fetchFactors();
  }, [supabase]);

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
  );
}
