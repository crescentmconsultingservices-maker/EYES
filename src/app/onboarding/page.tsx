'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import styles from './onboarding.module.css';

const ROLES = [
  { id: 'engineering', label: 'Engineering', icon: '💻' },
  { id: 'product', label: 'Product', icon: '📱' },
  { id: 'marketing', label: 'Marketing', icon: '📈' },
  { id: 'sales', label: 'Sales', icon: '🤝' },
  { id: 'executive', label: 'Executive', icon: '👔' },
  { id: 'design', label: 'Design', icon: '🎨' },
];

const GOALS = [
  { id: 'action_items', label: 'Auto-extract Action Items' },
  { id: 'missed_messages', label: 'Catch Urgent Messages I Missed' },
  { id: 'daily_summary', label: 'Get Daily Briefs & Summaries' },
  { id: 'search', label: 'Search Across All My Apps' },
];

const PERSONAS = [
  {
    id: 'brief',
    title: 'Direct & Brief ⚡',
    desc: 'Just the facts. Bullet points and bottom-line summaries.'
  },
  {
    id: 'analytical',
    title: 'Detailed & Analytical 🧠',
    desc: 'Deep dives. Give me the full context and reasoning.'
  }
];

const ROLE_CONNECTORS: Record<string, { id: string, label: string, icon: string }[]> = {
  engineering: [
    { id: 'github', label: 'GitHub', icon: '🐙' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ],
  product: [
    { id: 'notion', label: 'Notion', icon: '📓' },
    { id: 'linear', label: 'Linear', icon: '⚡' },
  ],
  marketing: [
    { id: 'twitter', label: 'X (Twitter)', icon: '🐦' },
    { id: 'notion', label: 'Notion', icon: '📓' },
  ],
  sales: [
    { id: 'google', label: 'Google Workspace', icon: '📧' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ],
  executive: [
    { id: 'google', label: 'Google Workspace', icon: '📧' },
    { id: 'notion', label: 'Notion', icon: '📓' },
  ],
  design: [
    { id: 'canva', label: 'Canva', icon: '🎨' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ]
};

const ORGANIZATION_CONNECTORS = [
  { id: 'slack', label: 'Slack Workspace', icon: '💬' },
  { id: 'github', label: 'GitHub Organization', icon: '🐙' },
  { id: 'google', label: 'Google Workspace', icon: '📧' },
  { id: 'notion', label: 'Notion Workspace', icon: '📓' },
  { id: 'discord', label: 'Discord Server', icon: '🎮' },
];

export default function SandboxOnboarding() {
  const { supabase, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<'individual' | 'organization' | null>(null);
  const [orgName, setOrgName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [corporateDomain, setCorporateDomain] = useState<string | null>(null);
  const [detectedOrgInfo, setDetectedOrgInfo] = useState<{
    isPublicEmail: boolean;
    detectedDomain: string | null;
    existingOrg: { id: string; name: string; domain?: string; logo?: string } | null;
    suggestedName: string | null;
    logo?: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id?: string; name: string; domain?: string; logo?: string; isRegistered: boolean }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Domain Detection on Mount
  React.useEffect(() => {
    const checkDomain = async () => {
      try {
        const res = await fetch('/api/organization/detect');
        if (res.ok) {
          const data = await res.json();
          setDetectedOrgInfo(data);
          if (data.existingOrg) {
            setSelectedOrgId(data.existingOrg.id);
            setOrgName(data.existingOrg.name);
            if (data.existingOrg.domain) setCorporateDomain(data.existingOrg.domain);
          } else if (data.suggestedName) {
            setOrgName(data.suggestedName);
            if (data.detectedDomain) setCorporateDomain(data.detectedDomain);
          }
        }
      } catch {
        // Fallback gracefully
      }
    };
    checkDomain();
  }, []);

  // Handle Autocomplete Search
  const handleOrgSearch = async (val: string) => {
    setOrgName(val);
    setSelectedOrgId(null);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setShowSuggestions(true);
    try {
      const res = await fetch(`/api/organization/detect?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      setSuggestions([]);
    }
  };

  React.useEffect(() => {
    const savedStep = localStorage.getItem('onboarding_step');
    if (savedStep) setStep(parseInt(savedStep, 10));
    const savedAccountType = localStorage.getItem('onboarding_account_type');
    if (savedAccountType) setAccountType(savedAccountType as 'individual' | 'organization');
    const savedOrgName = localStorage.getItem('onboarding_org_name');
    if (savedOrgName) setOrgName(savedOrgName);
    const role = localStorage.getItem('onboarding_role');
    if (role) setSelectedRole(role);
    const goals = localStorage.getItem('onboarding_goals');
    if (goals) setSelectedGoals(JSON.parse(goals));
    const persona = localStorage.getItem('onboarding_persona');
    if (persona) setSelectedPersona(persona);

    if (sessionStorage.getItem('eyes-post-connect')) {
       sessionStorage.removeItem('eyes-post-connect');
       if (!savedStep || savedStep === '1') setStep(3);
    }
    sessionStorage.setItem('eyes-is-onboarding', 'true');
    
    const fetchConnections = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.from('oauth_tokens').select('platform').eq('user_id', session.user.id);
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setConnectedPlatforms(data.map((d: any) => d.platform));
      }
    };
    fetchConnections();
  }, [supabase]);

  React.useEffect(() => { localStorage.setItem('onboarding_step', step.toString()); }, [step]);
  React.useEffect(() => { if (accountType) localStorage.setItem('onboarding_account_type', accountType); }, [accountType]);
  React.useEffect(() => { localStorage.setItem('onboarding_org_name', orgName); }, [orgName]);
  React.useEffect(() => { if (selectedRole) localStorage.setItem('onboarding_role', selectedRole); }, [selectedRole]);
  React.useEffect(() => { localStorage.setItem('onboarding_goals', JSON.stringify(selectedGoals)); }, [selectedGoals]);
  React.useEffect(() => { if (selectedPersona) localStorage.setItem('onboarding_persona', selectedPersona); }, [selectedPersona]);

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev => 
      prev.includes(id) 
        ? prev.filter(g => g !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();

  const handleNext = async () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      try {
        setIsSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) throw new Error('No auth token found locally');

        const res = await fetch('/api/user/onboarding', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ 
            role: selectedRole, 
            goals: selectedGoals, 
            persona: selectedPersona,
            accountType,
            organizationName: accountType === 'organization' ? orgName : undefined,
            existingOrgId: accountType === 'organization' ? selectedOrgId : undefined,
            corporateDomain: accountType === 'organization' ? corporateDomain : undefined
          })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API Error: ${res.status} - ${text}`);
        }
        
        // Clear local caches
        localStorage.removeItem('onboarding_step');
        localStorage.removeItem('onboarding_account_type');
        localStorage.removeItem('onboarding_org_name');
        localStorage.removeItem('onboarding_role');
        localStorage.removeItem('onboarding_goals');
        localStorage.removeItem('onboarding_persona');
        localStorage.removeItem('eyes-user-profile-v1');
        sessionStorage.removeItem('eyes-is-onboarding');

        // Smooth transition driven organically by AuthContext state
        await updateUser({ onboardingCompleted: true, accountType: accountType || undefined });
        if (accountType === 'organization') {
          router.replace('/iris');
        } else {
          router.replace('/');
        }
      } catch (err: any) {
        console.error('Save failed:', err);
        alert(err?.message || 'Failed to save preferences. Please check your network connection and try again.');
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const isNextDisabled = () => {
    if (step === 1) return !accountType || (accountType === 'organization' && !orgName.trim());
    if (step === 2) return !selectedRole;
    if (step === 4) return selectedGoals.length === 0;
    if (step === 5) return !selectedPersona;
    return false;
  };

  const progress = (step / 5) * 100;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1_account_type"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>Choose your Sanctum Type</h1>
                <p className={styles.subtitle}>Select the environment you want to create.</p>
              </div>

              <div className={styles.personaGrid}>
                <div
                  className={`${styles.personaCard} ${accountType === 'individual' ? styles.selected : ''}`}
                  onClick={() => setAccountType('individual')}
                >
                  <h3 className={styles.personaTitle}>👤 Individual</h3>
                  <p className={styles.personaDesc}>Monitor your personal digital footprint, search private chats, files, and mail.</p>
                </div>
                <div
                  className={`${styles.personaCard} ${accountType === 'organization' ? styles.selected : ''}`}
                  onClick={() => setAccountType('organization')}
                >
                  <h3 className={styles.personaTitle}>🏢 Organization</h3>
                  <p className={styles.personaDesc}>Secure team workspaces, audit company Slack & GitHub, and protect corporate IP.</p>
                </div>
              </div>

              {accountType === 'organization' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}
                >
                  {detectedOrgInfo?.existingOrg && (
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid #6366f1',
                      borderRadius: '10px',
                      color: '#1D1C16',
                      fontSize: '13.5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <strong>Team Workspace Found!</strong>
                        <div style={{ fontSize: '12px', color: '#555' }}>
                          Join <strong>{detectedOrgInfo.existingOrg.name}</strong> ({detectedOrgInfo.existingOrg.domain})
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', background: '#fff', padding: '4px 8px', borderRadius: '6px' }}>
                        AUTO-DETECTED
                      </span>
                    </div>
                  )}

                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1D1C16' }}>Organization Name</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => handleOrgSearch(e.target.value)}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="Type or search company (e.g. Stripe, Acme Corp)"
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        border: '2px solid #EAEAEA',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        backgroundColor: 'white',
                        color: '#1D1C16'
                      }}
                    />

                    {showSuggestions && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: '#ffffff',
                        border: '1px solid #EAEAEA',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        zIndex: 50,
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}>
                        {suggestions.map((s, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setOrgName(s.name);
                              if (s.id) setSelectedOrgId(s.id);
                              if (s.domain) setCorporateDomain(s.domain);
                              setShowSuggestions(false);
                            }}
                            style={{
                              padding: '10px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              borderBottom: idx < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                              backgroundColor: '#fff'
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {s.logo ? (
                                <img src={s.logo} alt={s.name} style={{ width: '20px', height: '20px', borderRadius: '4px' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                              ) : (
                                <span>🏢</span>
                              )}
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#1D1C16' }}>{s.name}</div>
                                {s.domain && <div style={{ fontSize: '11px', color: '#666' }}>{s.domain}</div>}
                              </div>
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: 600, color: s.isRegistered ? '#10b981' : '#6b7280' }}>
                              {s.isRegistered ? 'REGISTERED' : 'SUGGESTED'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2_role"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>What is your primary domain?</h1>
                <p className={styles.subtitle}>This helps us prioritize the right data for you.</p>
              </div>

              <div className={styles.grid}>
                {ROLES.map(role => (
                  <div
                    key={role.id}
                    className={`${styles.optionCard} ${selectedRole === role.id ? styles.selected : ''}`}
                    onClick={() => setSelectedRole(role.id)}
                  >
                    <span className={styles.icon}>{role.icon}</span>
                    <span className={styles.label}>{role.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3_connectors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>
                  {accountType === 'organization' ? 'Connect Organization Tools' : 'Connect your main tools'}
                </h1>
                <p className={styles.subtitle}>
                  {accountType === 'organization'
                    ? 'Connect enterprise-wide workspace tools to build your team memory pool.'
                    : "Let's start indexing your digital life securely in the background."}
                </p>
              </div>

              <div className={styles.grid}>
                {(accountType === 'organization'
                  ? ORGANIZATION_CONNECTORS
                  : (selectedRole && ROLE_CONNECTORS[selectedRole]) || ORGANIZATION_CONNECTORS
                ).map(conn => {
                  const isConnected = connectedPlatforms.includes(conn.id);
                  return (
                  <button
                    key={conn.id}
                    className={`${styles.optionCard}`}
                    style={{ 
                      justifyContent: 'center', 
                      gap: '8px',
                      cursor: isConnected ? 'default' : 'pointer',
                      border: isConnected ? '1px solid #4ade80' : undefined,
                      background: isConnected ? 'rgba(74, 222, 128, 0.05)' : undefined 
                    }}
                    onClick={() => { if (!isConnected) window.location.href = `/api/connect/${conn.id}/start`; }}
                  >
                    <span className={styles.icon}>{isConnected ? '✓' : conn.icon}</span>
                    <span className={styles.label} style={{ color: isConnected ? '#15803d' : undefined }}>
                      {isConnected ? 'Connected' : `Connect ${conn.label}`}
                    </span>
                  </button>
                  );
                })}
              </div>
              <p style={{ marginTop: '24px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                You can always connect more tools later. Feel free to connect one and click Continue.
              </p>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4_goals"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>What do you want EYES to do?</h1>
                <p className={styles.subtitle}>Select up to 3 core superpowers.</p>
              </div>

              <div className={styles.goalList}>
                {GOALS.map(goal => (
                  <label
                    key={goal.id}
                    className={`${styles.goalRow} ${selectedGoals.includes(goal.id) ? styles.selected : ''}`}
                  >
                    <input 
                      type="checkbox"
                      className={styles.nativeCheckbox}
                      checked={selectedGoals.includes(goal.id)}
                      onChange={() => toggleGoal(goal.id)}
                    />
                    <span className={styles.goalText}>{goal.label}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5_persona"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>Choose your AI&apos;s style</h1>
                <p className={styles.subtitle}>How should your assistant communicate with you?</p>
              </div>

              <div className={styles.personaGrid}>
                {PERSONAS.map(persona => (
                  <div
                    key={persona.id}
                    className={`${styles.personaCard} ${selectedPersona === persona.id ? styles.selected : ''}`}
                    onClick={() => setSelectedPersona(persona.id)}
                  >
                    <h3 className={styles.personaTitle}>{persona.title}</h3>
                    <p className={styles.personaDesc}>{persona.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.actions}>
          {step > 1 ? (
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleBack}>
              Back
            </button>
          ) : (
            <div /> // Spacer
          )}
          
          <button 
            className={`${styles.btn} ${styles.btnPrimary}`} 
            onClick={handleNext}
            disabled={isNextDisabled() || isSubmitting}
          >
            {isSubmitting ? 'Securing your sanctum...' : step === 5 ? 'Finish Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
