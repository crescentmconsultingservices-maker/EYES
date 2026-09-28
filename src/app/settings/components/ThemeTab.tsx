import { useAuth } from '@/context/AuthContext';
import styles from '../settings.module.css';

export default function ThemeTab() {
  const { theme, setGlobalTheme } = useAuth();

  return (
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
  );
}
