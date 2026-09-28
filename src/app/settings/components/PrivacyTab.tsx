import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from '../settings.module.css';

export default function PrivacyTab() {
  const { updateUser } = useAuth();
  const [gdprConsent, setGdprConsent] = useState(true);
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [newSender, setNewSender] = useState('');
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
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
        body: JSON.stringify({ excludedSenders, gdprConsent }),
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

  return (
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

      {settingsSaved && (
        <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
      )}
      <button className={styles.saveBtn} onClick={handleSaveSettings}>
        Save Privacy Settings
      </button>
    </div>
  );
}
