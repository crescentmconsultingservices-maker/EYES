'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './invite.module.css';
import EyesLogo from '@/components/common/EyesLogo';

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, isLoading: isAuthLoading, updateUser, supabase } = useAuth();

  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing invitation link.");
    }
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    
    if (!user) {
      // Not logged in, save token and redirect to signup
      sessionStorage.setItem('pending_invite_token', token);
      router.push(`/signup`);
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/organization/invite/accept', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ token })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        await updateUser({ accountType: 'organization', organizationId: data.organizationId });
        // Redirect to dashboard after brief success state
        setTimeout(() => {
          router.push('/iris');
        }, 2000);
      } else {
        setError(data.error || "Failed to accept invitation.");
      }
    } catch (err) {
      setError("Network error. Could not connect to servers.");
    } finally {
      setIsAccepting(false);
    }
  };

  if (isAuthLoading) {
    return <div className={styles.container}><div className={styles.neuralBg} /></div>;
  }

  return (
    <div className={styles.container}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      
      <div className={styles.neuralBg} />

      <div className={styles.card}>
        <div style={{ marginBottom: '32px' }}>
          <EyesLogo width={100} height={24} />
        </div>

        <div className={styles.iconWrapper}>
          🤝
        </div>

        {success ? (
          <>
            <h1 className={styles.title}>Welcome to the Workspace</h1>
            <p className={styles.subtitle}>
              Your intelligence feed has been synchronized. Booting IRIS...
            </p>
            <div style={{ margin: '20px 0' }} className={styles.loader} />
          </>
        ) : (
          <>
            <h1 className={styles.title}>You&apos;ve been invited</h1>
            <p className={styles.subtitle}>
              Join a secure Enterprise workspace to collaborate on intelligence, share actions, and build a unified cognitive graph.
            </p>

            {error && (
              <div className={styles.errorBox}>
                {error}
              </div>
            )}

            <button 
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleAccept}
              disabled={isAccepting || !token}
            >
              {isAccepting ? (
                <div className={styles.loader} />
              ) : user ? (
                'Accept & Join Workspace'
              ) : (
                'Log In to Accept'
              )}
            </button>
            
            {user && (
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => router.push('/')}
              >
                Decline & Go Home
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
