import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from '../settings.module.css';

export default function TuningTab() {
  const { updateUser } = useAuth();
  
  const [riskSensitivity, setRiskSensitivity] = useState('MEDIUM');
  const [syncDepth, setSyncDepth] = useState('balanced');
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [gdprConsent, setGdprConsent] = useState(true);
  const [newSender, setNewSender] = useState('');
  
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

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

  return (
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
              className={\`\${styles.levelBtn} \${riskSensitivity === level ? styles.levelBtnActive : ''}\`}
            >
              {level}
            </button>
          ))}
        </div>
        <p className={styles.fieldDesc}>Adjust how aggressively the system flags potential risks.</p>
      </div>

      <div className={styles.fieldGroup}>
        <label>SYNC DEPTH</label>
        <select value={syncDepth} onChange={(e) => setSyncDepth(e.target.value)} className={styles.input}>
          <option value="shallow">Shallow (Last 30 Days)</option>
          <option value="balanced">Balanced (Last 6 Months)</option>
          <option value="deep">Deep Archive (All Time)</option>
        </select>
        <p className={styles.fieldDesc}>Determines how far back new platform integrations will sync data.</p>
      </div>

      <div className={styles.fieldGroup}>
        <label>EXCLUDED DOMAINS & SENDERS</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input 
            type="text" 
            placeholder="e.g. alerts@github.com" 
            value={newSender}
            onChange={(e) => setNewSender(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSender.trim()) {
                if (!excludedSenders.includes(newSender.trim().toLowerCase())) {
                  setExcludedSenders(prev => [...prev, newSender.trim().toLowerCase()]);
                }
                setNewSender('');
              }
            }}
            className={styles.input} 
          />
          <button 
            className={styles.addBtn}
            onClick={() => {
              if (newSender.trim() && !excludedSenders.includes(newSender.trim().toLowerCase())) {
                setExcludedSenders(prev => [...prev, newSender.trim().toLowerCase()]);
                setNewSender('');
              }
            }}
          >
            Add
          </button>
        </div>
        <div className={styles.chipContainer}>
          {excludedSenders.map(sender => (
            <span key={sender} className={styles.chip}>
              {sender}
              <button onClick={() => setExcludedSenders(prev => prev.filter(s => s !== sender))} className={styles.chipRemove}>×</button>
            </span>
          ))}
          {excludedSenders.length === 0 && <span style={{ color: 'var(--ink-faint)', fontSize: '13px' }}>No exclusions active.</span>}
        </div>
        <p className={styles.fieldDesc}>Data from these sources will be ignored during synchronization.</p>
      </div>

      {settingsSaved && <p className={settingsSaved.includes('Error') || settingsSaved.includes('Failed') ? styles.errorText : styles.successText}>{settingsSaved}</p>}

      <button className={styles.saveBtn} onClick={handleSaveSettings}>Save Agent Settings</button>
    </div>
  );
}
