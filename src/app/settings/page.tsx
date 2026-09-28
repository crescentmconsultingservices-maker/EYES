'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';

import ProfileTab from './components/ProfileTab';
import TuningTab from './components/TuningTab';
import PrivacyTab from './components/PrivacyTab';
import ThemeTab from './components/ThemeTab';
import FeedbackTab from './components/FeedbackTab';
import NotificationsTab from './components/NotificationsTab';
import SecurityTab from './components/SecurityTab';
import OrganizationTab from './components/OrganizationTab';

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security' | 'notifications' | 'theme' | 'feedback' | 'organization'>('profile');

  // If the user has an organization account, they might want to see the organization tab.
  // We can just leave it as an accessible tab.

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
                  <button className={`${styles.tabBtn} ${activeTab === 'organization' ? styles.tabActive : ''}`} onClick={() => setActiveTab('organization')}>Workspace Settings</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'feedback' ? styles.tabActive : ''}`} onClick={() => setActiveTab('feedback')}>Feedback & Support</button>
                </div>
              </div>

            </div>

            {/* Tab Content */}
            <div className={styles.panel}>
              {activeTab === 'profile' && <ProfileTab />}
              {activeTab === 'tuning' && <TuningTab />}
              {activeTab === 'privacy' && <PrivacyTab />}
              {activeTab === 'theme' && <ThemeTab />}
              {activeTab === 'security' && <SecurityTab />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'feedback' && <FeedbackTab />}
              {activeTab === 'organization' && <OrganizationTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
