import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from '../settings.module.css';

export default function ProfileTab() {
  const { user, updateUser } = useAuth();
  
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.name && !displayName) setDisplayName(user.name);
      if (user.fullName && !fullName) setFullName(user.fullName);
      if (user.pronouns && !pronouns) setPronouns(user.pronouns);
    }
  }, [user]);

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

  return (
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
  );
}
