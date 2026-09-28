import { useState, useEffect } from 'react';
import styles from '../settings.module.css';

export default function NotificationsTab() {
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

  return (
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
  );
}
