import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase } from './services/supabase';
// MVC refactor — utility modules
import { SURGERY_TYPES, calcDynamicRisk } from './utils/cpspRisk';
import { OME_CONVERSION, calcOME } from './utils/omeConversion';
import { NRSSlider } from './components/cpsp/NRSSlider';
import { CollapsibleSection } from './components/cpsp/CollapsibleSection';
import * as cpspSvc from './services/cpspService';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

// ============================================================
// THEME
// ============================================================
const T = {
  primary: '#0A6E6E',
  primaryDark: '#064F4F',
  primaryLight: '#E6F4F4',
  accent: '#00BFA5',
  accentLight: '#E0F8F5',
  danger: '#E53E3E',
  dangerLight: '#FEE2E2',
  warning: '#DD6B20',
  warningLight: '#FEF3C7',
  success: '#276749',
  successLight: '#DCFCE7',
  bg: '#F0F4F4',
  card: '#FFFFFF',
  border: '#D4E6E6',
  text: '#1A2B2B',
  textMuted: '#6B8080',
  textLight: '#A0B4B4',
};

// ============================================================
// AUTH CONTEXT
// ============================================================
const AuthContext = createContext<any>(null);
const useAuth = () => useContext(AuthContext);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function AuthProvider({ children }: any) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoadingTimeout(true), 6000);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); fetchProfile(session.user.id); }
      else setLoading(false);
    }).catch(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) { setUser(session.user); await fetchProfile(session.user.id); }
      else { setUser(null); setProfile(null); setLoading(false); }
    });
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
      const query = supabase.from('profiles').select('*').eq('id', userId).single();
      const { data } = await Promise.race([query, timeout]) as any;
      setProfile(data);
    } catch(e) { console.error('fetchProfile error:', e); }
    finally { setLoading(false); }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message || null;
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loadingTimeout, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// HELPERS
// ============================================================
const getNrsColor = (v: number) => v <= 3 ? T.success : v <= 6 ? T.warning : T.danger;
const getNrsBg   = (v: number) => v <= 3 ? T.successLight : v <= 6 ? T.warningLight : T.dangerLight;

/** ISO (YYYY-MM-DD) → dd/MM/yyyy per visualizzazione. Usa parseISO per evitare shift di fuso orario. */
const formatDateDisplay = (iso: string) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
};

const roleColor: Record<string, string> = {
  admin: '#6B46C1', medico: T.primary, infermiere: T.accent, paziente: T.warning
};

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: `1.5px solid ${T.border}`, fontSize: 15, outline: 'none',
  boxSizing: 'border-box', backgroundColor: '#FAFEFE', color: T.text,
  transition: 'border-color 0.2s',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: T.textMuted,
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8,
};

const card: React.CSSProperties = {
  backgroundColor: T.card, borderRadius: 16, padding: 20,
  boxShadow: '0 2px 12px rgba(0,80,80,0.08)',
};

const btn = (variant: 'primary'|'ghost'|'danger'|'accent' = 'primary', size: 'sm'|'md'|'lg' = 'md'): React.CSSProperties => {
  const bg = variant === 'primary' ? T.primary : variant === 'danger' ? T.danger : variant === 'accent' ? T.accent : 'transparent';
  const color = variant === 'ghost' ? T.primary : '#fff';
  const border = variant === 'ghost' ? `1.5px solid ${T.border}` : 'none';
  const pad = size === 'sm' ? '6px 12px' : size === 'lg' ? '14px 28px' : '10px 20px';
  return { backgroundColor: bg, color, border, borderRadius: 10, padding: pad, fontWeight: 600, cursor: 'pointer', fontSize: size === 'sm' ? 13 : 14, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const, transition: 'opacity 0.15s' };
};

const chip = (active: boolean, color = T.primary): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 13,
  border: `2px solid ${active ? color : T.border}`,
  backgroundColor: active ? color : '#fff',
  color: active ? '#fff' : T.text,
  transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
});

const PATIENT_STATUS_COLORS: Record<string, string> = {
  pre_ricovero: '#3B82F6', ricoverato: T.primary, dimesso: '#6B8080', followup_cpsp: '#7C3AED',
};
const PATIENT_STATUS_BG: Record<string, string> = {
  pre_ricovero: '#EFF6FF', ricoverato: T.primaryLight, dimesso: '#F3F4F6', followup_cpsp: '#EDE9FE',
};
const PATIENT_STATUS_LABELS: Record<string, string> = {
  pre_ricovero: '🔵 Pre-ricovero', ricoverato: '🟡 Ricoverato', dimesso: '✅ Dimesso', followup_cpsp: '🧠 Follow-up CPSP',
};
const getPatientStatus = (p: any): string => {
  if (p.patient_status) return p.patient_status;
  return p.is_active ? 'ricoverato' : 'dimesso';
};

// ============================================================
// SHARED COMPONENTS
// ============================================================
const Section = React.memo(function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,80,80,0.08)' }}>
      <h3 style={{ margin: '0 0 16px', color: '#0A6E6E', fontSize: 14, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  );
});

const Field = React.memo(function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B8080', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.8 }}>{label}</label>
      {children}
    </div>
  );
});

// ============================================================
// LAYOUT
// ============================================================
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSave = async (e: any) => {
    e.preventDefault();
    if (newPwd.length < 6) { setIsError(true); setMsg('La password deve essere di almeno 6 caratteri.'); return; }
    if (newPwd !== confirmPwd) { setIsError(true); setMsg('Le password non coincidono.'); return; }
    setSaving(true); setMsg(''); setIsError(false);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSaving(false);
    if (error) { setIsError(true); setMsg(error.message); return; }
    setMsg('Password aggiornata con successo!');
    setNewPwd(''); setConfirmPwd('');
    setTimeout(() => onClose(), 1800);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: T.text, fontSize: 18, fontWeight: 700 }}>🔑 Cambia Password</h2>
          <button onClick={onClose} style={{ background: T.bg, border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Nuova password</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              style={inp} placeholder="Minimo 6 caratteri" required autoFocus />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Conferma password</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              style={inp} placeholder="••••••••" required />
          </div>
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontWeight: 500,
              backgroundColor: isError ? T.dangerLight : T.successLight,
              color: isError ? T.danger : T.success }}>
              {isError ? '⚠️' : '✅'} {msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button type="submit" disabled={saving} style={{ ...btn('primary'), flex: 1, justifyContent: 'center' }}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Layout({ children }: any) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const path = window.location.pathname;
  const [showChangePwd, setShowChangePwd] = useState(false);

  const navItems = [
    { path: '/', icon: '⊞', label: 'Dashboard' },
    { path: '/patients', icon: '♥', label: 'Pazienti' },
    { path: '/notifications', icon: '◉', label: 'Notifiche' },
    { path: '/stats', icon: '↗', label: 'Statistiche' },
    ...(profile?.role === 'admin' ? [
      { path: '/export', icon: '⬇', label: 'Export' },
      { path: '/users', icon: '✦', label: 'Utenti' },
      { path: '/audit', icon: '📜', label: 'Cronologia' },
      { path: '/settings', icon: '⚙', label: 'Impostazioni' },
    ] : []),
  ];

  const isActive = (p: string) => p === '/' ? path === '/' : path.startsWith(p);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.bg, display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw' }}>

      {isMobile ? (
        /* ── MOBILE TOP BAR ── */
        <nav style={{ backgroundColor: T.primaryDark, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🩺</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>APS Manager</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{profile?.first_name} · {profile?.role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowChangePwd(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>🔑</button>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>Esci</button>
          </div>
        </nav>
      ) : (
        /* ── DESKTOP SIDEBAR ── */
        <div style={{ display: 'flex', flex: 1 }}>
          <aside style={{ width: 220, backgroundColor: T.primaryDark, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, boxShadow: '2px 0 20px rgba(0,0,0,0.15)' }}>
            {/* Logo */}
            <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🩺</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>APS Manager</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Acute Pain Service</div>
                </div>
              </div>
              {/* User card */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: roleColor[profile?.role] || T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.first_name} {profile?.last_name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{profile?.role}</div>
                </div>
              </div>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
              {navItems.map(item => (
                <button key={item.path} onClick={() => navigate(item.path)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 2, textAlign: 'left' as const,
                    backgroundColor: isActive(item.path) ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: isActive(item.path) ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontWeight: isActive(item.path) ? 700 : 400, fontSize: 14, transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 16, width: 20, textAlign: 'center' as const }}>{item.icon}</span>
                  {item.label}
                  {isActive(item.path) && <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', backgroundColor: T.accent }} />}
                </button>
              ))}
            </nav>

            {/* Logout + Cambia Password */}
            <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setShowChangePwd(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', backgroundColor: 'transparent', fontSize: 14, fontWeight: 400, marginBottom: 2 }}>
                <span style={{ fontSize: 16 }}>🔑</span> Cambia Password
              </button>
              <button onClick={signOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', backgroundColor: 'transparent', fontSize: 14, fontWeight: 400 }}>
                <span style={{ fontSize: 16 }}>⏻</span> Logout
              </button>
            </div>
          </aside>

          {/* Desktop main */}
          <main style={{ flex: 1, marginLeft: 220, padding: 28, minHeight: '100vh', overflowX: 'hidden' }}>
            {children}
          </main>
        </div>
      )}

      {/* Mobile main */}
      {isMobile && (
        <>
          <main style={{ flex: 1, padding: 14, paddingBottom: 90, overflowX: 'hidden' }}>
            {children}
          </main>
          {/* Bottom nav */}
          <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: T.primaryDark, display: 'flex', padding: '8px 0 22px', boxShadow: '0 -2px 20px rgba(0,0,0,0.2)', zIndex: 100 }}>
            {navItems.slice(0, 5).map(item => (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  backgroundColor: isActive(item.path) ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: isActive(item.path) ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s' }}>
                  {item.icon}
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: isActive(item.path) ? T.accent : 'rgba(255,255,255,0.4)' }}>{item.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}


// ============================================================
// ONBOARDING / TENANT SELECTION
// ============================================================
const TENANT_FUNCTION_URL = 'https://oigokazmocdfufjxxyji.supabase.co/functions/v1/manage-tenants';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ29rYXptb2NkZnVmanh4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDU2NjgsImV4cCI6MjA4NzgyMTY2OH0.e_c2CHXgsTbeMaF0m3dYtc_eMnoGTjOWuot-1BIqgYM';

const ALL_WARDS = ['Ortopedia','Chirurgia Generale','Ginecologia','Urologia','Toracica','Neurochirurgia','Vascolare','Cardiochirurgia','ORL','Oculistica','Maxillofacciale','Traumatologia','Pediatria','Altro'];

async function callTenantFn(body: any) {
  const res = await fetch(TENANT_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function callTenantFnAuth(body: any) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  const res = await fetch(TENANT_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body),
  });
  return res.json();
}

function OnboardingPage({ onSelect }: { onSelect: (tenantCode: string) => void }) {
  const [mode, setMode] = useState<'choose'|'access'|'create'>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Access existing
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<any[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Create new
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedWards, setSelectedWards] = useState<string[]>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [createdCode, setCreatedCode] = useState('');

  const handleAccess = async () => {
    if (!code || !password) { setError('Inserisci codice e password'); return; }
    setLoading(true); setError('');
    const res = await callTenantFn({ action: 'verify', code: code.toUpperCase(), password });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    localStorage.setItem('tenant_code', res.tenant.code);
    localStorage.setItem('tenant_id', res.tenant.id);
    localStorage.setItem('tenant_name', res.tenant.name);
    onSelect(res.tenant.code);
  };

  const handleCreate = async () => {
    if (!name || !newPassword || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
      setError('Compila tutti i campi obbligatori'); return;
    }
    if (newPassword !== confirmPassword) { setError('Le password non coincidono'); return; }
    if (selectedWards.length === 0) { setError('Seleziona almeno un reparto'); return; }
    setLoading(true); setError('');
    const res = await callTenantFn({
      action: 'create', name, password: newPassword, wards: selectedWards,
      adminEmail, adminPassword, adminFirstName, adminLastName,
    });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setCreatedCode(res.code);
  };

  const toggleWard = (ward: string) => {
    setSelectedWards(prev => prev.includes(ward) ? prev.filter(w => w !== ward) : [...prev, ward]);
  };

  if (createdCode) return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${T.primaryDark} 0%, ${T.primary} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: T.text, margin: '0 0 8px' }}>Database Creato!</h2>
        <p style={{ color: T.textMuted, marginBottom: 20 }}>Il tuo codice di accesso è:</p>
        <div style={{ backgroundColor: T.primaryLight, borderRadius: 14, padding: '16px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.primary, letterSpacing: 3 }}>{createdCode}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>Conserva questo codice!</div>
        </div>
        <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 20 }}>Condividilo con il tuo team per accedere al database. La password è quella che hai scelto.</p>
        <button onClick={async () => {
          localStorage.setItem('tenant_code', createdCode);
          await supabase.auth.signOut();
          onSelect(createdCode);
        }} style={{ ...btn('primary', 'lg'), width: '100%', justifyContent: 'center' }}>
          Accedi al Database →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${T.primaryDark} 0%, ${T.primary} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 18, fontSize: 32, marginBottom: 12 }}>🩺</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 26, fontWeight: 800 }}>APS Manager</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontSize: 13 }}>Acute Pain Service</p>
        </div>

        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={async () => {
            setMode('access');
            setLoadingTenants(true);
            const res = await callTenantFn({ action: 'list' });
            setTenants(res.tenants || []);
            setLoadingTenants(false);
          }}
              style={{ backgroundColor: '#fff', border: 'none', borderRadius: 16, padding: '20px 24px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: T.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🔑</div>
              <div>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 16, marginBottom: 4 }}>Accedi a database esistente</div>
                <div style={{ color: T.textMuted, fontSize: 13 }}>Hai già un codice di accesso</div>
              </div>
              <span style={{ marginLeft: 'auto', color: T.textMuted, fontSize: 18 }}>→</span>
            </button>
            <button onClick={() => setMode('create')}
              style={{ backgroundColor: T.accent, border: 'none', borderRadius: 16, padding: '20px 24px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>✨</div>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 16, marginBottom: 4 }}>Crea nuovo database</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Configura un nuovo spazio per il tuo ospedale</div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>→</span>
            </button>
          </div>
        )}

        {mode === 'access' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28 }}>
            <button onClick={() => { setMode('choose'); setError(''); }} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 14, marginBottom: 16, padding: 0 }}>← Indietro</button>
            <h2 style={{ margin: '0 0 20px', color: T.text, fontSize: 20, fontWeight: 700 }}>🔑 Accedi al Database</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Seleziona Database</label>
              {loadingTenants ? (
                <div style={{ padding: '10px 14px', color: T.textMuted, fontSize: 13 }}>Caricamento database...</div>
              ) : tenants.length > 0 ? (
                <select
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Seleziona o digita il codice —</option>
                  {tenants.map((t: any) => (
                    <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                  ))}
                </select>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <label style={{ ...lbl, marginBottom: 4 }}>Oppure inserisci il codice manualmente</label>
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Es. IORDRS-2026" style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2, textTransform: 'uppercase' }} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inp} />
            </div>
            {error && <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>⚠️ {error}</div>}
            <button onClick={handleAccess} disabled={loading} style={{ ...btn('primary', 'lg'), width: '100%', justifyContent: 'center' }}>
              {loading ? 'Verifica...' : 'Accedi →'}
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, maxHeight: '80vh', overflowY: 'auto' }}>
            <button onClick={() => { setMode('choose'); setError(''); }} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 14, marginBottom: 16, padding: 0 }}>← Indietro</button>
            <h2 style={{ margin: '0 0 20px', color: T.text, fontSize: 20, fontWeight: 700 }}>✨ Crea Nuovo Database</h2>

            <div style={{ backgroundColor: T.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 4 }}>📋 DATI OSPEDALE</div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Nome Ospedale *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Istituto Ortopedico Rizzoli" style={inp} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Password Database *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password per accedere al database" style={inp} />
              </div>
              <div>
                <label style={lbl}>Conferma Password *</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ripeti la password" style={inp} />
              </div>
            </div>

            <div style={{ backgroundColor: T.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 8 }}>🏥 REPARTI</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_WARDS.map(w => (
                  <button key={w} onClick={() => toggleWard(w)} style={chip(selectedWards.includes(w))}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: T.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 8 }}>👤 ACCOUNT AMMINISTRATORE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={lbl}>Nome *</label>
                  <input value={adminFirstName} onChange={e => setAdminFirstName(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Cognome *</label>
                  <input value={adminLastName} onChange={e => setAdminLastName(e.target.value)} style={inp} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Email *</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@ospedale.it" style={inp} />
              </div>
              <div>
                <label style={lbl}>Password Account *</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password per il login" style={inp} />
              </div>
            </div>

            {error && <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>⚠️ {error}</div>}
            <button onClick={handleCreate} disabled={loading} style={{ ...btn('accent', 'lg'), width: '100%', justifyContent: 'center' }}>
              {loading ? 'Creazione...' : '✨ Crea Database'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// RESET PASSWORD
// ============================================================
function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError('La password deve essere di almeno 6 caratteri.'); return; }
    if (newPassword !== confirmPassword) { setError('Le password non coincidono.'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
    setTimeout(() => onDone(), 2500);
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${T.primaryDark} 0%, #0D5555 50%, ${T.primary} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 36, marginBottom: 16, backdropFilter: 'blur(10px)' }}>🩺</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>APS Manager</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontSize: 14 }}>Reimposta la tua password</p>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ color: T.success, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Password aggiornata!</div>
              <div style={{ color: T.textMuted, fontSize: 14 }}>Puoi ora fare il login con la nuova password.</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ margin: '0 0 20px', color: T.text, fontSize: 18, fontWeight: 700 }}>Nuova password</h2>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Nuova password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  style={inp} placeholder="Minimo 6 caratteri" required autoFocus />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Conferma password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  style={inp} placeholder="••••••••" required />
              </div>
              {error && (
                <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
                  ⚠️ {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                style={{ ...btn('primary', 'lg'), width: '100%', justifyContent: 'center', borderRadius: 12, fontSize: 16 }}>
                {loading ? '...' : 'Aggiorna password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function LoginPage({ onRegister }: { onRegister?: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) { setError('Inserisci la tua email prima di richiedere il reset.'); return; }
    setLoading(true); setError('');
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://claudiogargiulo1-hash.github.io/aps-web' });
    setLoading(false);
    setResetSent(true);
  };

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setLoading(true); setError('');
    const err = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${T.primaryDark} 0%, #0D5555 50%, ${T.primary} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 36, marginBottom: 16, backdropFilter: 'blur(10px)' }}>🩺</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>APS Manager</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontSize: 14 }}>Acute Pain Service · Gestione Dolore</p>
        </div>

        {/* Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={inp} placeholder="nome@ospedale.it" required autoCapitalize="none" />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={inp} placeholder="••••••••" required />
            </div>
            <div style={{ marginBottom: 20, textAlign: 'right' }}>
              <button type="button" onClick={handleForgotPassword} disabled={loading}
                style={{ background: 'none', border: 'none', color: T.primary, fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                Password dimenticata?
              </button>
            </div>
            {resetSent && (
              <div style={{ backgroundColor: T.successLight, color: T.success, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
                ✅ Email inviata! Controlla la tua casella di posta.
              </div>
            )}
            {error && (
              <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
                ⚠️ {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ ...btn('primary', 'lg'), width: '100%', justifyContent: 'center', backgroundColor: T.primary, borderRadius: 12, fontSize: 16 }}>
              {loading ? '...' : 'Accedi'}
            </button>
          </form>
          {onRegister && (
            <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <span style={{ color: T.textMuted, fontSize: 14 }}>Non hai un account? </span>
              <button onClick={onRegister} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                Registrati
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REGISTER
// ============================================================
function RegisterPage({ onBack }: { onBack: () => void }) {
  const FUNCTION_URL = 'https://oigokazmocdfufjxxyji.supabase.co/functions/v1/manage-users';
  const [form, setForm] = useState({ tenantCode: '', firstName: '', lastName: '', email: '', department: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!form.tenantCode || !form.firstName || !form.lastName || !form.email) {
      setError('Compila tutti i campi obbligatori.'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ29rYXptb2NkZnVmanh4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDU2NjgsImV4cCI6MjA4NzgyMTY2OH0.e_c2CHXgsTbeMaF0m3dYtc_eMnoGTjOWuot-1BIqgYM' },
        body: JSON.stringify({ action: 'register', tenantCode: form.tenantCode, firstName: form.firstName, lastName: form.lastName, email: form.email, department: form.department, message: form.message }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setSuccess(true); }
    } catch(e) { setError('Errore di rete. Riprova.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${T.primaryDark} 0%, #0D5555 50%, ${T.primary} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 36, marginBottom: 16, backdropFilter: 'blur(10px)' }}>🩺</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>APS Manager</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontSize: 14 }}>Richiesta di accesso</p>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: T.success, marginBottom: 8 }}>Richiesta inviata!</h2>
              <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 24 }}>Un amministratore riceverà la tua richiesta e ti contatterà via email.</p>
              <button onClick={onBack} style={{ ...btn('primary'), width: '100%', justifyContent: 'center' }}>Torna al login</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ margin: '0 0 20px', color: T.text, fontSize: 18, fontWeight: 700 }}>Richiedi accesso</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {([['Codice Database *', 'tenantCode', '1 / -1'], ['Nome *', 'firstName', 'auto'], ['Cognome *', 'lastName', 'auto'], ['Email *', 'email', '1 / -1'], ['Reparto', 'department', '1 / -1']] as [string, string, string][]).map(([label, key, col]) => (
                  <div key={key} style={{ gridColumn: col }}>
                    <label style={lbl}>{label}</label>
                    <input type={key === 'email' ? 'email' : 'text'} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} placeholder={key === 'tenantCode' ? 'Es. OSPMC' : ''} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Messaggio (opzionale)</label>
                  <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} style={{ ...inp, resize: 'vertical', minHeight: 80 }} placeholder="Presenta brevemente il tuo ruolo..." />
                </div>
              </div>
              {error && (
                <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, margin: '12px 0', fontWeight: 500 }}>
                  ⚠️ {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={onBack} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Indietro</button>
                <button type="submit" disabled={loading} style={{ ...btn('primary'), flex: 2, justifyContent: 'center' }}>
                  {loading ? 'Invio...' : 'Invia richiesta'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ active: 0, highPain: 0, total: 0 });
  const [recentNRS, setRecentNRS] = useState<any[]>([]);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    const [pRes, hRes, mRes] = await Promise.all([
      supabase.from('patients').select('id').eq('is_active', true),
      supabase.from('nrs_measurements').select('id').gte('nrs_value', 7).gte('measured_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('nrs_measurements').select('*, patients(first_name, last_name, ward)').order('measured_at', { ascending: false }).limit(8),
    ]);
    setStats({ active: pRes.data?.length || 0, highPain: hRes.data?.length || 0, total: mRes.data?.length || 0 });
    setRecentNRS(mRes.data || []);
  };

  const hour = new Date().getHours();
  const greeting = hour >= 6 && hour < 12 ? '☀️ Buongiorno' : hour < 18 ? '🌤 Buon pomeriggio' : '🌙 Buonasera';

  const kpis = [
    { icon: '🏥', label: 'Pazienti attivi', value: stats.active, color: T.primary, bg: T.primaryLight },
    { icon: '🔴', label: 'Alert NRS 24h', value: stats.highPain, color: T.danger, bg: T.dangerLight },
    { icon: '📋', label: 'Rilevazioni oggi', value: stats.total, color: T.accent, bg: T.accentLight },
    { icon: '👤', label: 'Ruolo', value: profile?.role, color: roleColor[profile?.role] || T.primary, bg: T.primaryLight },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, color: T.text, fontSize: isMobile ? 20 : 26, fontWeight: 800 }}>{greeting}, {profile?.first_name}!</h1>
        <p style={{ color: T.textMuted, margin: '4px 0 0', fontSize: 13 }}>{format(new Date(), "EEEE d MMMM yyyy", { locale: it })}</p>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: isMobile ? 14 : 20, borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: isMobile ? 22 : 28, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: isMobile ? 11 : 13, color: T.textMuted, marginTop: 6 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Recent NRS */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, color: T.text, fontWeight: 700 }}>📊 Rilevazioni Recenti</h2>
          <button onClick={() => navigate('/patients')} style={{ ...btn('ghost', 'sm'), fontSize: 12 }}>Vedi pazienti →</button>
        </div>
        {recentNRS.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>Nessuna rilevazione</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentNRS.map((m: any) => (
              <div key={m.id} onClick={() => navigate('/patients/' + m.patient_id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, backgroundColor: T.bg, cursor: 'pointer' }}>
                <span style={{ backgroundColor: getNrsBg(m.nrs_value), color: getNrsColor(m.nrs_value), padding: '5px 12px', borderRadius: 20, fontWeight: 800, fontSize: 16, minWidth: 40, textAlign: 'center' as const }}>
                  {m.nrs_value}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{m.patients?.last_name} {m.patients?.first_name}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{m.patients?.ward}</div>
                </div>
                <div style={{ fontSize: 12, color: T.textLight, flexShrink: 0 }}>
                  {formatDistanceToNow(parseISO(m.measured_at), { addSuffix: true, locale: it })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PATIENTS
// ============================================================
type StatusTab = 'pre_ricovero' | 'ricoverato' | 'dimesso' | 'followup_cpsp';

function PatientsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('ricoverato');

  const canAdd = ['medico', 'infermiere', 'admin'].includes(profile?.role);
  const canDelete = ['medico', 'admin'].includes(profile?.role);

  const fetchPatients = useCallback(async () => {
    const { data } = await supabase.from('patients')
      .select('*, nrs_measurements(nrs_value, measured_at)')
      .order('last_name');
    setPatients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const deletePatient = async (id: string) => {
    if (!window.confirm('Eliminare questo paziente?')) return;
    await supabase.from('patients').delete().eq('id', id);
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  const byStatus: Record<StatusTab, any[]> = {
    pre_ricovero: patients.filter(p => getPatientStatus(p) === 'pre_ricovero'),
    ricoverato: patients.filter(p => getPatientStatus(p) === 'ricoverato'),
    dimesso: patients.filter(p => getPatientStatus(p) === 'dimesso'),
    followup_cpsp: patients.filter(p => getPatientStatus(p) === 'followup_cpsp'),
  };

  const tabList: { key: StatusTab; label: string }[] = [
    { key: 'pre_ricovero', label: '🔵 Pre-ricovero' },
    { key: 'ricoverato', label: '🟡 Ricoverati' },
    { key: 'dimesso', label: '✅ Dimessi' },
    { key: 'followup_cpsp', label: '🧠 Follow-up CPSP' },
  ];

  const filtered = byStatus[statusTab].filter(p =>
    `${p.first_name} ${p.last_name} ${p.ward} ${p.admission_number}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Pazienti</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', flex: isMobile ? 1 : 'none' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca paziente..."
              style={{ ...inp, paddingLeft: 36, width: isMobile ? '100%' : 220, borderRadius: 20 }} />
          </div>
          {canAdd && (
            <button onClick={() => navigate('/patients/new')} style={btn('primary')}>+ Aggiungi</button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: isMobile ? 4 : 6, marginBottom: 16, overflowX: 'auto' as const, paddingBottom: 2 }}>
        {tabList.map(t => {
          const count = byStatus[t.key].length;
          const active = statusTab === t.key;
          const color = PATIENT_STATUS_COLORS[t.key];
          return (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              style={{ padding: isMobile ? '8px 12px' : '9px 18px', borderRadius: 12, border: `2px solid ${active ? color : T.border}`,
                backgroundColor: active ? PATIENT_STATUS_BG[t.key] : '#fff', color: active ? color : T.textMuted,
                fontWeight: active ? 700 : 500, fontSize: isMobile ? 12 : 13, cursor: 'pointer', whiteSpace: 'nowrap' as const,
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {t.label}
              <span style={{ backgroundColor: active ? color : T.bg, color: active ? '#fff' : T.textMuted,
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 60, color: T.textMuted }}>Nessun paziente trovato</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p: any) => {
            const sorted = (p.nrs_measurements || []).sort((a: any, b: any) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
            const lastNRS = sorted[0];
            const pStatus = getPatientStatus(p);
            const statusColor = PATIENT_STATUS_COLORS[pStatus];
            const statusBg = PATIENT_STATUS_BG[pStatus];
            return (
              <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s', borderLeft: `3px solid ${statusColor}` }}
                onClick={() => navigate('/patients/' + p.id)}>
                <div style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: statusBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: statusColor, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {p.first_name?.[0]}{p.last_name?.[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{p.last_name} {p.first_name}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                    {p.ward} · Letto {p.bed || '—'} · {p.admission_number}
                  </div>
                </div>
                {lastNRS ? (
                  <span style={{ backgroundColor: getNrsBg(lastNRS.nrs_value), color: getNrsColor(lastNRS.nrs_value), padding: '6px 14px', borderRadius: 20, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {lastNRS.nrs_value}
                  </span>
                ) : <span style={{ color: T.textLight, fontSize: 18, fontWeight: 700 }}>—</span>}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => navigate('/patients/' + p.id + '/edit')} style={{ ...btn('ghost', 'sm'), padding: '5px 10px' }}>✏️</button>
                  {canDelete && (
                    <button onClick={() => deletePatient(p.id)} style={{ background: T.dangerLight, border: 'none', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: T.danger, fontSize: 13 }}>🗑</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CPSP DATA & COMPONENT
// ============================================================
// SURGERY_TYPES imported from ./utils/cpspRisk

const PCS_ITEMS = [
  'Sono in ansia e mi preoccupo continuamente che il dolore non passerà',
  'Sento che non riesco più ad andare avanti',
  'È terribile e penso che non migliorerà mai',
  'È orribile e sento che mi sopraffà completamente',
  'Sento che non riesco più a sopportarlo',
  'Ho paura che il dolore possa peggiorare',
  'Continuo a pensare ad altri episodi o situazioni dolorose',
  'Desidero ansiosamente che il dolore finisca',
  'Non riesco a smettere di pensarci',
  'Continuo a pensare a quanto fa male',
  'Continuo a pensare a quanto voglio che il dolore smetta',
  "Non c'è nulla che io possa fare per ridurre l'intensità del dolore",
  'Mi chiedo se mi potrà capitare qualcosa di grave',
];

const PASS_ITEMS = [
  'Quando ho dolore ho paura che qualcosa di grave stia accadendo',
  'Il dolore mi fa credere che starò sempre male',
  'Quando ho dolore mi sento molto ansioso/a',
  'Pensieri spaventosi riguardo al dolore si susseguono nella mia mente',
  'Quando ho dolore penso di poter essere seriamente malato/a',
  'Evito attività importanti perché ho paura del dolore',
  'Il dolore mi fa pensare a infortuni o malattie',
  'Cerco di evitare le attività che causano dolore',
  'Provo ansia anche quando il dolore è lieve',
  'Ho paura del dolore',
  'I miei muscoli si tendono quando anticipo il dolore',
  'Tremo quando ho un forte dolore',
  'Il dolore mi fa sentire stordito/a',
  'Quando ho dolore mi agito',
  'Quando ho dolore respiro più velocemente del solito',
  'Mi sento impaurito/a di fronte al dolore',
  'Quando ho dolore il cuore mi batte più velocemente',
  'Cerco di smettere qualsiasi attività quando avverto il dolore',
  'Quando ho dolore mi sento in pericolo',
  'Non riesco a smettere di pensare al dolore finché non passa',
];

const CSI_ITEMS = [
  'Anche senza essermi fatto/a del male, sento dolore',
  'Anche quando il dolore diminuisce, mi fa ancora soffrire',
  'Piccole quantità di sostanze chimiche (es. profumi) mi fanno sentire male',
  'Ho mal di schiena per la maggior parte della giornata',
  'Sono sensibile/a alla luce intensa',
  'Ho pressione o pesantezza alla testa',
  'Sento rigidità o tensione muscolare in tutto il corpo',
  'Sono sensibile/a ai rumori forti',
  'Ho difficoltà a concentrarmi',
  'Ho disturbi gastrointestinali (crampi, gonfiore, diarrea)',
  'Ho poca resistenza agli sforzi fisici',
  'Mi sento ansioso/a',
  'Ho difficoltà a dormire',
  'Ho difficoltà a ricordare le cose',
  'Ho dolore in più aree del corpo contemporaneamente',
  'Mi sento facilmente affaticato/a',
  'Mi sento depresso/a',
  'Sento una sensazione di bruciore nella zona dolorante',
  'Piccoli cambiamenti di temperatura mi causano molto disagio',
  'Ho bisogno di urinare frequentemente',
  'Le mie gambe sono irrequiete di notte o da seduto/a',
  'Ho dolore al petto o difficoltà respiratorie',
  'La mia pelle è molto sensibile al tatto',
  'Sudo eccessivamente',
  'Sento ronzii alle orecchie',
];

const BPI_ITEMS = ['Attività generale', 'Umore', 'Capacità di camminare', 'Lavoro e attività quotidiane', 'Relazioni con gli altri', 'Sonno', 'Piacere di vivere'];
// DN4_ITEMS: usato nel questionario paziente via QR code e nella visualizzazione follow-up
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DN4_ITEMS = ['Bruciore', 'Sensazione di freddo doloroso', 'Scosse elettriche', 'Formicolio', 'Spilli e aghi', 'Intorpidimento / addormentamento', 'Prurito'];
const EQ5D_DIMS = ['Mobilità', 'Cura di sé', 'Attività abituali', 'Dolore / malessere', 'Ansia / depressione'];

// PHQ-9: 0=Mai, 1=Alcuni giorni, 2=Più della metà dei giorni, 3=Quasi ogni giorno
// Cutoff: 0-4 nessuno/minimo, 5-9 lieve, 10-14 moderato, 15-19 moderatamente severo, ≥20 severo
// Cutoff clinico per referral: ≥10
const PHQ9_ITEMS = [
  'Poco interesse o piacere nel fare le cose',
  'Sentirsi giù, depresso/a o senza speranza',
  'Difficoltà ad addormentarsi, a restare sveglio/a o dormire troppo',
  'Sentirsi stanco/a o avere poca energia',
  'Scarso appetito o mangiare troppo',
  'Sentirsi in colpa o un/a fallito/a, o aver deluso se stesso/a o la famiglia',
  'Difficoltà a concentrarsi, per esempio a leggere il giornale o guardare la televisione',
  'Muoversi o parlare così lentamente che gli altri lo notano, oppure essere così agitato/a da muoversi molto più del solito',
  'Pensieri di essere meglio morti/e o di farsi del male in qualche modo',
];

// GAD-7: 0=Mai, 1=Alcuni giorni, 2=Più della metà dei giorni, 3=Quasi ogni giorno
// Cutoff: 0-4 minima, 5-9 lieve, 10-14 moderata, ≥15 severa
// Cutoff clinico per referral: ≥10
const GAD7_ITEMS = [
  'Sentirsi nervoso/a, ansioso/a o con i nervi a fior di pelle',
  'Non riuscire a smettere di preoccuparsi o a controllare le proprie preoccupazioni',
  'Preoccuparsi troppo per cose diverse',
  'Difficoltà a rilassarsi',
  'Essere così irrequieto/a da non riuscire a stare seduto/a tranquillamente',
  'Diventare facilmente seccato/a o irritabile',
  'Avere paura che possa accadere qualcosa di terribile',
];

const RISK_COLORS: Record<string, string> = { basso: T.success, moderato: T.warning, alto: T.danger, molto_alto: '#7B0000' };
const RISK_LABELS: Record<string, string> = { basso: 'Basso', moderato: 'Moderato', alto: 'Alto', molto_alto: 'Molto Alto' };
const PROSPECT_BUNDLES: Record<string, { items: string[], source: string }> = {
  protesi_anca: { items: ['Paracetamolo 1g x4 + COX-2 inibitore + Desametasone 8–10 mg IV', 'Fascia Iliaca block o LIA (Local Infiltration Analgesia)', '⚠️ Gabapentinoidi NON raccomandati routinariamente per THA'], source: 'PROSPECT Guidelines 2021, Livello A' },
  protesi_ginocchio: { items: ['Paracetamolo 1g x4 + COX-2 inibitore + Desametasone 8–10 mg IV', 'ACB (Adductor Canal Block) o LIA', '⚠️ Gabapentinoidi NON raccomandati routinariamente per TKA'], source: 'PROSPECT Guidelines 2021, Livello A' },
  toracotomia: { items: ['Epidurale toracica o blocco paravertebrale (prima scelta)', 'Alternative: Erector Spinae Block (OR 0.76 per CPSP) o blocco intercostale', 'Preferire VATS quando possibile (OR 0.54 per CPSP vs open)'], source: 'PROSPECT 2023 / Anaesthesia 2024, Livello A' },
  mammaria: { items: ['Paracetamolo + NSAID + Desametasone IV', 'Blocco paravertebrale (PVB) o PECS block'], source: 'PROSPECT 2020, Livello A' },
  ernioplastica: { items: ['Paracetamolo + NSAID multimodale', 'TAP block o blocco del nervo ileoinguinale/ilieoipogastrico', 'Gabapentin 300 mg pre-op (evidenza per neuralgia inguinale cronica)'], source: 'PROSPECT 2021, Livello A' },
  spinale: { items: ['ERECTOR Spinae Plane Block bilaterale', 'Ketamina 0.3 mg/kg/h intraoperatoria (forte evidenza per chirurgia spinale)', 'Paracetamolo + COX-2 inibitore regolare'], source: 'PROSPECT 2023, Livello B' },
};
type Rec = { icon: string; cat: string; text: string; src: string; ev: 'A'|'B'|'C'|'expert' };
const EV_STYLE: Record<string, { bg: string; color: string }> = {
  A: { bg: '#D1FAE5', color: '#047857' },
  B: { bg: '#FEF3C7', color: '#B45309' },
  C: { bg: '#FFEDD5', color: '#C2410C' },
  expert: { bg: '#F3F4F6', color: '#6B7280' },
};
function getRecs(level: string, pcs: number, pass: number, csi: number, opioids: string, preOpNRS: number, dt = 0, insomnia = false, painOtherSites = false): Rec[] {
  const recs: Rec[] = [];
  if (level === 'basso') {
    recs.push({ icon: '✅', cat: 'Farmacologico', text: 'Analgesia multimodale standard ERAS: paracetamolo 1g x4/die + FANS/COX-2 inibitore + oppioide rescue PRN', src: 'APS Guidelines 2016, PROSPECT 2023', ev: 'A' });
    recs.push({ icon: '📄', cat: 'Educazione', text: 'Informazione preoperatoria strutturata (pain neuroscience education breve, 1 sessione)', src: 'APS Guidelines 2016', ev: 'B' });
    recs.push({ icon: '📅', cat: 'Follow-up', text: 'Rivalutazione NRS a 1 mese', src: 'Expert consensus', ev: 'expert' });
  } else if (level === 'moderato') {
    recs.push({ icon: '💊', cat: 'Farmacologico', text: 'Pregabalin 75-150mg x2/die: iniziare 2h prima dell\'intervento, continuare 7-14 giorni post-op (riduzione CPSP OR=0.09 vs placebo in meta-analisi Cochrane 2023)', src: 'Cochrane 2023', ev: 'A' });
    recs.push({ icon: '💊', cat: 'Farmacologico', text: 'Considerare Gabapentin 300mg x3/die come alternativa al pregabalin (evidenza simile)', src: 'Cochrane 2023', ev: 'A' });
    recs.push({ icon: '🦷', cat: 'Locoregionale', text: 'Anestesia regionale tecnica-specifica raccomandata: PENG block + ACB per anca/ginocchio, ESPB per colonna/spalla, TAP block per addome', src: 'PROSPECT Guidelines 2023', ev: 'A' });
    recs.push({ icon: '📋', cat: 'TPS', text: 'Segnalazione al Transitional Pain Service per follow-up strutturato', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '📅', cat: 'Follow-up', text: 'Follow-up a 3 mesi con NRS + BPI', src: 'IASP 2021', ev: 'B' });
  } else if (level === 'alto') {
    recs.push({ icon: '💉', cat: 'Intraoperatorio', text: 'Ketamina EV: 0.3-0.5mg/kg bolo all\'induzione + infusione 0.1-0.2mg/kg/h fino a 24h post-op (NMDA antagonismo, unico farmaco con evidenza Cochrane per CPSP)', src: 'ROCKet Trial 2024, Cochrane Review', ev: 'B' });
    recs.push({ icon: '💊', cat: 'Farmacologico', text: 'Lidocaina EV intraoperatoria: 1.5mg/kg bolo + 2mg/kg/h infusione (evidenza per riduzione CPSP a 6 mesi, più forte di ketamina in network meta-analisi BJA 2023)', src: 'BJA Systematic Review 2023', ev: 'A' });
    recs.push({ icon: '💊', cat: 'Farmacologico', text: 'Pregabalin 150mg x2/die perioperatorio (dose piena)', src: 'Cochrane 2023', ev: 'A' });
    recs.push({ icon: '🏥', cat: 'TPS', text: 'Presa in carico TPS obbligatoria con piano dimissione strutturato', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '👨‍⚕️', cat: 'Consulenza', text: 'Consulenza algologica preoperatoria', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '📅', cat: 'Follow-up', text: '3, 6, 12 mesi con BPI + DN4 + EQ-5D', src: 'IASP 2021', ev: 'B' });
  } else if (level === 'molto_alto') {
    recs.push({ icon: '🏥', cat: 'Team', text: 'Approccio multidisciplinare obbligatorio: anestesista algolo + psicologo/psichiatra + fisioterapista', src: 'IASP 2021', ev: 'B' });
    recs.push({ icon: '⚠️', cat: 'Nota Duloxetina', text: 'Due RCT su THA/TKA (duloxetina 60mg/die) NON hanno dimostrato riduzione CPSP (Reinstra et al. 2024). Considerare duloxetina SOLO se CSI≥40 e NON come strategia routinaria per chirurgia ortopedica', src: 'Int J Mol Sci 2024', ev: 'B' });
    recs.push({ icon: '💉', cat: 'Intraoperatorio', text: 'Ketamina EV + Lidocaina EV in combinazione (sinergismo, evidenza emergente)', src: 'BJA 2023', ev: 'B' });
    recs.push({ icon: '💉', cat: 'Intraoperatorio', text: 'Considerare Metadone intraoperatorio 0.1-0.2mg/kg (emerging evidence per riduzione CPSP, azione NMDA)', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '📞', cat: 'Centro del dolore', text: 'Riferimento obbligatorio al Centro del Dolore Cronico PRIMA dell\'intervento', src: 'IASP 2021', ev: 'B' });
    recs.push({ icon: '📅', cat: 'Follow-up', text: 'Intensivo a 1, 3, 6, 12 mesi con team multidisciplinare', src: 'Expert consensus', ev: 'expert' });
  }
  if (pcs >= 30) {
    recs.push({ icon: '🧠', cat: 'Psicologico (PCS≥30)', text: 'Pain Neuroscience Education (PNE) preoperatoria: 1-2 sessioni (riduce catastrofizzazione, evidenza forte in TKA/THA)', src: 'Cochrane 2022, Lewis meta-analisi', ev: 'A' });
    recs.push({ icon: '🧠', cat: 'Psicologico (PCS≥30)', text: 'CBT orientata al dolore (riduce PCS score, intensità dolore, disabilità)', src: 'Cochrane Review 2021', ev: 'A' });
    recs.push({ icon: '📖', cat: 'Educazione (PCS≥30)', text: 'Materiale psicoeducativo scritto validato sulla neuroscienza del dolore', src: 'Expert consensus', ev: 'expert' });
  }
  if (pass >= 30) {
    recs.push({ icon: '🤝', cat: 'Psicologico (PASS≥30)', text: 'Valutazione ansiolitica strutturata preoperatoria con colloquio dedicato', src: 'BJA Consensus 2024', ev: 'B' });
    recs.push({ icon: '💬', cat: 'Counseling (PASS≥30)', text: 'Counseling preoperatorio focalizzato su ansia da dolore (2-3 sessioni)', src: 'APS Guidelines', ev: 'B' });
    recs.push({ icon: '💊', cat: 'Farmacologico (PASS≥30)', text: 'Considerare clonidina 0.1-0.2mg preoperatoria se ansia severa (effetto ansiolitico + analgesico preemptivo)', src: 'Expert consensus', ev: 'expert' });
  }
  if (csi >= 40) {
    recs.push({ icon: '💊', cat: 'Farmacologico (CSI≥40)', text: 'Pregabalin 75-150mg x2/die è PRIORITARIO: agisce specificamente sui canali calcio voltage-dipendenti, target della sensitizzazione centrale', src: 'IASP 2021', ev: 'A' });
    recs.push({ icon: '💊', cat: 'Farmacologico (CSI≥40)', text: 'Duloxetina 60mg/die perioperatoria: INDICATA in presenza di CSI≥40 (sensitizzazione centrale documentata) come unica condizione con evidenza positiva', src: 'IASP Fact Sheet 2021', ev: 'B' });
    recs.push({ icon: '🔄', cat: 'Multimodale (CSI≥40)', text: 'Approccio multimodale obbligatorio, evitare strategia single-drug', src: 'APS Guidelines', ev: 'A' });
    recs.push({ icon: '🧠', cat: 'Psicologico (CSI≥40)', text: 'MBSR (Mindfulness-Based Stress Reduction) come complemento non farmacologico', src: 'Cochrane 2019', ev: 'B' });
    recs.push({ icon: '⚠️', cat: 'Attenzione (CSI≥40)', text: 'Sensibilità aumentata richiede titolazione analgesica più attenta intra e postoperatoria', src: 'Expert consensus', ev: 'expert' });
  }
  if (opioids === 'cronico') {
    recs.push({ icon: '🔄', cat: 'Oppioidi cronici', text: 'Opioid rotation perioperatoria se possibile (ridurre tolleranza crociata)', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '📉', cat: 'Oppioidi cronici', text: 'Piano di taper strutturato post-operatorio con supporto algologico', src: 'APS Guidelines 2016', ev: 'B' });
    recs.push({ icon: '👨‍⚕️', cat: 'Oppioidi cronici', text: 'Coinvolgimento obbligatorio algologo per gestione perioperatoria', src: 'Expert consensus', ev: 'expert' });
    recs.push({ icon: '💊', cat: 'Oppioidi cronici', text: 'Considerare buprenorfina SL/TDS come bridge perioperatorio (emerging evidence)', src: 'Expert consensus', ev: 'expert' });
  }
  if (preOpNRS >= 7) {
    recs.push({ icon: '🎯', cat: 'NRS preop≥7', text: 'Trattare aggressivamente il dolore preoperatorio PRIMA dell\'intervento ("pain predicts pain": NRS preop è predittore indipendente principale nel modello PERISCOPE 2025)', src: 'PERISCOPE Trial 2025', ev: 'A' });
    recs.push({ icon: '💊', cat: 'NRS preop≥7', text: 'Ottimizzare terapia analgesica preoperatoria e documentare caratteristiche del dolore per confronto postoperatorio', src: 'APS Guidelines 2016', ev: 'B' });
  }
  if (dt >= 7) {
    recs.push({ icon: '🤝', cat: 'Psicologico', text: 'Distress severo (DT≥7): invio urgente a supporto psicologico/CBT perioperatorio. Expectation management strutturato (informazioni scritte + verbali)', src: 'Cohort prospettica n=357: DT≥7 associato a dolore persistente OR 2.05', ev: 'B' });
  }
  if (insomnia) {
    recs.push({ icon: '😴', cat: 'Sonno', text: 'Trattare insonnia preoperatoria prima dell\'intervento: igiene del sonno + gestione farmacologica se necessario (fattore di rischio modificabile per CPSP)', src: 'SR/MA: sleep disturbance pre-op r=0.13 con CPSP', ev: 'B' });
  }
  if (painOtherSites) {
    recs.push({ icon: '🔴', cat: 'Dolore cronico', text: 'Dolore cronico in altre sedi: indica sensibilizzazione sistemica. Intensificare approccio multimodale e valutare in team multidisciplinare', src: 'Cohort prospettica multicentrica n=960: dolore extra-sito predittore CPSP', ev: 'B' });
  }
  return recs;
}

// calcDynamicRisk imported from ./utils/cpspRisk

function CPSPTab({ patientId, profile, patient }: { patientId: string, profile: any, patient?: any }) {
  const tenantId = localStorage.getItem('tenant_id');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [view, setView] = useState<'list'|'assessment_form'|'followup_form'>('list');
  const [formTab, setFormTab] = useState<'info'|'screening'|'intraop'|'pcs'|'pass'|'csi'>('info');
  const [saving, setSaving] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string|null>(null);
  const [editingFollowupId, setEditingFollowupId] = useState<string|null>(null);

  // Assessment form state
  const [surgType, setSurgType] = useState('artroscopia');
  const [surgDate, setSurgDate] = useState('');
  const [opioidUse, setOpioidUse] = useState('nessuno');
  const [preOpNRS, setPreOpNRS] = useState(0);
  const [pcsScores, setPcsScores] = useState<number[]>(Array(13).fill(0));
  const [passScores, setPassScores] = useState<number[]>(Array(20).fill(0));
  const [csiScores, setCsiScores] = useState<number[]>(Array(25).fill(0));
  const [assNotes, setAssNotes] = useState('');
  // Dati clinici base
  const [concernAboutSurgery, setConcernAboutSurgery] = useState(0);
  // Dati intraoperatori
  const [surgeryDurationMinutes, setSurgeryDurationMinutes] = useState('');
  const [regionalAnesthesia, setRegionalAnesthesia] = useState(false);
  const [regionalAnesthesiaType, setRegionalAnesthesiaType] = useState('');
  const [autoPopulatedFromIntervention, setAutoPopulatedFromIntervention] = useState(false);
  // Screening clinico core fields
  const [painOtherSites, setPainOtherSites] = useState(false);
  const [painOtherSitesNRS, setPainOtherSitesNRS] = useState(0);
  const [insomniaPres, setInsomniaPres] = useState(false);
  const [insomniaSeverity, setInsomniaSeverity] = useState(0);
  const [distressThermometer, setDistressThermometer] = useState(0);
  const [smoking, setSmoking] = useState(false);
  const [alcoholRisk, setAlcoholRisk] = useState(false);
  const [bmiValue, setBmiValue] = useState('');
  const [frailty, setFrailty] = useState(false);
  const [opioidOmeMgDay, setOpioidOmeMgDay] = useState('');
  const [opioidDurationWeeks, setOpioidDurationWeeks] = useState('');
  // Remote risk computation state
  const [liveRisk, setLiveRisk] = useState<{ pct: number; level: string } | null>(null);
  const [liveRiskLoading, setLiveRiskLoading] = useState(false);
  const [riskRetryPayload, setRiskRetryPayload] = useState<{ assessmentId: string; [key: string]: any } | null>(null);

  // Followup form state
  const [fuMonths, setFuMonths] = useState(3);
  const [visitDate, setVisitDate] = useState('');
  const [painPresent, setPainPresent] = useState(false);
  const [nrsCurrent, setNrsCurrent] = useState(0);
  const [nrsRest, setNrsRest] = useState(0);
  const [nrsMovement, setNrsMovement] = useState(0);
  const [bpiScores, setBpiScores] = useState<number[]>(Array(7).fill(0));
  const [dn4Scores, setDn4Scores] = useState<boolean[]>(Array(7).fill(false));
  const [eq5dScores, setEq5dScores] = useState<number[]>(Array(5).fill(1));
  const [eq5dVas, setEq5dVas] = useState(50);
  const [analTherapy, setAnalTherapy] = useState('');
  const [opioidCurrent, setOpioidCurrent] = useState('nessuno');
  const [cpspConfirmed, setCpspConfirmed] = useState(false);
  const [referral, setReferral] = useState(false);
  const [fuNotes, setFuNotes] = useState('');
  // New follow-up fields
  const [fasScore, setFasScore] = useState('');
  const [fuOpioidOme, setFuOpioidOme] = useState('');
  const [fuOpioidDays, setFuOpioidDays] = useState('');
  // Early neuropathic phenotype (2-week follow-up)
  const [earlyNeuropathic, setEarlyNeuropathic] = useState<boolean[]>(Array(4).fill(false));
  // Collapsible sections state (followup form)
  const [openNeuro, setOpenNeuro] = useState(true);
  const [openCpspAlgo, setOpenCpspAlgo] = useState(false);
  const [openQoL, setOpenQoL] = useState(false);
  const [openPsych, setOpenPsych] = useState(false);
  const [bpiExpanded, setBpiExpanded] = useState(false);

  // CPSP Diagnostic Algorithm state
  const [cpspDiagPainPresent, setCpspDiagPainPresent] = useState(false);
  const [cpspDiagDuration3m, setCpspDiagDuration3m] = useState(false);
  const [cpspDiagSiteCorrelated, setCpspDiagSiteCorrelated] = useState(false);
  const [cpspAltExcluded, setCpspAltExcluded] = useState(false);
  const [oncologicPatient, setOncologicPatient] = useState(false);
  const [oncologicRecurrenceExcluded, setOncologicRecurrenceExcluded] = useState(false);
  const [infectionExcluded, setInfectionExcluded] = useState(false);
  const [hardwareExcluded, setHardwareExcluded] = useState(false);
  const [crpsSuspected, setCrpsSuspected] = useState(false);
  const [referralAps, setReferralAps] = useState(false);
  const [phq9Answers, setPhq9Answers] = useState<number[]>(Array(9).fill(0));
  const [gad7Answers, setGad7Answers] = useState<number[]>(Array(7).fill(0));
  const [cpspPhenotype, setCpspPhenotype] = useState('');
  const [neupSigStep, setNeupSigStep] = useState('');
  const [neupSigDrug, setNeupSigDrug] = useState('');

  // Current assessment id (set after save or on load)
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string|null>(null);

  // NRS daily monitoring data (post-discharge)
  const [nrsDaily, setNrsDaily] = useState<any[]>([]);

  // POD1 dynamic risk state
  const [pod1NrsRest, setPod1NrsRest] = useState(0);
  const [pod1NrsMovement, setPod1NrsMovement] = useState(0);
  const [pod1Ome, setPod1Ome] = useState('');
  const [pod1Open, setPod1Open] = useState(false);
  const [pod1Saving, setPod1Saving] = useState(false);

  // QR code state
  const [qrUrl, setQrUrl] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const [qrCompleted, setQrCompleted] = useState(false);
  const [qrCheckLoading, setQrCheckLoading] = useState(false);
  const [qrNotification, setQrNotification] = useState('');
  const [completedQrAssessments, setCompletedQrAssessments] = useState<Set<string>>(new Set());
  const [postDischargeTokenRow, setPostDischargeTokenRow] = useState<any>(null);
  const [postDischargeQrUrl, setPostDischargeQrUrl] = useState('');
  const [postDischargeQrCopied, setPostDischargeQrCopied] = useState(false);
  const [postDischargeQrGenerating, setPostDischargeQrGenerating] = useState(false);
  const [postDischargeShareModal, setPostDischargeShareModal] = useState(false);
  const [postDischargeExpiresAt, setPostDischargeExpiresAt] = useState('');
  const [qrMissingDays, setQrMissingDays] = useState<number[]>([]);
  const [qrCoveredDays, setQrCoveredDays] = useState<number[]>([]);

  // Manual POD entry modal
  const [podEditModal, setPodEditModal] = useState(false);
  const [podEditDay, setPodEditDay] = useState(1);
  const [podEditNrsRest, setPodEditNrsRest] = useState<number>(0);
  const [podEditNrsMovement, setPodEditNrsMovement] = useState<number>(0);
  const [podEditInterference, setPodEditInterference] = useState<number | null>(null);
  const [podEditSleep, setPodEditSleep] = useState<number | null>(null);
  const [podEditMood, setPodEditMood] = useState<number | null>(null);
  const [podEditOpioids, setPodEditOpioids] = useState(false);
  const [podEditOpioidName, setPodEditOpioidName] = useState('');
  const [podEditSaving, setPodEditSaving] = useState(false);

  const generateQr = async () => {
    if (!currentAssessmentId) {
      alert('Salva prima la valutazione preoperatoria prima di generare il QR.');
      return;
    }
    setQrLoading(true);
    const tenantId = localStorage.getItem('tenant_id');
    const { data, error } = await supabase
      .from('patient_questionnaire_tokens')
      .insert({
        assessment_id: currentAssessmentId,
        patient_id: patientId,
        tenant_id: tenantId,
        scales: ['pcs', 'pass', 'csi'],
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (error) { alert('Errore nella creazione del token: ' + error.message); setQrLoading(false); return; }
    const link = `https://claudiogargiulo1-hash.github.io/aps-web/#/q/${data.token}`;
    setQrUrl(link);
    setQrToken(data.token);
    setQrCompleted(false);
    setQrNotification('');
    setQrLoading(false);
  };

  const handleGeneratePostDischargeQR = async (assessmentId: string) => {
    setPostDischargeQrGenerating(true);
    const tenantId = localStorage.getItem('tenant_id');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    // Calcola i giorni già coperti da rilevazioni APS
    const { data: existingDays } = await supabase
      .from('cpsp_nrs_daily')
      .select('pod_day')
      .eq('assessment_id', assessmentId);
    const coveredDays = (existingDays ?? []).map((d: any) => d.pod_day as number);
    const missingDays = [1,2,3,4,5,6,7].filter(d => !coveredDays.includes(d));

    if (missingDays.length === 0) {
      setPostDischargeQrGenerating(false);
      alert('✅ Tutti i 7 giorni sono già coperti dalle rilevazioni APS!');
      return;
    }

    // Calcola la discharge_date retro-datando dal primo giorno mancante
    const firstMissingDay = Math.min(...missingDays);
    const dischargeDate = new Date();
    dischargeDate.setDate(dischargeDate.getDate() - (firstMissingDay - 1));
    const dischargeDateStr = dischargeDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('patient_questionnaire_tokens')
      .insert({
        assessment_id: assessmentId,
        patient_id: patientId,
        tenant_id: tenantId,
        token_type: 'post_discharge_nrs',
        scales: ['post_discharge_nrs'],
        discharge_date: dischargeDateStr,
        valid_until_pod: Math.max(...missingDays),
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, token, status')
      .single();
    setPostDischargeQrGenerating(false);
    if (error) { alert('Errore: ' + error.message); return; }
    const tok = data.token ?? data.id;
    const link = `https://claudiogargiulo1-hash.github.io/aps-web/#/q/${tok}`;
    setPostDischargeQrUrl(link);
    setPostDischargeExpiresAt(expiresAt);
    setPostDischargeTokenRow({ ...data, status: 'pending' });
    setQrMissingDays(missingDays);
    setQrCoveredDays(coveredDays);
    setPostDischargeShareModal(true);
  };

  const openPodEditModal = (day: number, existing?: any) => {
    setPodEditDay(day);
    if (existing) {
      setPodEditNrsRest(existing.nrs_rest ?? 0);
      setPodEditNrsMovement(existing.nrs_movement ?? 0);
      setPodEditInterference(existing.pain_interference ?? null);
      setPodEditSleep(existing.sleep_quality ?? null);
      setPodEditMood(existing.mood_score ?? null);
      setPodEditOpioids(existing.analgesics_used ?? false);
      setPodEditOpioidName(existing.opioid_name ?? '');
    } else {
      setPodEditNrsRest(0);
      setPodEditNrsMovement(0);
      setPodEditInterference(null);
      setPodEditSleep(null);
      setPodEditMood(null);
      setPodEditOpioids(false);
      setPodEditOpioidName('');
    }
    setPodEditModal(true);
  };

  const savePodEntry = async (assessmentId: string) => {
    setPodEditSaving(true);
    const tenantId = localStorage.getItem('tenant_id');
    const { error } = await supabase.from('cpsp_nrs_daily').upsert({
      patient_id: patientId,
      assessment_id: assessmentId,
      tenant_id: tenantId,
      pod_day: podEditDay,
      nrs_rest: podEditNrsRest,
      nrs_movement: podEditNrsMovement,
      pain_interference: podEditInterference,
      sleep_quality: podEditSleep,
      mood_score: podEditMood,
      analgesics_used: podEditOpioids,
      opioid_name: podEditOpioidName || null,
      source: 'clinician',
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id,pod_day,source' });
    setPodEditSaving(false);
    if (error) { alert('Errore: ' + error.message); return; }
    setPodEditModal(false);
    await loadData();
  };

  const loadData = useCallback(async () => {
    const [aRes, fRes, tRes, nrsRes, pdRes] = await Promise.all([
      cpspSvc.loadAssessments(supabase, patientId),
      cpspSvc.loadFollowups(supabase, patientId),
      supabase.from('patient_questionnaire_tokens').select('assessment_id').eq('patient_id', patientId).eq('status', 'completed'),
      supabase.from('cpsp_nrs_daily').select('*').eq('patient_id', patientId).order('pod_day', { ascending: true }),
      supabase.from('patient_questionnaire_tokens').select('*')
        .eq('patient_id', patientId)
        .eq('token_type', 'post_discharge_nrs')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // Query opioid_prescriptions separata: errore non blocca il resto del caricamento
    let rxRes: { data: { ome_daily: any }[] | null } = { data: null };
    try {
      const r = await supabase.from('opioid_prescriptions').select('ome_daily').eq('patient_id', patientId);
      rxRes = r;
    } catch (_) { /* tabella non ancora creata */ }
    const assessmentData = aRes.data || [];
    setAssessments(assessmentData);
    if (assessmentData.length > 0) {
      setCurrentAssessmentId(assessmentData[0].id);
      if (assessmentData[0].pod1_assessed_at) {
        setPod1NrsRest(assessmentData[0].pod1_nrs_rest ?? 0);
        setPod1NrsMovement(assessmentData[0].pod1_nrs_movement ?? 0);
        setPod1Ome(assessmentData[0].pod1_opioid_ome != null ? String(assessmentData[0].pod1_opioid_ome) : '');
      }
      // Pre-fill OME from saved assessment; fallback to prescriptions sum if empty
      const savedOme = assessmentData[0].opioid_ome_mg_day;
      if (savedOme != null) {
        setOpioidOmeMgDay(String(savedOme));
      } else {
        const rxTotal = (rxRes.data || []).reduce((s: number, r: any) => s + (r.ome_daily || 0), 0);
        if (rxTotal > 0) setOpioidOmeMgDay(String(Math.round(rxTotal * 10) / 10));
      }
    } else {
      // No assessment yet — pre-fill from prescriptions if available
      const rxTotal = (rxRes.data || []).reduce((s: number, r: any) => s + (r.ome_daily || 0), 0);
      if (rxTotal > 0) setOpioidOmeMgDay(String(Math.round(rxTotal * 10) / 10));
    }
    setFollowups(fRes.data || []);
    setCompletedQrAssessments(new Set((tRes.data || []).map((t: any) => t.assessment_id)));
    setNrsDaily(nrsRes.data || []);
    setPostDischargeTokenRow(pdRes.data ?? null);
  }, [patientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const checkQrStatus = useCallback(async () => {
    if (!qrToken) return;
    setQrCheckLoading(true);
    const { data } = await supabase
      .from('patient_questionnaire_tokens')
      .select('status')
      .eq('token', qrToken)
      .single();
    setQrCheckLoading(false);
    if (data?.status === 'completed') {
      setQrCompleted(true);
      setQrNotification('✅ Il paziente ha completato il questionario! Score aggiornato.');
      await loadData();
    }
  }, [qrToken, loadData]);

  // Polling automatico ogni 10 secondi mentre il modal QR è aperto
  useEffect(() => {
    if (!qrUrl || !qrToken) return;
    const interval = setInterval(checkQrStatus, 10000);
    return () => clearInterval(interval);
  }, [qrUrl, qrToken, checkQrStatus]);

  const editAssessment = (a: any) => {
    setSurgType(a.surgery_type || 'artroscopia');
    setSurgDate(a.surgery_date || '');
    setOpioidUse(a.opioid_use_preop || 'nessuno');
    setPreOpNRS(a.preop_nrs ?? 0);
    setPcsScores(a.pcs_answers || Array(13).fill(0));
    setPassScores(a.pass_answers || Array(20).fill(0));
    setCsiScores(a.csi_answers || Array(25).fill(0));
    setAssNotes(a.notes || '');
    setPainOtherSites(a.pain_other_sites || false);
    setPainOtherSitesNRS(a.pain_other_sites_nrs ?? 0);
    setInsomniaPres(a.insomnia_present || false);
    setInsomniaSeverity(a.insomnia_severity ?? 0);
    setDistressThermometer(a.distress_thermometer ?? 0);
    setSmoking(a.smoking || false);
    setAlcoholRisk(a.alcohol_risk || false);
    setBmiValue(a.bmi ? String(a.bmi) : '');
    setFrailty(a.frailty || false);
    setOpioidOmeMgDay(a.opioid_ome_mg_day ? String(a.opioid_ome_mg_day) : '');
    setOpioidDurationWeeks(a.opioid_duration_weeks ? String(a.opioid_duration_weeks) : '');
    setConcernAboutSurgery(a.concern_about_surgery ?? 0);
    // BMI manual fallback only if no bio data from patient record
    if (!computedBmi) setBmiValue(a.bmi ? String(a.bmi) : '');
    setSurgeryDurationMinutes(a.surgery_duration_minutes ? String(a.surgery_duration_minutes) : '');
    setRegionalAnesthesia(a.regional_anesthesia || false);
    setRegionalAnesthesiaType(a.regional_anesthesia_type || '');
    setEditingAssessmentId(a.id);
    setFormTab('info');
    setView('assessment_form');
  };

  const editFollowup = (f: any) => {
    setFuMonths(f.followup_months || 3);
    setVisitDate(f.followup_date || '');
    setPainPresent(f.pain_present || false);
    setNrsCurrent(f.pain_nrs_current ?? 0);
    setNrsRest(f.pain_nrs_rest ?? 0);
    setNrsMovement(f.pain_nrs_movement ?? 0);
    setBpiScores([f.bpi_general_activity, f.bpi_mood, f.bpi_walking, f.bpi_work, f.bpi_relations, f.bpi_sleep, f.bpi_enjoyment].map((v: any) => v ?? 0));
    setDn4Scores(f.dn4_answers || Array(7).fill(false));
    setEq5dScores([f.eq5d_mobility, f.eq5d_self_care, f.eq5d_usual_activities, f.eq5d_pain, f.eq5d_anxiety].map((v: any) => v ?? 1));
    setEq5dVas(f.eq5d_vas ?? 50);
    setAnalTherapy(f.current_therapy || '');
    setOpioidCurrent(f.opioid_use || 'nessuno');
    setCpspConfirmed(f.cpsp_confirmed || false);
    setReferral(f.referral_pain_center || false);
    setFuNotes(f.notes || '');
    setFasScore(f.fas_score || '');
    setFuOpioidOme(f.fu_opioid_ome ? String(f.fu_opioid_ome) : '');
    setFuOpioidDays(f.fu_opioid_days ? String(f.fu_opioid_days) : '');
    setCpspDiagPainPresent(f.cpsp_diag_pain_present || false);
    setCpspDiagDuration3m(f.cpsp_diag_duration_3m || false);
    setCpspDiagSiteCorrelated(f.cpsp_diag_site_correlated || false);
    setCpspAltExcluded(f.cpsp_alternative_excluded || false);
    setOncologicPatient(f.oncologic_patient || false);
    setOncologicRecurrenceExcluded(f.oncologic_recurrence_excluded || false);
    setInfectionExcluded(f.infection_excluded || false);
    setHardwareExcluded(f.hardware_complication_excluded || false);
    setCrpsSuspected(f.crps_suspected || false);
    setReferralAps(f.referral_aps || false);
    setPhq9Answers(Array.isArray(f.phq9_answers) ? f.phq9_answers : Array(9).fill(0));
    setGad7Answers(Array.isArray(f.gad7_answers) ? f.gad7_answers : Array(7).fill(0));
    setCpspPhenotype(f.cpsp_phenotype || '');
    setNeupSigStep(f.neup_sig_step || '');
    setNeupSigDrug(f.neup_sig_drug || '');
    setEarlyNeuropathic([
      f.early_neuropathic_burning || false,
      f.early_neuropathic_electric || false,
      f.early_neuropathic_allodynia || false,
      f.early_neuropathic_cold || false,
    ]);
    setEditingFollowupId(f.id);
    setView('followup_form');
  };

  const deleteAssessment = async (id: string) => {
    if (!window.confirm('Eliminare questa valutazione preoperatoria? L\'operazione non è reversibile.')) return;
    await cpspSvc.deleteAssessment(supabase, id);
    await loadData();
  };

  const deleteFollowup = async (id: string) => {
    if (!window.confirm('Eliminare questo follow-up? L\'operazione non è reversibile.')) return;
    await cpspSvc.deleteFollowup(supabase, id);
    await loadData();
  };

  const savePod1 = async () => {
    if (!currentAssessmentId) return;
    const currentAss = assessments.find(a => a.id === currentAssessmentId);
    if (!currentAss) return;
    setPod1Saving(true);
    const preOpPct = currentAss.cpsp_risk_pct ?? 0;
    const omeVal = parseFloat(pod1Ome) || 0;
    const { dynamicPct, dynamicLevel, delta } = calcDynamicRisk(preOpPct, pod1NrsRest, pod1NrsMovement, omeVal);
    const { error } = await cpspSvc.saveAssessment(supabase, {
      pod1_nrs_rest: pod1NrsRest,
      pod1_nrs_movement: pod1NrsMovement,
      pod1_opioid_ome: parseFloat(pod1Ome) || null,
      pod1_assessed_at: new Date().toISOString(),
      risk_score_dynamic: dynamicPct,
      risk_pct_dynamic: dynamicPct,
      risk_level_dynamic: dynamicLevel,
      risk_delta: delta,
    }, currentAssessmentId);
    if (error) { alert('Errore nel salvataggio POD1: ' + error.message); setPod1Saving(false); return; }
    await loadData();
    setPod1Saving(false);
  };

  const resetAssessmentForm = () => {
    setSurgType('artroscopia'); setSurgDate(''); setOpioidUse('nessuno'); setPreOpNRS(0);
    setPcsScores(Array(13).fill(0)); setPassScores(Array(20).fill(0)); setCsiScores(Array(25).fill(0)); setAssNotes('');
    setPainOtherSites(false); setPainOtherSitesNRS(0); setInsomniaPres(false); setInsomniaSeverity(0);
    setDistressThermometer(0); setSmoking(false); setAlcoholRisk(false); setBmiValue(''); setFrailty(false);
    setOpioidOmeMgDay(''); setOpioidDurationWeeks('');
    setConcernAboutSurgery(0); setBmiValue('');
    setSurgeryDurationMinutes(''); setRegionalAnesthesia(false); setRegionalAnesthesiaType('');
    setAutoPopulatedFromIntervention(false);
    setEditingAssessmentId(null); setFormTab('info');
  };

  const openNewAssessmentForm = async () => {
    resetAssessmentForm();
    const { data: latestIntervention } = await supabase
      .from('interventions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestIntervention) {
      let populated = false;
      if (latestIntervention.duration_minutes) {
        setSurgeryDurationMinutes(String(latestIntervention.duration_minutes));
        populated = true;
      }
      const REGIONAL_TYPES = ['epidurale', 'locoregionale', 'spinale'];
      const anesthesiaIsRegional = latestIntervention.anesthesia_type
        ? REGIONAL_TYPES.includes(latestIntervention.anesthesia_type)
        : false;
      const hasRegionalBlocks = latestIntervention.regional_blocks && latestIntervention.regional_blocks.trim() !== '';
      if (anesthesiaIsRegional || hasRegionalBlocks) {
        setRegionalAnesthesia(true);
        if (hasRegionalBlocks) setRegionalAnesthesiaType(latestIntervention.regional_blocks);
        populated = true;
      }
      if (populated) setAutoPopulatedFromIntervention(true);
    }
    setView('assessment_form');
  };

  const resetFollowupForm = () => {
    setFuMonths(3); setVisitDate(''); setPainPresent(false); setNrsCurrent(0); setNrsRest(0); setNrsMovement(0);
    setBpiScores(Array(7).fill(0)); setDn4Scores(Array(7).fill(false)); setEq5dScores(Array(5).fill(1)); setEq5dVas(50);
    setAnalTherapy(''); setOpioidCurrent('nessuno'); setCpspConfirmed(false); setReferral(false); setFuNotes('');
    setFasScore(''); setFuOpioidOme(''); setFuOpioidDays('');
    setCpspDiagPainPresent(false); setCpspDiagDuration3m(false); setCpspDiagSiteCorrelated(false);
    setCpspAltExcluded(false); setOncologicPatient(false); setOncologicRecurrenceExcluded(false);
    setInfectionExcluded(false); setHardwareExcluded(false); setCrpsSuspected(false);
    setReferralAps(false); setPhq9Answers(Array(9).fill(0)); setGad7Answers(Array(7).fill(0)); setCpspPhenotype('');
    setNeupSigStep(''); setNeupSigDrug('');
    setEarlyNeuropathic(Array(4).fill(false));
    setEditingFollowupId(null);
  };

  const pcsTotal = pcsScores.reduce((a, b) => a + b, 0);
  const passTotal = passScores.reduce((a, b) => a + b, 0);
  const csiTotal = csiScores.reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (view !== 'assessment_form') return;
    setLiveRiskLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('compute-cpsp-risk', { body: {
        surgeryType: surgType, opioids: opioidUse, nrsPreop: preOpNRS,
        pcsTotal, passTotal, csiTotal, distressThermometer,
        painOtherSites, insomniaPresent: insomniaPres, smoking, frailty,
      }});
      if (!error && data?.pct != null) {
        setLiveRisk({ pct: data.pct, level: data.level });
      } else {
        setLiveRisk(null);
      }
      setLiveRiskLoading(false);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, surgType, opioidUse, preOpNRS, pcsTotal, passTotal, csiTotal, distressThermometer, painOtherSites, insomniaPres, smoking, frailty]);

  // Auto-computed from patient anagrafica
  const patientWeight = patient?.weight_kg ? Number(patient.weight_kg) : null;
  const patientHeight = patient?.height_cm ? Number(patient.height_cm) : null;
  const computedBmi = patientWeight && patientHeight
    ? Math.round((patientWeight / Math.pow(patientHeight / 100, 2)) * 10) / 10
    : null;
  const computedAge = patient?.date_of_birth
    ? Math.floor((new Date().getTime() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const computedSex = patient?.gender || null;
  const hasBioData = computedBmi !== null;

  const saveAssessment = async () => {
    if (!surgType) return alert('Seleziona il tipo di intervento');
    setSaving(true);
    setRiskRetryPayload(null);
    const riskPayload = {
      surgeryType: surgType, opioids: opioidUse, nrsPreop: preOpNRS,
      pcsTotal, passTotal, csiTotal, distressThermometer,
      painOtherSites, insomniaPresent: insomniaPres, smoking, frailty,
    };
    const assData = {
      surgery_type: surgType, surgery_date: surgDate || null, opioid_use_preop: opioidUse, preop_nrs: preOpNRS,
      pcs_answers: pcsScores, pcs_score: pcsTotal,
      pass_answers: passScores, pass_score: passTotal,
      csi_answers: csiScores, csi_score: csiTotal,
      pain_other_sites: painOtherSites, pain_other_sites_nrs: painOtherSites ? painOtherSitesNRS : null,
      insomnia_present: insomniaPres, insomnia_severity: insomniaPres ? insomniaSeverity : null,
      distress_thermometer: distressThermometer,
      smoking, alcohol_risk: alcoholRisk,
      bmi: computedBmi ?? (bmiValue ? Number(bmiValue) : null),
      frailty,
      opioid_ome_mg_day: (opioidUse !== 'nessuno' && opioidOmeMgDay) ? Number(opioidOmeMgDay) : null,
      opioid_duration_weeks: (opioidUse !== 'nessuno' && opioidDurationWeeks) ? Number(opioidDurationWeeks) : null,
      age: computedAge ?? null,
      sex: computedSex ?? null,
      concern_about_surgery: concernAboutSurgery,
      surgery_duration_minutes: surgeryDurationMinutes ? parseInt(surgeryDurationMinutes) : null,
      regional_anesthesia: regionalAnesthesia,
      regional_anesthesia_type: regionalAnesthesia ? (regionalAnesthesiaType || null) : null,
      notes: assNotes || null,
    };
    let savedId: string | null = null;
    if (editingAssessmentId) {
      const { error: updateError } = await cpspSvc.saveAssessment(supabase, assData, editingAssessmentId);
      if (updateError) { alert('Errore nel salvataggio: ' + updateError.message); setSaving(false); return; }
      savedId = editingAssessmentId;
      setCurrentAssessmentId(editingAssessmentId);
    } else {
      const { data: inserted, error: insertError } = await cpspSvc.saveAssessment(supabase, {
        ...assData, patient_id: patientId, tenant_id: tenantId, recorded_by: profile?.id,
      });
      if (insertError) { alert('Errore nel salvataggio: ' + insertError.message); setSaving(false); return; }
      savedId = inserted.id;
      setCurrentAssessmentId(inserted.id);
    }
    const { data: riskData, error: riskError } = await supabase.functions.invoke('compute-cpsp-risk', { body: riskPayload });
    if (!riskError && riskData?.pct != null && savedId) {
      await cpspSvc.saveAssessment(supabase, { cpsp_risk_pct: riskData.pct, cpsp_risk_level: riskData.level, engine_version: '2026.06.0' }, savedId);
    } else if (savedId) {
      setRiskRetryPayload({ assessmentId: savedId, ...riskPayload });
    }
    await loadData(); setView('list'); setSaving(false); resetAssessmentForm();
  };

  const bpiAvg = bpiScores.reduce((a, b) => a + b, 0) / 7;
  const dn4Total = dn4Scores.filter(Boolean).length;
  const phq9Score = phq9Answers.reduce((a, b) => a + b, 0);
  const gad7Score = gad7Answers.reduce((a, b) => a + b, 0);
  const cpspStep1Positive = cpspDiagPainPresent && cpspDiagDuration3m && cpspDiagSiteCorrelated;
  const cpspAltAllExcluded = infectionExcluded && hardwareExcluded && oncologicRecurrenceExcluded;
  const cpspConfirmedByAlgo = cpspStep1Positive && cpspAltAllExcluded;

  const saveFollowup = async () => {
    setSaving(true);
    // Payload limitato SOLO alle colonne di cpsp_followups — tipi espliciti per ogni campo
    const fuData = {
      // INTEGER
      followup_months: parseInt(String(fuMonths)) || 0,
      pain_nrs_current: painPresent ? (parseInt(String(nrsCurrent)) || 0) : null,
      pain_nrs_rest:    painPresent ? (parseInt(String(nrsRest))    || 0) : null,
      pain_nrs_movement:painPresent ? (parseInt(String(nrsMovement))|| 0) : null,
      bpi_general_activity: parseInt(String(bpiScores[0])) || 0,
      bpi_mood:             parseInt(String(bpiScores[1])) || 0,
      bpi_walking:          parseInt(String(bpiScores[2])) || 0,
      bpi_work:             parseInt(String(bpiScores[3])) || 0,
      bpi_relations:        parseInt(String(bpiScores[4])) || 0,
      bpi_sleep:            parseInt(String(bpiScores[5])) || 0,
      bpi_enjoyment:        parseInt(String(bpiScores[6])) || 0,
      dn4_score:            parseInt(String(dn4Total))     || 0,
      eq5d_mobility:        parseInt(String(eq5dScores[0]))|| 0,
      eq5d_self_care:       parseInt(String(eq5dScores[1]))|| 0,
      eq5d_usual_activities:parseInt(String(eq5dScores[2]))|| 0,
      eq5d_pain:            parseInt(String(eq5dScores[3]))|| 0,
      eq5d_anxiety:         parseInt(String(eq5dScores[4]))|| 0,
      eq5d_vas:             parseInt(String(eq5dVas))      || 0,
      phq9_score:           phq9Score,
      phq9_answers:         phq9Answers,
      gad7_score:           gad7Score,
      gad7_answers:         gad7Answers,
      neup_sig_step:        neupSigStep ? (parseInt(String(neupSigStep)) || null) : null,
      early_neuropathic_burning:   Boolean(earlyNeuropathic[0]),
      early_neuropathic_electric:  Boolean(earlyNeuropathic[1]),
      early_neuropathic_allodynia: Boolean(earlyNeuropathic[2]),
      early_neuropathic_cold:      Boolean(earlyNeuropathic[3]),
      early_neuropathic_score:     earlyNeuropathic.filter(Boolean).length,
      fu_opioid_days: (opioidCurrent !== 'nessuno' && fuOpioidDays) ? (parseInt(String(fuOpioidDays)) || null) : null,
      // FLOAT
      fu_opioid_ome: (opioidCurrent !== 'nessuno' && fuOpioidOme) ? (parseFloat(String(fuOpioidOme)) || null) : null,
      // BOOLEAN
      pain_present:                   Boolean(painPresent),
      dn4_neuropathic:                dn4Total >= 4,
      cpsp_confirmed:                 Boolean(cpspConfirmed),
      referral_pain_center:           Boolean(referral),
      referral_aps:                   Boolean(referralAps),
      cpsp_diag_pain_present:         Boolean(cpspDiagPainPresent),
      cpsp_diag_duration_3m:          Boolean(cpspDiagDuration3m),
      cpsp_diag_site_correlated:      Boolean(cpspDiagSiteCorrelated),
      cpsp_alternative_excluded:      Boolean(cpspAltExcluded),
      oncologic_patient:              Boolean(oncologicPatient),
      oncologic_recurrence_excluded:  Boolean(oncologicRecurrenceExcluded),
      infection_excluded:             Boolean(infectionExcluded),
      hardware_complication_excluded: Boolean(hardwareExcluded),
      crps_suspected:                 Boolean(crpsSuspected),
      // TEXT / JSONB / nullable
      followup_date:  visitDate || null,
      current_therapy: analTherapy || null,
      opioid_use:      opioidCurrent,
      notes:           fuNotes || null,
      fas_score:      fasScore || null,
      cpsp_phenotype: cpspPhenotype || null,
      neup_sig_drug:   neupSigDrug || null,
    };

    // Diagnostica tipi prima dell'insert
    const integerFields = [
      'followup_months','pain_nrs_current','pain_nrs_rest','pain_nrs_movement',
      'bpi_general_activity','bpi_mood','bpi_walking','bpi_work',
      'bpi_relations','bpi_sleep','bpi_enjoyment','dn4_score',
      'eq5d_mobility','eq5d_self_care','eq5d_usual_activities','eq5d_pain',
      'eq5d_anxiety','eq5d_vas','phq9_score','gad7_score','neup_sig_step', // phq9/gad7 derivati dagli array
      'early_neuropathic_score','fu_opioid_days',
    ];
    const booleanFields = [
      'pain_present','dn4_neuropathic','cpsp_confirmed','referral_pain_center',
      'referral_aps','cpsp_diag_pain_present','cpsp_diag_duration_3m',
      'cpsp_diag_site_correlated','cpsp_alternative_excluded','oncologic_patient',
      'oncologic_recurrence_excluded','infection_excluded',
      'hardware_complication_excluded','crps_suspected',
      'early_neuropathic_burning','early_neuropathic_electric',
      'early_neuropathic_allodynia','early_neuropathic_cold',
    ];
    integerFields.forEach(field => {
      if ((fuData as any)[field] === false || (fuData as any)[field] === true)
        console.error('CAMPO INTEGER CHE RICEVE BOOLEAN:', field, '=', (fuData as any)[field]);
    });
    booleanFields.forEach(field => {
      if ((fuData as any)[field] === 0 || (fuData as any)[field] === 1)
        console.error('CAMPO BOOLEAN CHE RICEVE INTEGER:', field, '=', (fuData as any)[field]);
    });

    if (editingFollowupId) {
      const { error } = await cpspSvc.saveFollowup(supabase, fuData, editingFollowupId);
      if (error) {
        console.error('FOLLOWUP UPDATE ERROR:', error.message, error.details, error.hint);
        alert('Errore aggiornamento follow-up: ' + error.message);
        setSaving(false); return;
      }
    } else {
      const insertPayload = { ...fuData, patient_id: patientId, assessment_id: currentAssessmentId || null, tenant_id: tenantId, recorded_by: profile?.id };
      console.log('FOLLOWUP PAYLOAD:', JSON.stringify(insertPayload, null, 2));
      const { error } = await cpspSvc.saveFollowup(supabase, insertPayload);
      if (error) {
        console.error('FOLLOWUP INSERT ERROR:', error.message, error.details, error.hint);
        alert('Errore salvataggio follow-up: ' + error.message);
        setSaving(false); return;
      }
    }

    // loadData include query a opioid_prescriptions: wrappata in try-catch
    // per evitare che un errore su quella tabella blocchi la navigazione post-save
    try { await loadData(); } catch (e) { console.warn('loadData post-followup:', e); }
    setView('list'); setSaving(false); resetFollowupForm();
  };

  const ScoreRow = ({ items, scores, setScores, maxScore }: { items: string[], scores: number[], setScores: (s: number[]) => void, maxScore: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, color: T.text, paddingTop: 5, lineHeight: 1.45 }}>
            <span style={{ color: T.textLight, marginRight: 5, fontSize: 11 }}>{i + 1}.</span>{item}
          </div>
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {Array.from({ length: maxScore + 1 }, (_, n) => (
              <button key={n} onClick={() => { const s = [...scores]; s[i] = n; setScores(s); }}
                style={{ width: 28, height: 28, borderRadius: 7, border: `1.5px solid ${scores[i] === n ? T.primary : T.border}`,
                  backgroundColor: scores[i] === n ? T.primary : '#fff', color: scores[i] === n ? '#fff' : T.textMuted,
                  fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // NRSRow → NRSSlider (extracted to src/components/cpsp/NRSSlider.tsx)
  const NRSRow = NRSSlider;

  if (view === 'assessment_form') {
    const fTabs = [
      { key: 'info', label: '📋 Info' },
      { key: 'screening', label: '🩺 Screening' },
      { key: 'intraop', label: '🔧 Intraop' },
      { key: 'pcs', label: `PCS (${pcsTotal}/52)` },
      { key: 'pass', label: `PASS (${passTotal}/100)` },
      { key: 'csi', label: `CSI (${csiTotal}/100)` },
    ];
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{editingAssessmentId ? '✏️ Modifica Valutazione Preoperatoria' : '🧠 Nuova Valutazione Preoperatoria'}</h3>
          <button onClick={() => { resetAssessmentForm(); setView('list'); }} style={btn('ghost', 'sm')}>✕ Annulla</button>
        </div>
        <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: T.textMuted, flex: 1 }}>Rischio CPSP stimato</span>
          {liveRiskLoading ? (
            <span style={{ fontSize: 13, color: T.textMuted }}>⏳ calcolo...</span>
          ) : liveRisk ? (
            <>
              <span style={{ fontWeight: 800, fontSize: 24, color: RISK_COLORS[liveRisk.level] }}>{liveRisk.pct}%</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: RISK_COLORS[liveRisk.level] }}>{RISK_LABELS[liveRisk.level]}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: T.textMuted }}>—</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, backgroundColor: T.bg, borderRadius: 12, padding: 4, overflowX: 'auto' as const }}>
          {fTabs.map(t => (
            <button key={t.key} onClick={() => setFormTab(t.key as any)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' as const,
                backgroundColor: formTab === t.key ? T.primary : 'transparent', color: formTab === t.key ? '#fff' : T.textMuted }}>
              {t.label}
            </button>
          ))}
        </div>
        {formTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>👤 Dati Clinici Base</div>
            {/* Read-only bio data from patient record */}
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <span style={{ fontSize: 11, backgroundColor: T.primaryLight, color: T.primary, borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>📋 Da anagrafica</span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, flex: 1 }}>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Età</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{computedAge != null ? `${computedAge} anni` : '—'}</div>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>Sesso</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{computedSex || '—'}</div>
                </div>
                {hasBioData && (
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>BMI</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: computedBmi! > 30 ? T.warning : computedBmi! < 18.5 ? T.warning : T.text }}>
                      {computedBmi}
                      {computedBmi! > 30 && <span style={{ marginLeft: 6, fontSize: 10, backgroundColor: T.warningLight, color: T.warning, borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>Obesità</span>}
                      {computedBmi! < 18.5 && <span style={{ marginLeft: 6, fontSize: 10, backgroundColor: '#FEF9C3', color: '#CA8A04', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>Sottopeso</span>}
                    </div>
                  </div>
                )}
                {!hasBioData && (
                  <div style={{ fontSize: 11, color: T.warning }}>
                    ⚠️ <span style={{ textDecoration: 'underline', cursor: 'default' }}>Aggiungi peso/altezza nell'anagrafica paziente</span> per il calcolo BMI automatico
                  </div>
                )}
              </div>
            </div>
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <label style={{ ...lbl, marginBottom: 6 }}>Preoccupazione per la chirurgia</label>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
                "Quanto è preoccupato/a per l'intervento chirurgico?" &nbsp;
                <span style={{ color: T.primary, fontWeight: 600 }}>(PERISCOPE 2025 — predittore indipendente CPSP)</span>
              </div>
              <input type="range" min={0} max={10} value={concernAboutSurgery}
                onChange={e => setConcernAboutSurgery(Number(e.target.value))}
                style={{ width: '100%', accentColor: concernAboutSurgery >= 7 ? T.danger : T.primary }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textLight }}>
                <span>0 — Per niente</span>
                <span style={{ fontWeight: 700, color: concernAboutSurgery >= 7 ? T.danger : T.primary }}>{concernAboutSurgery}</span>
                <span>10 — Moltissimo</span>
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, marginTop: 4 }}>🏥 Dati Chirurgici</div>
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Tipo intervento</label>
              <select value={surgType} onChange={e => setSurgType(e.target.value)} style={{ ...inp }}>
                {SURGERY_TYPES.map(s => <option key={s.value} value={s.value}>{s.label} (rischio {s.riskWeight}/10)</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Data intervento prevista</label>
              <input type="date" value={surgDate} onChange={e => setSurgDate(e.target.value)} style={{ ...inp }} />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 6 }}>Uso oppioidi preoperatorio</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: opioidUse !== 'nessuno' ? 10 : 0 }}>
                {[['nessuno', 'Nessuno'], ['intermittente', 'Intermittente'], ['cronico', 'Cronico']].map(([v, l]) => (
                  <button key={v} onClick={() => setOpioidUse(v)} style={{ ...chip(opioidUse === v), flex: 1, justifyContent: 'center' }}>{l}</button>
                ))}
              </div>
              {opioidUse !== 'nessuno' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...lbl, marginBottom: 4, fontSize: 11 }}>OME mg/die</label>
                    <input type="number" value={opioidOmeMgDay} onChange={e => setOpioidOmeMgDay(e.target.value)} placeholder="Es. 30" min={0}
                      style={{ ...inp }} />
                    {opioidOmeMgDay && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>💊 da prescrizioni attive</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...lbl, marginBottom: 4, fontSize: 11 }}>Durata (settimane)</label>
                    <input type="number" value={opioidDurationWeeks} onChange={e => setOpioidDurationWeeks(e.target.value)} placeholder="Es. 12" min={0}
                      style={{ ...inp }} />
                  </div>
                </div>
              )}
            </div>
            <NRSRow label="NRS dolore preoperatorio" value={preOpNRS} onChange={setPreOpNRS} />
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Note cliniche</label>
              <textarea value={assNotes} onChange={e => setAssNotes(e.target.value)} placeholder="Note..." rows={3}
                style={{ ...inp, resize: 'vertical' as const }} />
            </div>
          </div>
        )}
        {formTab === 'screening' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>🩺 Screening Clinico Core</div>

            {/* Dolore in altre sedi */}
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: painOtherSites ? 12 : 0 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Dolore in altre sedi oltre alla sede chirurgica?</label>
                <button onClick={() => setPainOtherSites(!painOtherSites)}
                  style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${painOtherSites ? T.danger : T.border}`,
                    backgroundColor: painOtherSites ? T.dangerLight : '#fff', color: painOtherSites ? T.danger : T.textMuted,
                    fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {painOtherSites ? 'Sì' : 'No'}
                </button>
              </div>
              {painOtherSites && <NRSRow label="Intensità dolore in altre sedi (NRS)" value={painOtherSitesNRS} onChange={setPainOtherSitesNRS} />}
            </div>

            {/* Screening insonnia */}
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: insomniaPres ? 12 : 0 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Disturbi del sonno / insonnia presente?</label>
                <button onClick={() => setInsomniaPres(!insomniaPres)}
                  style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${insomniaPres ? T.warning : T.border}`,
                    backgroundColor: insomniaPres ? T.warningLight : '#fff', color: insomniaPres ? T.warning : T.textMuted,
                    fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {insomniaPres ? 'Sì' : 'No'}
                </button>
              </div>
              {insomniaPres && (
                <div>
                  <label style={{ ...lbl, marginBottom: 6 }}>Severità insonnia (0 = nessuna · 10 = molto severa)</label>
                  <input type="range" min={0} max={10} value={insomniaSeverity}
                    onChange={e => setInsomniaSeverity(Number(e.target.value))}
                    style={{ width: '100%', accentColor: T.warning }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textLight }}>
                    <span>0</span><span style={{ fontWeight: 700, color: T.warning }}>{insomniaSeverity}</span><span>10</span>
                  </div>
                </div>
              )}
            </div>

            {/* Distress Thermometer */}
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Distress Thermometer — Quanto ti senti in difficoltà emotiva/psicologica in questo momento?</label>
              <input type="range" min={0} max={10} value={distressThermometer}
                onChange={e => setDistressThermometer(Number(e.target.value))}
                style={{ width: '100%', accentColor: distressThermometer >= 7 ? T.danger : T.primary }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textLight }}>
                <span>0 — Nessuno</span>
                <span style={{ fontWeight: 700, color: distressThermometer >= 7 ? T.danger : T.primary }}>{distressThermometer}</span>
                <span>10 — Estremo</span>
              </div>
              {distressThermometer >= 7 && (
                <div style={{ marginTop: 8, backgroundColor: T.dangerLight, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: T.danger, fontWeight: 600 }}>
                  ⚠️ Distress severo — forte predittore CPSP (OR 2.05)
                </div>
              )}
            </div>

            {/* Fattori modificabili */}
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 10 }}>Fattori modificabili</div>
              {([
                { label: 'Fumatore attivo', value: smoking, setter: setSmoking },
                { label: 'Consumo alcolici a rischio', value: alcoholRisk, setter: setAlcoholRisk },
                { label: 'Fragilità clinica', value: frailty, setter: setFrailty },
              ] as { label: string; value: boolean; setter: (v: boolean) => void }[]).map(({ label, value, setter }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>{label}</label>
                  <button onClick={() => setter(!value)}
                    style={{ padding: '5px 16px', borderRadius: 20, border: `2px solid ${value ? T.primary : T.border}`,
                      backgroundColor: value ? T.primaryLight : '#fff', color: value ? T.primary : T.textMuted,
                      fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                    {value ? 'Sì' : 'No'}
                  </button>
                </div>
              ))}
              {hasBioData ? (
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ ...lbl, marginBottom: 0 }}>BMI (kg/m²)</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: computedBmi! > 30 ? T.warning : T.text }}>{computedBmi}</span>
                  <span style={{ fontSize: 11, backgroundColor: T.primaryLight, color: T.primary, borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>📋 Da anagrafica</span>
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <label style={{ ...lbl, marginBottom: 4 }}>BMI (kg/m²) <span style={{ fontWeight: 400, color: T.textMuted, fontSize: 11 }}>— inserisci manualmente</span></label>
                  <input type="number" value={bmiValue} onChange={e => setBmiValue(e.target.value)} placeholder="Es. 27.5" min={10} max={70} step={0.1}
                    style={{ ...inp, width: 140 }} />
                </div>
              )}
            </div>
          </div>
        )}
        {formTab === 'intraop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>🔧 Dati Intraoperatori</div>
            {autoPopulatedFromIntervention && !editingAssessmentId && (
              <div style={{ backgroundColor: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>ℹ️</span>
                <span>Dati pre-compilati dall'ultimo intervento registrato — modificabili</span>
              </div>
            )}
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Durata intervento (minuti)</label>
              <input type="number" value={surgeryDurationMinutes} onChange={e => setSurgeryDurationMinutes(e.target.value)}
                placeholder="Es. 90" min={0} style={{ ...inp, width: 160 }} />
            </div>
            <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: regionalAnesthesia ? 12 : 0 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Anestesia regionale eseguita?</label>
                <button onClick={() => { setRegionalAnesthesia(!regionalAnesthesia); if (regionalAnesthesia) setRegionalAnesthesiaType(''); }}
                  style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${regionalAnesthesia ? T.success : T.border}`,
                    backgroundColor: regionalAnesthesia ? T.successLight : '#fff', color: regionalAnesthesia ? T.success : T.textMuted,
                    fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {regionalAnesthesia ? 'Sì' : 'No'}
                </button>
              </div>
              {regionalAnesthesia && (
                <div>
                  <label style={{ ...lbl, marginBottom: 6 }}>Tipo di blocco</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                    {['PENG block', 'ACB', 'Fascia Iliaca', 'LIA', 'ESPB', 'Paravertebrale', 'Interscaleno', 'TAP block', 'Altro'].map(t => (
                      <button key={t} onClick={() => setRegionalAnesthesiaType(regionalAnesthesiaType === t ? '' : t)}
                        style={{ ...chip(regionalAnesthesiaType === t, T.success), fontSize: 12 }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {formTab === 'pcs' && (
          <div>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              0 = Per niente &nbsp;·&nbsp; 1 = In piccola misura &nbsp;·&nbsp; 2 = Moderatamente &nbsp;·&nbsp; 3 = In grande misura &nbsp;·&nbsp; 4 = Sempre
            </p>
            <ScoreRow items={PCS_ITEMS} scores={pcsScores} setScores={setPcsScores} maxScore={4} />
            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: T.primary }}>Totale PCS: {pcsTotal}/52</div>
          </div>
        )}
        {formTab === 'pass' && (
          <div>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              0 = Mai &nbsp;·&nbsp; 1 = Raramente &nbsp;·&nbsp; 2 = A volte &nbsp;·&nbsp; 3 = Spesso &nbsp;·&nbsp; 4 = Molto spesso &nbsp;·&nbsp; 5 = Sempre
            </p>
            <ScoreRow items={PASS_ITEMS} scores={passScores} setScores={setPassScores} maxScore={5} />
            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: T.primary }}>Totale PASS: {passTotal}/100</div>
          </div>
        )}
        {formTab === 'csi' && (
          <div>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              0 = Mai &nbsp;·&nbsp; 1 = Raramente &nbsp;·&nbsp; 2 = A volte &nbsp;·&nbsp; 3 = Spesso &nbsp;·&nbsp; 4 = Sempre
            </p>
            <ScoreRow items={CSI_ITEMS} scores={csiScores} setScores={setCsiScores} maxScore={4} />
            <div style={{ marginTop: 12, textAlign: 'right', fontWeight: 700, color: T.primary }}>Totale CSI: {csiTotal}/100</div>
          </div>
        )}
        <button onClick={saveAssessment} disabled={saving}
          style={{ ...btn('primary', 'md'), width: '100%', justifyContent: 'center', marginTop: 20 }}>
          {saving ? 'Salvataggio...' : editingAssessmentId ? '💾 Aggiorna Valutazione' : '💾 Salva Valutazione'}
        </button>
      </div>
    );
  }

  if (view === 'followup_form') {
    // ColSection → CollapsibleSection (extracted to src/components/cpsp/CollapsibleSection.tsx)
    const ColSection = CollapsibleSection;
    const earlyScore = earlyNeuropathic.filter(Boolean).length;
    const preOpNrsRef = assessments[0]?.preop_nrs ?? null;
    const trajectoryDelta = preOpNrsRef != null ? nrsCurrent - preOpNrsRef : null;
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{editingFollowupId ? '✏️ Modifica Follow-up CPSP' : '➕ Nuovo Follow-up CPSP'}</h3>
          <button onClick={() => { resetFollowupForm(); setView('list'); }} style={btn('ghost', 'sm')}>✕ Annulla</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* ── SEZIONE BASE ── */}
          <div>
            <label style={{ ...lbl, marginBottom: 6 }}>Timepoint</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {([{ v: 0.5, l: '2 sett.' }, { v: 1, l: '1 mese' }, { v: 3, l: '3 mesi' }, { v: 6, l: '6 mesi' }, { v: 12, l: '12 mesi' }]).map(({ v, l }) => (
                <button key={v} onClick={() => setFuMonths(v)} style={{ ...chip(fuMonths === v), flex: 1, minWidth: 60, justifyContent: 'center' }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Data visita</label>
              <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>FAS</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {([['A', T.success], ['B', T.warning], ['C', T.danger]] as [string, string][]).map(([v, c]) => (
                  <button key={v} onClick={() => setFasScore(fasScore === v ? '' : v)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${fasScore === v ? c : T.border}`,
                      backgroundColor: fasScore === v ? `${c}22` : '#fff', color: fasScore === v ? c : T.textMuted,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Dolore presente?</label>
            <button onClick={() => setPainPresent(!painPresent)}
              style={{ padding: '6px 22px', borderRadius: 20, border: `2px solid ${painPresent ? T.danger : T.border}`,
                backgroundColor: painPresent ? T.dangerLight : '#fff', color: painPresent ? T.danger : T.textMuted,
                fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {painPresent ? 'Sì' : 'No'}
            </button>
          </div>
          {painPresent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <NRSRow label="NRS attuale" value={nrsCurrent} onChange={setNrsCurrent} />
              <NRSRow label="NRS riposo" value={nrsRest} onChange={setNrsRest} />
              <NRSRow label="NRS movimento" value={nrsMovement} onChange={setNrsMovement} />
            </div>
          )}

          {/* ── FENOTIPO NEUROPATICO PRECOCE (2 sett. / 1 mese) ── */}
          {(fuMonths === 0.5 || fuMonths === 1) && (
            <ColSection title="🧬 Fenotipo Neuropatico Precoce" open={openNeuro} onToggle={() => setOpenNeuro(o => !o)} color="#B45309">
              {trajectoryDelta !== null && (
                <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '7px 12px', border: '1px solid #FDE68A', fontSize: 12, fontWeight: 600,
                  color: trajectoryDelta > 0 ? T.danger : trajectoryDelta < 0 ? T.success : T.textMuted }}>
                  {trajectoryDelta > 0 ? `▲ +${trajectoryDelta} NRS rispetto al preop` : trajectoryDelta < 0 ? `▼ ${trajectoryDelta} NRS rispetto al preop` : '= Invariato rispetto al preop'}
                </div>
              )}
              {([['Bruciore / calore', 0], ['Scosse elettriche', 1], ['Allodinia al tocco', 2], ['Freddo doloroso', 3]] as [string,number][]).map(([label, idx]) => (
                <div key={idx} onClick={() => { const s = [...earlyNeuropathic]; s[idx] = !s[idx]; setEarlyNeuropathic(s); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    backgroundColor: earlyNeuropathic[idx] ? '#FEF3C7' : '#fff', border: `1.5px solid ${earlyNeuropathic[idx] ? '#FCD34D' : T.border}` }}>
                  <span style={{ fontSize: 15 }}>{earlyNeuropathic[idx] ? '☑' : '☐'}</span>
                  <span style={{ flex: 1, fontSize: 13, color: T.text }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: earlyNeuropathic[idx] ? '#B45309' : T.textMuted }}>{earlyNeuropathic[idx] ? 'Presente' : 'Assente'}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: T.text }}>Score:</span>
                <span style={{ fontWeight: 800, fontSize: 20, color: earlyScore >= 2 ? T.danger : earlyScore >= 1 ? T.warning : T.success }}>{earlyScore}/4</span>
                {earlyScore >= 2 && <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>⚠️ Alto rischio CPSP</span>}
              </div>
            </ColSection>
          )}

          {/* ── ALGORITMO DIAGNOSTICO CPSP (≥ 3 mesi) ── */}
          {fuMonths >= 3 && (
            <ColSection title="🔍 Algoritmo Diagnostico CPSP (ICD-11)" open={openCpspAlgo} onToggle={() => setOpenCpspAlgo(o => !o)} color="#7C3AED">
              {/* Step 1 */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6D28D9' }}>STEP 1 — Screening</div>
              {([['Dolore nella sede chirurgica?', cpspDiagPainPresent, setCpspDiagPainPresent],
                 ['Durata ≥ 3 mesi?', cpspDiagDuration3m, setCpspDiagDuration3m],
                 ['Sede correlata all\'intervento?', cpspDiagSiteCorrelated, setCpspDiagSiteCorrelated]] as [string,boolean,(v:boolean)=>void][]).map(([label,value,setter]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 12, color: T.text }}>{label}</span>
                  <button onClick={() => setter(!value)} style={{ padding: '4px 14px', borderRadius: 16, border: `2px solid ${value ? '#7C3AED' : T.border}`,
                    backgroundColor: value ? '#EDE9FE' : '#fff', color: value ? '#7C3AED' : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                    {value ? 'Sì' : 'No'}
                  </button>
                </div>
              ))}
              {cpspStep1Positive && <div style={{ fontSize: 12, fontWeight: 600, color: '#854D0E', backgroundColor: '#FEF9C3', borderRadius: 7, padding: '6px 10px' }}>✅ Screening positivo → prosegui</div>}
              {/* Step 2 */}
              {cpspStep1Positive && <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>STEP 2 — Esclusione cause alternative</div>
                {([['Oncologico → imaging/markers?', oncologicRecurrenceExcluded, setOncologicRecurrenceExcluded],
                   ['Infezione esclusa?', infectionExcluded, setInfectionExcluded],
                   ['Complicanza hardware esclusa?', hardwareExcluded, setHardwareExcluded],
                   ['CRPS valutato (Budapest)?', crpsSuspected, setCrpsSuspected]] as [string,boolean,(v:boolean)=>void][]).map(([label,value,setter]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, color: T.text }}>{label}</span>
                    <button onClick={() => setter(!value)} style={{ padding: '4px 14px', borderRadius: 16, border: `2px solid ${value ? T.success : T.border}`,
                      backgroundColor: value ? T.successLight : '#fff', color: value ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                      {value ? '✓' : 'No'}
                    </button>
                  </div>
                ))}
                {cpspAltAllExcluded && <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', backgroundColor: '#DCFCE7', borderRadius: 7, padding: '6px 10px' }}>🟢 CPSP CONFERMATA (ICD-11 MG30)</div>}
              </>}
              {/* Step 3 */}
              {cpspConfirmedByAlgo && <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#C2410C', marginTop: 4 }}>STEP 3 — Quantificazione</div>
                {(nrsCurrent >= 6 || bpiAvg >= 7) && <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 7, padding: '6px 10px' }}>⚠️ NRS≥6 o BPI≥7 → Referral indicato</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 12, color: T.text }}>Referral APS/Pain Clinic</span>
                  <button onClick={() => setReferralAps(!referralAps)} style={{ padding: '4px 14px', borderRadius: 16, border: `2px solid ${referralAps ? '#7C3AED' : T.border}`,
                    backgroundColor: referralAps ? '#EDE9FE' : '#fff', color: referralAps ? '#7C3AED' : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                    {referralAps ? 'Sì' : 'No'}
                  </button>
                </div>
              </>}
              {/* Step 4 */}
              {cpspConfirmedByAlgo && <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0369A1', marginTop: 4 }}>STEP 4 — Fenotipizzazione</div>
                {([['DN4≥4 / neuropatico?', 'neuropatico', '#7C3AED'], ['CSI≥40 / sensitizzazione?', 'sensitizzazione', '#D97706']] as [string,string,string][]).map(([label,val,c]) => (
                  <div key={val} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, color: T.text }}>{label}</span>
                    <button onClick={() => setCpspPhenotype(cpspPhenotype === val ? '' : val)} style={{ padding: '4px 14px', borderRadius: 16, border: `2px solid ${cpspPhenotype === val ? c : T.border}`,
                      backgroundColor: cpspPhenotype === val ? `${c}22` : '#fff', color: cpspPhenotype === val ? c : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                      {cpspPhenotype === val ? 'Sì' : 'No'}
                    </button>
                  </div>
                ))}
              </>}
              {/* NeuPSIG */}
              {cpspConfirmedByAlgo && cpspPhenotype === 'neuropatico' && (
                <div style={{ backgroundColor: '#F5F3FF', borderRadius: 10, padding: 12, border: '1.5px solid #C4B5FD' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#6D28D9', marginBottom: 8 }}>💊 Schema NeuPSIG 2025</div>
                  {[
                    { step: '1', drug: 'TCA (amitriptilina)', note: '10→75mg/notte | NNT 4.6' },
                    { step: '1', drug: 'Gabapentin', note: '300→3600mg/die | NNT 8.9' },
                    { step: '1', drug: 'Pregabalin', note: '25→600mg/die | NNT 8.9' },
                    { step: '1', drug: 'Duloxetina', note: '30→120mg/die | NNT 7.4' },
                    { step: '2', drug: 'Capsaicina 8%', note: 'patch | NNT 13.2' },
                    { step: '2', drug: 'Lidocaina 5%', note: 'cerotti | NNT 14.5' },
                    { step: '3', drug: 'BTX-A', note: 'tossina botulinica | NNT 2.7' },
                    { step: '3', drug: 'Oppioidi selezionati', note: 'tempo-limitati | NNT 5.9' },
                  ].map(({ step, drug, note }) => (
                    <div key={drug} onClick={() => { setNeupSigDrug(neupSigDrug === drug ? '' : drug); setNeupSigStep(step); }}
                      style={{ padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${neupSigDrug === drug ? '#7C3AED' : '#E5E7EB'}`,
                        backgroundColor: neupSigDrug === drug ? '#EDE9FE' : '#fff', cursor: 'pointer', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#7C3AED', fontWeight: 700, marginRight: 6 }}>L{step}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{drug}</span>
                      <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 6 }}>{note}</span>
                    </div>
                  ))}
                  {neupSigDrug && <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginTop: 6 }}>✅ Linea {neupSigStep}: {neupSigDrug}</div>}
                </div>
              )}
            </ColSection>
          )}

          {/* ── QUALITÀ DI VITA (≥ 3 mesi) ── */}
          {fuMonths >= 3 && (
            <ColSection title="📊 Qualità di Vita — BPI / EQ-5D" open={openQoL} onToggle={() => setOpenQoL(o => !o)} color={T.accent}>
              {/* BPI — 3 item principali */}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                BPI <span style={{ fontWeight: 400, color: T.textMuted }}>(0=nessuna limitazione, 10=completa)</span>
                <span style={{ float: 'right', fontWeight: 700, color: T.primary }}>Media: {bpiAvg.toFixed(1)}</span>
              </div>
              {BPI_ITEMS.slice(0, bpiExpanded ? 7 : 3).map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
                    <span>{item}</span><span style={{ fontWeight: 700, color: T.primary }}>{bpiScores[i]}</span>
                  </div>
                  <input type="range" min={0} max={10} value={bpiScores[i]}
                    onChange={e => { const s = [...bpiScores]; s[i] = Number(e.target.value); setBpiScores(s); }}
                    style={{ width: '100%', accentColor: T.primary }} />
                </div>
              ))}
              <button onClick={() => setBpiExpanded(e => !e)} style={{ fontSize: 11, color: T.primary, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                {bpiExpanded ? '▲ Mostra meno' : `▼ Mostra tutti i 7 item (nascosti: ${BPI_ITEMS.slice(3).join(', ').substring(0,40)}…)`}
              </button>
              {/* EQ-5D griglia compatta */}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 4 }}>EQ-5D <span style={{ fontWeight: 400, color: T.textMuted }}>(1–5)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EQ5D_DIMS.map((dim, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 3 }}>{dim}</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => { const s = [...eq5dScores]; s[i] = n; setEq5dScores(s); }}
                          style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1.5px solid ${eq5dScores[i] === n ? T.primary : T.border}`,
                            backgroundColor: eq5dScores[i] === n ? T.primaryLight : '#fff', color: eq5dScores[i] === n ? T.primary : T.textMuted,
                            fontWeight: eq5dScores[i] === n ? 700 : 400, fontSize: 12, cursor: 'pointer' }}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
                  <span>EQ-VAS (salute oggi)</span><span style={{ fontWeight: 700, color: T.primary }}>{eq5dVas}</span>
                </div>
                <input type="range" min={0} max={100} value={eq5dVas} onChange={e => setEq5dVas(Number(e.target.value))} style={{ width: '100%', accentColor: T.primary }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textLight }}><span>0 Pessima</span><span>100 Ottima</span></div>
              </div>
            </ColSection>
          )}

          {/* ── VALUTAZIONE PSICOLOGICA (≥ 3 mesi) ── */}
          {fuMonths >= 3 && (
            <ColSection title="🧠 Valutazione Psicologica" open={openPsych} onToggle={() => setOpenPsych(o => !o)} color="#DC2626">
              {/* ── PHQ-9 ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#DC2626', marginBottom: 2 }}>PHQ-9 — Patient Health Questionnaire</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Nelle ultime 2 settimane, con quale frequenza è stato disturbato/a da:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PHQ9_ITEMS.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 12, color: T.text, paddingTop: 6, lineHeight: 1.4 }}>
                        <span style={{ color: T.textLight, marginRight: 4, fontSize: 10 }}>{i + 1}.</span>{item}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {(['Mai', 'Alcuni\ngiorni', 'Più della\nmetà', 'Quasi\nogni g.'] as string[]).map((lbl2, j) => (
                          <button key={j}
                            onClick={() => { const a = [...phq9Answers]; a[i] = j; setPhq9Answers(a); }}
                            style={{ width: 52, padding: '4px 2px', borderRadius: 7,
                              border: `1.5px solid ${phq9Answers[i] === j ? '#DC2626' : T.border}`,
                              backgroundColor: phq9Answers[i] === j ? '#DC262618' : '#fff',
                              color: phq9Answers[i] === j ? '#DC2626' : T.textMuted,
                              fontWeight: phq9Answers[i] === j ? 700 : 400,
                              cursor: 'pointer', lineHeight: 1.3, textAlign: 'center' as const }}>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>{j}</div>
                            <div style={{ fontSize: 9, lineHeight: 1.2, whiteSpace: 'pre-line' as const }}>{lbl2}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {phq9Answers[8] > 0 && (
                  <div style={{ marginTop: 8, backgroundColor: '#7B000018', borderRadius: 8, padding: '8px 10px',
                    fontSize: 12, fontWeight: 700, color: '#7B0000', border: '1.5px solid #7B000044' }}>
                    ⚠️ Item 9 positivo — valutare rischio suicidario e attivare protocollo di sicurezza
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: phq9Score >= 10 ? T.danger : T.text }}>Totale: {phq9Score}/27</span>
                  {phq9Score <= 4 && <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: T.successLight, color: T.success, fontWeight: 700, fontSize: 11 }}>🟢 Nessuno/Minimo</span>}
                  {phq9Score >= 5 && phq9Score <= 9 && <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: '#FEF9C3', color: '#A16207', fontWeight: 700, fontSize: 11 }}>🟡 Lieve</span>}
                  {phq9Score >= 10 && phq9Score <= 14 && <>
                    <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: '#FFEDD5', color: '#C2410C', fontWeight: 700, fontSize: 11 }}>🟠 Moderato</span>
                    <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>Referral psicologico consigliato</span>
                  </>}
                  {phq9Score >= 15 && phq9Score <= 19 && <>
                    <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: T.dangerLight, color: T.danger, fontWeight: 700, fontSize: 11 }}>🔴 Moderatamente severo</span>
                    <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>Referral urgente</span>
                  </>}
                  {phq9Score >= 20 && <>
                    <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: T.dangerLight, color: T.danger, fontWeight: 700, fontSize: 11 }}>🔴 Severo</span>
                    <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>Referral urgente</span>
                  </>}
                </div>
              </div>

              <div style={{ height: 1, backgroundColor: T.border, margin: '4px 0' }} />

              {/* ── GAD-7 ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#DC2626', marginBottom: 2 }}>GAD-7 — Generalized Anxiety Disorder</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>Nelle ultime 2 settimane, con quale frequenza è stato disturbato/a da:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {GAD7_ITEMS.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 12, color: T.text, paddingTop: 6, lineHeight: 1.4 }}>
                        <span style={{ color: T.textLight, marginRight: 4, fontSize: 10 }}>{i + 1}.</span>{item}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {(['Mai', 'Alcuni\ngiorni', 'Più della\nmetà', 'Quasi\nogni g.'] as string[]).map((lbl2, j) => (
                          <button key={j}
                            onClick={() => { const a = [...gad7Answers]; a[i] = j; setGad7Answers(a); }}
                            style={{ width: 52, padding: '4px 2px', borderRadius: 7,
                              border: `1.5px solid ${gad7Answers[i] === j ? '#DC2626' : T.border}`,
                              backgroundColor: gad7Answers[i] === j ? '#DC262618' : '#fff',
                              color: gad7Answers[i] === j ? '#DC2626' : T.textMuted,
                              fontWeight: gad7Answers[i] === j ? 700 : 400,
                              cursor: 'pointer', lineHeight: 1.3, textAlign: 'center' as const }}>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>{j}</div>
                            <div style={{ fontSize: 9, lineHeight: 1.2, whiteSpace: 'pre-line' as const }}>{lbl2}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: gad7Score >= 10 ? T.danger : T.text }}>Totale: {gad7Score}/21</span>
                  {gad7Score <= 4 && <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: T.successLight, color: T.success, fontWeight: 700, fontSize: 11 }}>🟢 Minima</span>}
                  {gad7Score >= 5 && gad7Score <= 9 && <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: '#FEF9C3', color: '#A16207', fontWeight: 700, fontSize: 11 }}>🟡 Lieve</span>}
                  {gad7Score >= 10 && gad7Score <= 14 && <>
                    <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: '#FFEDD5', color: '#C2410C', fontWeight: 700, fontSize: 11 }}>🟠 Moderata</span>
                    <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>Referral consigliato</span>
                  </>}
                  {gad7Score >= 15 && <>
                    <span style={{ padding: '3px 10px', borderRadius: 12, backgroundColor: T.dangerLight, color: T.danger, fontWeight: 700, fontSize: 11 }}>🔴 Severa</span>
                    <span style={{ fontSize: 11, color: T.danger, fontWeight: 600 }}>Referral urgente</span>
                  </>}
                </div>
              </div>
            </ColSection>
          )}

          {/* ── TERAPIA (tutti i timepoint) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', backgroundColor: T.bg, borderRadius: 12, border: `1.5px solid ${T.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>💊 Terapia</div>
            <div>
              <label style={{ ...lbl, marginBottom: 4 }}>Terapia analgesica in corso</label>
              <input value={analTherapy} onChange={e => setAnalTherapy(e.target.value)} placeholder="Es. paracetamolo 1g x3/die..." style={inp} />
            </div>
            <div>
              <label style={{ ...lbl, marginBottom: 6 }}>Uso oppioidi</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['nessuno', 'Nessuno'], ['intermittente', 'Intermittente'], ['cronico', 'Cronico']].map(([v, l]) => (
                  <button key={v} onClick={() => setOpioidCurrent(v)} style={{ ...chip(opioidCurrent === v), flex: 1, justifyContent: 'center' }}>{l}</button>
                ))}
              </div>
            </div>
            {opioidCurrent !== 'nessuno' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...lbl, marginBottom: 4, fontSize: 11 }}>OME mg/die</label>
                  <input type="number" value={fuOpioidOme} onChange={e => setFuOpioidOme(e.target.value)} placeholder="Es. 30" min={0} style={inp} />
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom: 4, fontSize: 11 }}>Giorni usati (ultimi 14)</label>
                  <input type="number" value={fuOpioidDays} onChange={e => setFuOpioidDays(e.target.value)} placeholder="0–14" min={0} max={14} style={inp} />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>CPSP confermata</label>
                <button onClick={() => setCpspConfirmed(!cpspConfirmed)}
                  style={{ padding: '5px 14px', borderRadius: 16, border: `2px solid ${cpspConfirmed ? T.danger : T.border}`,
                    backgroundColor: cpspConfirmed ? T.dangerLight : '#fff', color: cpspConfirmed ? T.danger : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  {cpspConfirmed ? 'Sì' : 'No'}
                </button>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>Invio centro dolore</label>
                <button onClick={() => setReferral(!referral)}
                  style={{ padding: '5px 14px', borderRadius: 16, border: `2px solid ${referral ? T.primary : T.border}`,
                    backgroundColor: referral ? T.primaryLight : '#fff', color: referral ? T.primary : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                  {referral ? 'Sì' : 'No'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label style={{ ...lbl, marginBottom: 4 }}>Note</label>
            <textarea value={fuNotes} onChange={e => setFuNotes(e.target.value)} placeholder="Note..." rows={2}
              style={{ ...inp, resize: 'vertical' as const }} />
          </div>
        </div>
        <button onClick={saveFollowup} disabled={saving}
          style={{ ...btn('primary', 'md'), width: '100%', justifyContent: 'center', marginTop: 16 }}>
          {saving ? 'Salvataggio...' : editingFollowupId ? '💾 Aggiorna Follow-up' : '💾 Salva Follow-up'}
        </button>
      </div>
    );
  }

  // List view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {riskRetryPayload && (
        <div style={{ backgroundColor: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#92400E', flex: 1 }}>⚠️ Punteggio rischio non calcolato per un errore temporaneo.</span>
          <button
            onClick={async () => {
              const { assessmentId, ...apiPayload } = riskRetryPayload;
              const { data, error } = await supabase.functions.invoke('compute-cpsp-risk', { body: apiPayload });
              if (!error && data?.pct != null) {
                await cpspSvc.saveAssessment(supabase, { cpsp_risk_pct: data.pct, cpsp_risk_level: data.level, engine_version: '2026.06.0' }, assessmentId);
                setRiskRetryPayload(null);
                await loadData();
              }
            }}
            style={{ ...btn('ghost', 'sm'), borderColor: '#92400E', color: '#92400E', whiteSpace: 'nowrap' as const }}>
            🔄 Riprova calcolo
          </button>
        </div>
      )}
      {/* Preoperative Assessment */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>🔍 Valutazione Preoperatoria</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {currentAssessmentId
              ? <button onClick={generateQr} disabled={qrLoading} style={{ ...btn('ghost', 'sm'), borderColor: '#7C3AED', color: '#7C3AED' }}>
                  {qrLoading ? '⏳' : '📱 QR Paziente'}
                </button>
              : <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>💾 Salva prima la valutazione per generare il QR</span>
            }
            <button onClick={openNewAssessmentForm} style={btn('primary', 'sm')}>+ Nuova</button>
          </div>
        </div>
        {qrUrl && (
          <div style={{ backgroundColor: '#F5F3FF', border: '1.5px solid #C4B5FD', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#6D28D9' }}>📱 QR Code Questionario Paziente</span>
              <button onClick={() => setQrUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
              <div id="qr-print-area" style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, border: '1px solid #E9D5FF', flexShrink: 0 }}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="QR Code" width={180} height={180} style={{ display: 'block' }} />
                <div style={{ textAlign: 'center', fontSize: 10, color: '#6B7280', marginTop: 6 }}>Scansiona per compilare il questionario</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.8 }}>Link diretto</div>
                <div style={{ backgroundColor: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#374151', wordBreak: 'break-all' as const, marginBottom: 8, lineHeight: 1.5 }}>
                  {qrUrl}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { navigator.clipboard.writeText(qrUrl); setQrCopied(true); setTimeout(() => setQrCopied(false), 2000); }}
                    style={{ ...btn('ghost', 'sm'), borderColor: '#7C3AED', color: '#7C3AED', flex: 1, justifyContent: 'center' }}>
                    {qrCopied ? '✓ Copiato!' : '📋 Copia link'}
                  </button>
                  <button onClick={() => {
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:40px"><h2 style="color:#6D28D9">🩺 APS Manager — Questionario</h2><p style="color:#6B7280;font-size:14px">Scansiona il QR con il tuo smartphone</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}" width="300" height="300"><p style="font-size:12px;color:#9CA3AF;margin-top:16px;word-break:break-all">${qrUrl}</p></body></html>`);
                    w.document.close(); w.print();
                  }} style={{ ...btn('ghost', 'sm'), borderColor: '#7C3AED', color: '#7C3AED' }}>🖨️</button>
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>⏱ Link valido 7 giorni · Scale: PCS, PASS, CSI</div>
                <button onClick={checkQrStatus} disabled={qrCheckLoading || qrCompleted}
                  style={{ ...btn('ghost', 'sm'), marginTop: 8, borderColor: qrCompleted ? '#16A34A' : '#7C3AED', color: qrCompleted ? '#16A34A' : '#7C3AED', width: '100%', justifyContent: 'center' }}>
                  {qrCheckLoading ? '⏳ Controllo...' : qrCompleted ? '✅ Completato!' : '🔄 Controlla stato'}
                </button>
              </div>
            </div>
            {qrNotification && (
              <div style={{ marginTop: 12, backgroundColor: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
                {qrNotification}
              </div>
            )}
          </div>
        )}
        {assessments.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.textMuted, padding: 24 }}>Nessuna valutazione preoperatoria</div>
        ) : assessments.map(a => {
          const rc = RISK_COLORS[a.cpsp_risk_level] || T.primary;
          const riskPct = a.cpsp_risk_pct ?? null;
          const recs = getRecs(a.cpsp_risk_level, a.pcs_score ?? 0, a.pass_score ?? 0, a.csi_score ?? 0, a.opioid_use_preop ?? 'nessuno', a.preop_nrs ?? 0, a.distress_thermometer ?? 0, a.insomnia_present ?? false, a.pain_other_sites ?? false);
          return (
            <div key={a.id} style={{ borderLeft: `4px solid ${rc}`, paddingLeft: 14, marginBottom: 16, paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: rc, lineHeight: 1 }}>{riskPct}%</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: rc, fontSize: 17 }}>Rischio {RISK_LABELS[a.cpsp_risk_level]}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{SURGERY_TYPES.find(s => s.value === a.surgery_type)?.label || a.surgery_type}</div>
                  <div style={{ fontSize: 11, color: T.textLight }}>{format(parseISO(a.created_at), 'dd/MM/yyyy HH:mm')}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => editAssessment(a)} style={{ ...btn('ghost', 'sm'), padding: '4px 10px' }}>✏️</button>
                  <button onClick={() => deleteAssessment(a.id)} style={{ ...btn('ghost', 'sm'), padding: '4px 10px', color: T.danger }}>🗑</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                {completedQrAssessments.has(a.id) && (
                  <div style={{ width: '100%', marginBottom: 4 }}>
                    <span style={{ backgroundColor: '#DCFCE7', color: '#16A34A', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                      📱 Compilato dal paziente
                    </span>
                  </div>
                )}
                {[{ l: 'PCS', v: a.pcs_score, max: 52 }, { l: 'PASS', v: a.pass_score, max: 100 }, { l: 'CSI', v: a.csi_score, max: 100 }, { l: 'NRS preop', v: a.preop_nrs, max: 10 }].map(({ l, v, max }) => (
                  <div key={l} style={{ backgroundColor: T.bg, borderRadius: 8, padding: '6px 12px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{l}</div>
                    <div style={{ fontWeight: 700, color: T.text }}>{v}<span style={{ fontSize: 10, color: T.textLight }}>/{max}</span></div>
                  </div>
                ))}
                <div style={{ backgroundColor: T.bg, borderRadius: 8, padding: '6px 12px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>Oppioidi</div>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 12 }}>{a.opioid_use_preop}</div>
                </div>
              </div>
              <div style={{ backgroundColor: rc + '12', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: rc, marginBottom: 8 }}>📋 Raccomandazioni evidence-based</div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  {recs.map((r, i) => (
                    <div key={i} style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${rc}22` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 14 }}>{r.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, backgroundColor: T.bg, borderRadius: 5, padding: '1px 6px' }}>{r.cat}</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '1px 6px', backgroundColor: EV_STYLE[r.ev].bg, color: EV_STYLE[r.ev].color }}>
                          {r.ev === 'expert' ? 'Expert' : `Livello ${r.ev}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.45 }}>{r.text}</div>
                      {r.src && <div style={{ fontSize: 10, color: T.textLight, marginTop: 3, fontStyle: 'italic' }}>{r.src}</div>}
                    </div>
                  ))}
                </div>
                {(() => {
                  const bundle = PROSPECT_BUNDLES[a.surgery_type];
                  if (!bundle) return null;
                  return (
                    <div style={{ marginTop: 10, backgroundColor: '#F0FDF4', borderRadius: 10, padding: '10px 14px', border: '1px solid #BBF7D0' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#15803D', marginBottom: 6 }}>🔧 Bundle PROSPECT Procedure-Specific</div>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                        {bundle.items.map((item, i) => (
                          <div key={i} style={{ fontSize: 12, color: '#166534', display: 'flex', gap: 6 }}>
                            <span style={{ flexShrink: 0 }}>•</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: '#16A34A', marginTop: 6, fontStyle: 'italic' }}>{bundle.source}</div>
                    </div>
                  );
                })()}
                <div style={{ marginTop: 10, padding: '8px 10px', backgroundColor: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA' }}>
                  <div style={{ fontSize: 10, color: '#92400E', lineHeight: 1.4 }}>
                    ⚠️ Strumento di supporto decisionale. Framework basato su: CPSP Assessment Pack Preop/Postop 2026; P4-Prevoque PERISCOPE Trial 2025 (AUC=0.81); Cohort prospettica multicentrica n=960 (AUC=0.748); BJA/AoA Consensus 2024; IASP 2021; APS Guidelines 2016; PROSPECT 2023; Cochrane 2022-23. Scale validate: PCS-I (Sullivan 1995/Monticone et al., cutoff ≥30/52); PASS-20 (McCracken 2002, cutoff ≥30/80); CSI (Mayer 2012/Neblett 2013, cutoff ≥40/100); Distress Thermometer (cutoff ≥7). Nota: duloxetina non raccomandata routinariamente in chirurgia ortopedica (Int J Mol Sci 2024). Tutti i farmaci sono off-label per uso perioperatorio preventivo. Non sostituisce la valutazione clinica individuale. — Nota metodologica: i coefficienti attuali sono clinicamente derivati (placeholder). Il modello sarà sostituito da coefficienti stimati via regressione logistica penalizzata (LASSO/elastic-net) con bootstrap dopo raccolta prospettica di ≥200 pazienti (Studio APS-CPSP, Fase 1). Tutte le variabili sono raccolte come valori continui per la derivazione statistica futura.
                  </div>
                </div>
              </div>
              {a.notes && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>📝 {a.notes}</div>}
            </div>
          );
        })}
      </div>

      {/* POD1 Dynamic Risk Update */}
      {currentAssessmentId && (() => {
        const currentAss = assessments.find(a => a.id === currentAssessmentId);
        if (!currentAss) return null;
        const preOpPct = currentAss.cpsp_risk_pct ?? 0;
        const preOpLevel = currentAss.cpsp_risk_level ?? 'basso';
        const alreadySaved = !!currentAss.pod1_assessed_at;
        const savedPct = currentAss.risk_pct_dynamic;
        const savedLevel = currentAss.risk_level_dynamic;
        const savedDelta = currentAss.risk_delta;
        const liveOme = parseFloat(pod1Ome) || 0;
        const live = calcDynamicRisk(preOpPct, pod1NrsRest, pod1NrsMovement, liveOme);
        const levelChanged = alreadySaved ? savedLevel !== preOpLevel : live.dynamicLevel !== preOpLevel;
        const displayPct = alreadySaved ? savedPct : live.dynamicPct;
        const displayLevel = alreadySaved ? savedLevel : live.dynamicLevel;
        const displayDelta = alreadySaved ? savedDelta : live.delta;
        const rc = RISK_COLORS[displayLevel] || T.primary;
        return (
          <div style={{ ...card, border: `2px solid #0EA5E9`, borderRadius: 14 }}>
            <button onClick={() => setPod1Open(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' as const, padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0369A1', flex: 1 }}>📊 Aggiornamento Rischio T1 — POD1</span>
                <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>🔬 Modello Dinamico</span>
                {alreadySaved && <span style={{ backgroundColor: '#DCFCE7', color: '#16A34A', borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✓ Compilato</span>}
                <span style={{ color: T.textMuted, fontSize: 16 }}>{pod1Open ? '▲' : '▼'}</span>
              </div>
            </button>
            {pod1Open && (
              <div style={{ marginTop: 14 }}>
                {/* Risk comparison */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' as const }}>
                  <div style={{ flex: 1, minWidth: 120, backgroundColor: '#F3F4F6', borderRadius: 10, padding: '10px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Rischio preoperatorio</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#6B7280' }}>{preOpPct}%</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{RISK_LABELS[preOpLevel]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120, backgroundColor: RISK_COLORS[displayLevel] + '18', borderRadius: 10, padding: '10px 14px', textAlign: 'center' as const, border: `2px solid ${RISK_COLORS[displayLevel]}33` }}>
                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Rischio aggiornato POD1</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: rc }}>{displayPct}%</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: rc }}>{RISK_LABELS[displayLevel]}</div>
                  </div>
                </div>
                {/* Delta */}
                {displayDelta !== undefined && (
                  <div style={{ marginBottom: 12, textAlign: 'center' as const }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: displayDelta > 0 ? T.danger : displayDelta < 0 ? T.success : T.textMuted }}>
                      {displayDelta > 0 ? `▲ +${displayDelta}%` : displayDelta < 0 ? `▼ ${displayDelta}%` : '= 0%'} rispetto alla valutazione preoperatoria
                    </span>
                  </div>
                )}
                {/* Level changed warning */}
                {levelChanged && (displayDelta ?? live.delta) > 0 && (
                  <div style={{ marginBottom: 14, backgroundColor: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#92400E', textAlign: 'center' as const }}>
                    ⚠️ Livello di rischio aumentato — rivalutare piano terapeutico
                  </div>
                )}
                {/* If already saved, show date */}
                {alreadySaved && (
                  <div style={{ marginBottom: 14, backgroundColor: '#F0FDF4', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
                    📅 Rilevato il {new Date(currentAss.pod1_assessed_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {/* Form fields */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <div>
                    <label style={{ ...lbl, marginBottom: 6 }}>NRS a riposo POD1</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                      {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} onClick={() => setPod1NrsRest(n)}
                          style={{ width: 38, height: 38, borderRadius: 10, border: `2px solid ${getNrsColor(n)}`,
                            backgroundColor: pod1NrsRest === n ? getNrsColor(n) : 'transparent', color: pod1NrsRest === n ? '#fff' : getNrsColor(n),
                            fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ ...lbl, marginBottom: 6 }}>NRS al movimento POD1</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                      {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} onClick={() => setPod1NrsMovement(n)}
                          style={{ width: 38, height: 38, borderRadius: 10, border: `2px solid ${getNrsColor(n)}`,
                            backgroundColor: pod1NrsMovement === n ? getNrsColor(n) : 'transparent', color: pod1NrsMovement === n ? '#fff' : getNrsColor(n),
                            fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ ...lbl, marginBottom: 4 }}>OME mg nelle prime 24h <span style={{ fontWeight: 400, fontSize: 11, color: T.textMuted }}>(opzionale)</span></label>
                    <input type="number" value={pod1Ome} onChange={e => setPod1Ome(e.target.value)}
                      placeholder="Es. 30" min={0} style={{ ...inp, width: 160 }} />
                  </div>
                </div>
                <button onClick={savePod1} disabled={pod1Saving}
                  style={{ ...btn('primary', 'md'), width: '100%', justifyContent: 'center', marginTop: 16,
                    backgroundColor: '#0369A1', borderColor: '#0369A1' }}>
                  {pod1Saving ? 'Salvataggio...' : alreadySaved ? '🔄 Aggiorna POD1' : '💾 Salva Aggiornamento POD1'}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* NRS Daily Chart + Timeline */}
      {(() => {
        const ass = assessments[0];
        if (!ass) return null;
        const t0Pct = ass.cpsp_risk_pct ?? null;
        const t1Pct = ass.risk_pct_dynamic ?? null;
        const t0Level = ass.cpsp_risk_level ?? 'basso';
        const t1Level = ass.risk_level_dynamic ?? null;
        // Trajectory from daily NRS
        const sorted = [...nrsDaily].sort((a, b) => a.pod_day - b.pod_day);

        // Stato 1: nessun dato giornaliero — mostra griglia vuota con pulsanti ➕
        if (sorted.length === 0) {
          const hasActiveToken = !!postDischargeTokenRow;
          const qrLink = postDischargeQrUrl;
          return (
            <div style={{ ...card, border: `1.5px solid #BAE6FD` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0369A1' }}>📈 Traiettoria Prima Settimana</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {hasActiveToken && postDischargeTokenRow?.token && (
                    <button onClick={() => { const l = `https://claudiogargiulo1-hash.github.io/aps-web/#/q/${postDischargeTokenRow.token}`; setPostDischargeQrUrl(l); setPostDischargeExpiresAt(postDischargeTokenRow.expires_at ?? ''); setPostDischargeShareModal(true); }}
                      style={{ ...btn('ghost', 'sm'), fontSize: 12 }}>📱 Mostra QR</button>
                  )}
                  {!hasActiveToken && (
                    qrLink
                      ? <button onClick={() => setPostDischargeShareModal(true)} style={{ ...btn('ghost', 'sm'), fontSize: 12 }}>📱 Condividi QR</button>
                      : <button onClick={() => handleGeneratePostDischargeQR(ass.id)} disabled={postDischargeQrGenerating}
                          style={{ ...btn('primary', 'sm'), opacity: postDischargeQrGenerating ? 0.7 : 1, fontSize: 12 }}>
                          {postDischargeQrGenerating ? '⏳...' : '📱 Genera QR'}
                        </button>
                  )}
                </div>
              </div>
              {hasActiveToken && (
                <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '6px 12px', marginBottom: 10, fontSize: 12, color: '#92400E' }}>
                  ⏳ QR inviato al paziente — in attesa delle compilazioni
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[1,2,3,4,5,6,7].map(day => (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 8, backgroundColor: hasActiveToken ? '#FFFBEB' : '#F8FAFC',
                    border: `1px solid ${hasActiveToken ? '#FCD34D' : '#E2E8F0'}` }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: T.textMuted, minWidth: 36 }}>POD{day}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, backgroundColor: '#F1F5F9', color: T.textMuted }}>⬜ —</span>
                    <span style={{ fontSize: 11, color: hasActiveToken ? '#B45309' : T.textLight, fontStyle: 'italic' }}>
                      {hasActiveToken ? '⏳ attesa paziente' : 'Dato mancante'}
                    </span>
                    <button onClick={() => openPodEditModal(day)} style={{ marginLeft: 'auto', ...btn('ghost', 'sm'), padding: '2px 8px', fontSize: 12 }}>➕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const chartData = sorted.map(d => ({
          day: `G${d.pod_day}`,
          riposo: d.nrs_rest,
          movimento: d.nrs_movement,
          interferenza: d.pain_interference ?? null,
        }));
        const lastDay = sorted[sorted.length - 1];
        const firstDay = sorted[0];

        // Trajectory badge
        let trajectory = '';
        let trajectoryColor = T.textMuted;
        if (sorted.length >= 3 && firstDay && lastDay) {
          const diff = (lastDay.nrs_rest ?? 0) - (firstDay.nrs_rest ?? 0);
          const avgRest = sorted.reduce((s, d) => s + (d.nrs_rest ?? 0), 0) / sorted.length;
          if (diff <= -2) { trajectory = '🟢 Miglioramento'; trajectoryColor = T.success; }
          else if (diff >= 2) { trajectory = '🔴 Peggioramento'; trajectoryColor = T.danger; }
          else if (avgRest >= 5) { trajectory = '⚠️ Dolore non si risolve'; trajectoryColor = T.warning; }
          else { trajectory = '🟡 Stabile'; trajectoryColor = '#CA8A04'; }
        }

        // Aggregated stats
        const n = sorted.length;
        const avg = (fn: (d: any) => number | null | undefined) => {
          const vals = sorted.map(fn).filter(v => v != null) as number[];
          return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
        };
        const avgRest     = avg(d => d.nrs_rest);
        const avgMov      = avg(d => d.nrs_movement);
        const avgInterf   = avg(d => d.pain_interference);
        const avgSleep    = avg(d => d.sleep_quality);
        const opioidDays  = sorted.filter(d => d.analgesics_used).length;

        // Composite trajectory score (0=favorable, 100=unfavorable)
        let compScore: number | null = null;
        if (n > 0 && avgRest !== null && avgMov !== null) {
          const rComp = ((avgRest ?? 0) / 10) * 40;
          const mComp = ((avgMov ?? 0) / 10) * 30;
          const iComp = avgInterf !== null ? ((avgInterf / 10) * 20) : 10;
          const sComp = avgSleep !== null ? (((10 - avgSleep) / 10) * 10) : 5;
          compScore = Math.round(rComp + mComp + iComp + sComp);
        }
        const compLabel = compScore === null ? null
          : compScore <= 30 ? { text: '🟢 Traiettoria favorevole', color: T.success, bg: T.successLight }
          : compScore <= 60 ? { text: '🟡 Traiettoria da monitorare', color: '#A16207', bg: '#FEF9C3' }
          : { text: '🔴 Traiettoria sfavorevole', color: T.danger, bg: T.dangerLight };

        // T2 risk update from composite score
        const t2Pct = t1Pct !== null && compScore !== null
          ? Math.min(100, Math.round(t1Pct + (compScore - 30) * 0.3))
          : null;
        const t2Level = t2Pct === null ? null
          : t2Pct < 25 ? 'basso' : t2Pct < 50 ? 'moderato' : t2Pct < 70 ? 'alto' : 'molto_alto';

        const hasDailyData = sorted.length > 0;
        const hasTimeline = t0Pct !== null || t1Pct !== null;
        if (!hasTimeline && !hasDailyData) return null;
        return (
          <div style={{ ...card, border: `1.5px solid #BAE6FD` }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0369A1' }}>📈 Traiettoria di Rischio</h3>

            {/* Timeline T0 → T1 → T2 */}
            {hasTimeline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
                {t0Pct !== null && (
                  <div style={{ backgroundColor: RISK_COLORS[t0Level] + '18', borderRadius: 10, padding: '8px 14px', textAlign: 'center' as const, border: `1.5px solid ${RISK_COLORS[t0Level]}33` }}>
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600 }}>T0 — Preop</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: RISK_COLORS[t0Level] }}>{t0Pct}%</div>
                    <div style={{ fontSize: 11, color: RISK_COLORS[t0Level], fontWeight: 600 }}>{RISK_LABELS[t0Level]}</div>
                  </div>
                )}
                {t0Pct !== null && t1Pct !== null && <div style={{ fontSize: 18, color: T.textMuted }}>→</div>}
                {t1Pct !== null && (
                  <div style={{ backgroundColor: RISK_COLORS[t1Level || 'basso'] + '18', borderRadius: 10, padding: '8px 14px', textAlign: 'center' as const, border: `1.5px solid ${RISK_COLORS[t1Level || 'basso']}33` }}>
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600 }}>T1 — POD1</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: RISK_COLORS[t1Level || 'basso'] }}>{t1Pct}%</div>
                    <div style={{ fontSize: 11, color: RISK_COLORS[t1Level || 'basso'], fontWeight: 600 }}>{RISK_LABELS[t1Level || 'basso']}</div>
                  </div>
                )}
                {t2Pct !== null && t2Level !== null && <div style={{ fontSize: 18, color: T.textMuted }}>→</div>}
                {t2Pct !== null && t2Level !== null && (
                  <div style={{ backgroundColor: RISK_COLORS[t2Level] + '18', borderRadius: 10, padding: '8px 14px', textAlign: 'center' as const, border: `1.5px solid ${RISK_COLORS[t2Level]}33` }}>
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600 }}>T2 — Sett. 1</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: RISK_COLORS[t2Level] }}>{t2Pct}%</div>
                    <div style={{ fontSize: 11, color: RISK_COLORS[t2Level], fontWeight: 600 }}>{RISK_LABELS[t2Level]}</div>
                  </div>
                )}
                {trajectory !== '' && (
                  <div style={{ marginLeft: 'auto', backgroundColor: trajectoryColor + '18', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700, color: trajectoryColor, border: `1px solid ${trajectoryColor}33` }}>
                    {trajectory}
                  </div>
                )}
              </div>
            )}

            {/* NRS Daily — hybrid per-day grid + chart */}
            {hasDailyData && (
              <div>
                {/* Per-day source grid */}
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
                  📊 Prima settimana &nbsp;
                  <span style={{ color: T.textLight, fontWeight: 400 }}>({n}/7 giorni)</span>
                  {postDischargeTokenRow && (
                    <button onClick={() => {
                      const l = `https://claudiogargiulo1-hash.github.io/aps-web/#/q/${postDischargeTokenRow.token}`;
                      setPostDischargeQrUrl(l);
                      setPostDischargeExpiresAt(postDischargeTokenRow.expires_at ?? '');
                      setPostDischargeShareModal(true);
                    }} style={{ ...btn('ghost', 'sm'), marginLeft: 8, fontSize: 11 }}>
                      📱 Mostra QR
                    </button>
                  )}
                  {!postDischargeTokenRow && n < 7 && (
                    <button onClick={() => handleGeneratePostDischargeQR(ass.id)}
                      disabled={postDischargeQrGenerating}
                      style={{ ...btn('ghost', 'sm'), marginLeft: 8, fontSize: 11, opacity: postDischargeQrGenerating ? 0.7 : 1 }}>
                      {postDischargeQrGenerating ? '⏳...' : '📱 Genera QR giorni mancanti'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {[1,2,3,4,5,6,7].map(day => {
                    // Può esserci una riga clinician E una patient_qr per lo stesso giorno
                    const dayRows = nrsDaily.filter(d => d.pod_day === day);
                    const clinicianRow = dayRows.find(d => d.source === 'clinician');
                    const patientRow = dayRows.find(d => d.source === 'patient_qr');
                    const isWaiting = dayRows.length === 0 && !!postDischargeTokenRow;
                    const SOURCE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
                      clinician:   { label: '🏥 APS',      bg: '#DCFCE7', color: T.success },
                      patient_qr:  { label: '📱 Paziente', bg: '#EDE9FE', color: '#5B21B6' },
                    };
                    const renderDataCells = (row: any) => (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 12, color: T.textMuted }}>Rip:</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: getNrsColor(row.nrs_rest ?? 0) }}>{row.nrs_rest ?? '—'}</span>
                        {row.nrs_movement != null && <>
                          <span style={{ fontSize: 12, color: T.textMuted }}>Mov:</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: getNrsColor(row.nrs_movement) }}>{row.nrs_movement}</span>
                        </>}
                        {row.pain_interference != null && <>
                          <span style={{ fontSize: 12, color: T.textMuted }}>Int:</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED' }}>{row.pain_interference}</span>
                        </>}
                        {row.sleep_quality != null && <>
                          <span style={{ fontSize: 12, color: T.textMuted }}>Son:</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0369A1' }}>{row.sleep_quality}</span>
                        </>}
                        {row.mood_score != null && <>
                          <span style={{ fontSize: 12, color: T.textMuted }}>Um:</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280' }}>{row.mood_score}</span>
                        </>}
                        {row.analgesics_used && <span style={{ fontSize: 10, backgroundColor: '#FEF9C3', color: '#92400E', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>💊</span>}
                      </span>
                    );
                    return (
                      <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* Riga clinician */}
                        {clinicianRow ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                            borderRadius: 8, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: T.textMuted, minWidth: 36 }}>POD{day}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              backgroundColor: SOURCE_BADGES.clinician.bg, color: SOURCE_BADGES.clinician.color }}>
                              {SOURCE_BADGES.clinician.label}
                            </span>
                            {renderDataCells(clinicianRow)}
                            <button onClick={() => openPodEditModal(day, clinicianRow)}
                              style={{ marginLeft: 'auto', ...btn('ghost', 'sm'), padding: '2px 8px', fontSize: 12 }}>✏️</button>
                          </div>
                        ) : null}
                        {/* Riga patient_qr */}
                        {patientRow ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                            borderRadius: 8, backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: T.textMuted, minWidth: 36 }}>{clinicianRow ? '' : `POD${day}`}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              backgroundColor: SOURCE_BADGES.patient_qr.bg, color: SOURCE_BADGES.patient_qr.color }}>
                              {SOURCE_BADGES.patient_qr.label}
                            </span>
                            {renderDataCells(patientRow)}
                          </div>
                        ) : null}
                        {/* Riga vuota */}
                        {dayRows.length === 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                            borderRadius: 8,
                            backgroundColor: isWaiting ? '#FFFBEB' : '#F8FAFC',
                            border: `1px solid ${isWaiting ? '#FCD34D' : '#E2E8F0'}` }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: T.textMuted, minWidth: 36 }}>POD{day}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              backgroundColor: '#F1F5F9', color: T.textMuted }}>⬜ —</span>
                            {isWaiting
                              ? <span style={{ fontSize: 11, color: '#B45309', fontStyle: 'italic' }}>⏳ QR inviato — attesa</span>
                              : <span style={{ fontSize: 11, color: T.textLight, fontStyle: 'italic' }}>Dato mancante</span>
                            }
                            <button onClick={() => openPodEditModal(day)}
                              style={{ marginLeft: 'auto', ...btn('ghost', 'sm'), padding: '2px 8px', fontSize: 12 }}>➕</button>
                          </div>
                        )}
                        {/* Riga con solo patient_qr — aggiungi pulsante per aggiungere riga clinician */}
                        {patientRow && !clinicianRow && (
                          <button onClick={() => openPodEditModal(day)}
                            style={{ alignSelf: 'flex-end', ...btn('ghost', 'sm'), padding: '2px 8px', fontSize: 11, color: T.textMuted }}>
                            + Aggiungi nota APS
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Chart */}
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} ticks={[0,2,4,6,8,10]} />
                    <Tooltip formatter={(v: any) => [v, '']} />
                    <ReferenceLine y={3} stroke="#16A34A" strokeDasharray="4 2" strokeWidth={1} />
                    <ReferenceLine y={7} stroke="#DC2626" strokeDasharray="4 2" strokeWidth={1} />
                    <Line type="monotone" dataKey="riposo" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3, fill: '#DC2626' }} />
                    <Line type="monotone" dataKey="movimento" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: '#F59E0B' }} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="interferenza" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3, fill: '#7C3AED' }} strokeDasharray="3 2" connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: T.textMuted, marginTop: 4, flexWrap: 'wrap' as const }}>
                  <span>— <span style={{ color: '#DC2626', fontWeight: 700 }}>NRS riposo</span></span>
                  <span>- - <span style={{ color: '#F59E0B', fontWeight: 700 }}>NRS movimento</span></span>
                  <span>- - <span style={{ color: '#7C3AED', fontWeight: 700 }}>Interferenza</span></span>
                </div>

                {/* Aggregated stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                  {[
                    { label: 'NRS medio riposo', value: avgRest, color: '#DC2626' },
                    { label: 'NRS medio mov.', value: avgMov, color: '#F59E0B' },
                    { label: 'Interferenza media', value: avgInterf, color: '#7C3AED' },
                    { label: 'Qualità sonno media', value: avgSleep, color: '#0369A1' },
                    { label: 'Giorni con oppioidi', value: `${opioidDays}/7`, color: T.text, noFormat: true },
                    compScore !== null ? { label: 'Score traiettoria', value: `${compScore}/100`, color: compScore <= 30 ? T.success : compScore <= 60 ? '#A16207' : T.danger, noFormat: true } : null,
                  ].filter(Boolean).map((item: any, i) => (
                    <div key={i} style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
                      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>
                        {item.noFormat ? item.value : item.value !== null ? item.value : '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Composite score badge */}
                {compLabel && (
                  <div style={{ marginTop: 10, backgroundColor: compLabel.bg, borderRadius: 10, padding: '8px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: compLabel.color }}>{compLabel.text}</span>
                    <span style={{ fontSize: 11, color: compLabel.color, fontWeight: 600 }}>Score: {compScore}/100</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Follow-up */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>📅 Follow-up CPSP</h3>
          <button onClick={() => { resetFollowupForm(); setView('followup_form'); }} style={btn('accent', 'sm')}>+ Nuovo Follow-up</button>
        </div>
        {followups.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.textMuted, padding: 24 }}>Nessun follow-up registrato</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {followups.map(f => (
              <div key={f.id} style={{ backgroundColor: T.bg, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                  <span style={{ backgroundColor: T.primaryLight, color: T.primary, borderRadius: 14, padding: '3px 12px', fontWeight: 700, fontSize: 13 }}>{f.followup_months === 0.5 ? '2 sett.' : f.followup_months === 1 ? '1 mese' : `${f.followup_months}m`}</span>
                  {f.cpsp_confirmed && <span style={{ backgroundColor: T.dangerLight, color: T.danger, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>CPSP ✓</span>}
                  {f.dn4_neuropathic && <span style={{ backgroundColor: T.warningLight, color: T.warning, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>Neuropatico</span>}
                  {f.fas_score && <span style={{ backgroundColor: f.fas_score === 'C' ? T.dangerLight : f.fas_score === 'B' ? T.warningLight : T.successLight, color: f.fas_score === 'C' ? T.danger : f.fas_score === 'B' ? T.warning : T.success, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>FAS-{f.fas_score}</span>}
                  {f.referral_pain_center && <span style={{ backgroundColor: T.accentLight, color: T.accent, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>→ Centro dolore</span>}
                  <span style={{ fontSize: 11, color: T.textLight }}>{f.followup_date ? format(parseISO(f.followup_date), 'dd/MM/yy') : format(parseISO(f.created_at), 'dd/MM/yy')}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => editFollowup(f)} style={{ ...btn('ghost', 'sm'), padding: '4px 10px' }}>✏️</button>
                    <button onClick={() => deleteFollowup(f.id)} style={{ ...btn('ghost', 'sm'), padding: '4px 10px', color: T.danger }}>🗑</button>
                  </div>
                </div>
                {f.pain_present ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {([['NRS', f.pain_nrs_current], ['Riposo', f.pain_nrs_rest], ['Movimento', f.pain_nrs_movement]] as [string, number][]).filter(([, v]) => v != null).map(([l, v]) => (
                      <div key={l} style={{ backgroundColor: getNrsBg(v), borderRadius: 8, padding: '4px 10px' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>{l}: </span>
                        <span style={{ fontWeight: 700, color: getNrsColor(v) }}>{v}</span>
                      </div>
                    ))}
                    {f.bpi_general_activity != null && <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '4px 10px' }}><span style={{ fontSize: 11, color: T.textMuted }}>BPI: </span><span style={{ fontWeight: 700, color: T.text }}>{Math.round(([f.bpi_general_activity, f.bpi_mood, f.bpi_walking, f.bpi_work, f.bpi_relations, f.bpi_sleep, f.bpi_enjoyment].reduce((a: number, b: number) => a + b, 0) / 7) * 10) / 10}/10</span></div>}
                    {f.dn4_score != null && <div style={{ backgroundColor: f.dn4_score >= 4 ? T.warningLight : '#fff', borderRadius: 8, padding: '4px 10px' }}><span style={{ fontSize: 11, color: T.textMuted }}>DN4: </span><span style={{ fontWeight: 700, color: f.dn4_score >= 4 ? T.warning : T.text }}>{f.dn4_score}/7</span></div>}
                    {f.eq5d_vas != null && <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '4px 10px' }}><span style={{ fontSize: 11, color: T.textMuted }}>EQ-VAS: </span><span style={{ fontWeight: 700, color: T.text }}>{f.eq5d_vas}</span></div>}
                  </div>
                ) : <div style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>✓ Nessun dolore cronico</div>}
                {f.current_therapy && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>💊 {f.current_therapy}</div>}
                {f.notes && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>📝 {f.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual POD entry modal */}
      {podEditModal && assessments[0] && (() => {
        const ass = assessments[0];
        const NRSPicker = ({ label, value, onChange, optional }: { label: string; value: number | null; onChange: (n: number | null) => void; optional?: boolean }) => (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B8080', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</label>
              {optional && value !== null && (
                <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', fontSize: 11, color: T.textMuted, cursor: 'pointer' }}>✕ rimuovi</button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => onChange(n)} style={{
                  width: 34, height: 34, borderRadius: 8, border: `2px solid ${getNrsColor(n)}`,
                  backgroundColor: value === n ? getNrsColor(n) : 'transparent',
                  color: value === n ? '#fff' : getNrsColor(n),
                  fontWeight: 800, fontSize: 12, cursor: 'pointer',
                }}>{n}</button>
              ))}
            </div>
          </div>
        );
        return (
          <div onClick={() => setPodEditModal(false)} style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{
              backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 420,
              maxHeight: '90vh', overflowY: 'auto' as const,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: T.primary }}>📝 POD{podEditDay} — Inserimento Medico</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: '#DCFCE7', color: T.success, borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                    👨‍⚕️ Inserimento Manuale APS
                  </div>
                </div>
                <button onClick={() => setPodEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
              </div>

              <NRSPicker label="NRS a riposo *" value={podEditNrsRest} onChange={v => setPodEditNrsRest(v ?? 0)} />
              <NRSPicker label="NRS al movimento *" value={podEditNrsMovement} onChange={v => setPodEditNrsMovement(v ?? 0)} />
              <NRSPicker label="Interferenza attività (opz.)" value={podEditInterference} onChange={setPodEditInterference} optional />
              <NRSPicker label="Qualità sonno (opz.)" value={podEditSleep} onChange={setPodEditSleep} optional />
              <NRSPicker label="Umore (opz.)" value={podEditMood} onChange={setPodEditMood} optional />

              {/* Oppioidi */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B8080', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Oppioidi</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setPodEditOpioids(!podEditOpioids)} style={{
                    padding: '6px 14px', borderRadius: 8, border: `2px solid ${podEditOpioids ? T.warning : T.border}`,
                    backgroundColor: podEditOpioids ? T.warningLight : '#fff',
                    color: podEditOpioids ? T.warning : T.textMuted,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {podEditOpioids ? '💊 Sì' : '○ No'}
                  </button>
                  {podEditOpioids && (
                    <input value={podEditOpioidName} onChange={e => setPodEditOpioidName(e.target.value)}
                      placeholder="Farmaco..." style={{ ...inp, flex: 1, padding: '6px 10px', fontSize: 13 }} />
                  )}
                </div>
              </div>

              <button onClick={() => savePodEntry(ass.id)} disabled={podEditSaving}
                style={{ ...btn('primary', 'md'), justifyContent: 'center', opacity: podEditSaving ? 0.7 : 1 }}>
                {podEditSaving ? '⏳ Salvataggio...' : `💾 Salva POD${podEditDay}`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Post-discharge share modal */}
      {postDischargeShareModal && postDischargeQrUrl && (() => {
        const patientName = patient?.full_name ?? patient?.nome ?? '';
        const expiryDate = postDischargeExpiresAt
          ? new Date(postDischargeExpiresAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '';
        const waText = encodeURIComponent(
          `Gentile paziente${patientName ? ` ${patientName}` : ''},\n\nEcco il link per il monitoraggio del dolore post-dimissione. Aprilo ogni sera per 7 giorni e rispondi alle 6 brevi domande:\n\n${postDischargeQrUrl}\n\n⏰ Valido fino al ${expiryDate}`
        );
        const emailSubject = encodeURIComponent('Monitoraggio dolore post-dimissione');
        const emailBody = encodeURIComponent(
          `Gentile paziente${patientName ? ` ${patientName}` : ''},\n\nEcco il link per il monitoraggio del dolore post-dimissione.\nAprilo ogni sera per 7 giorni e rispondi alle 6 brevi domande:\n\n${postDischargeQrUrl}\n\nValido fino al ${expiryDate}\n\n— APS Team`
        );
        return (
          <div
            onClick={() => setPostDischargeShareModal(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400,
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: T.primary }}>📱 QR Post-Dimissione</div>
                  {patientName && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{patientName}</div>}
                </div>
                <button onClick={() => setPostDischargeShareModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 20, lineHeight: 1, padding: 0 }}>✕</button>
              </div>

              {/* QR Code */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 12, backgroundColor: '#fff', border: `2px solid ${T.border}`, borderRadius: 14 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(postDischargeQrUrl)}`}
                    alt="QR Code" style={{ width: 200, height: 200, display: 'block' }} />
                </div>
                {/* Expiry badge */}
                {expiryDate && (
                  <div style={{ backgroundColor: '#FEF9C3', border: '1px solid #FCD34D', borderRadius: 20,
                    padding: '4px 14px', fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                    ⏰ Valido fino al {expiryDate}
                  </div>
                )}
              </div>

              {/* Days coverage summary */}
              {(qrCoveredDays.length > 0 || qrMissingDays.length > 0) && (
                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                  {qrCoveredDays.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: T.success }}>🏥 Giorni già coperti dall'APS: </span>
                      <span style={{ color: T.success }}>{qrCoveredDays.sort((a,b)=>a-b).map(d => `POD${d}`).join(', ')}</span>
                    </div>
                  )}
                  {qrMissingDays.length > 0 && (
                    <div>
                      <span style={{ fontWeight: 700, color: '#1D4ED8' }}>📱 Giorni richiesti al paziente via QR: </span>
                      <span style={{ color: '#1D4ED8' }}>{qrMissingDays.sort((a,b)=>a-b).map(d => `POD${d}`).join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* URL + copy */}
              <div style={{ backgroundColor: T.bg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: T.textMuted, wordBreak: 'break-all' as const, marginBottom: 6 }}>
                  {postDischargeQrUrl}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(postDischargeQrUrl); setPostDischargeQrCopied(true); setTimeout(() => setPostDischargeQrCopied(false), 2000); }}
                  style={{ ...btn('ghost', 'sm'), width: '100%', justifyContent: 'center', fontSize: 13 }}>
                  {postDischargeQrCopied ? '✓ Copiato!' : '📋 Copia link'}
                </button>
              </div>

              {/* Share buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"
                  style={{ ...btn('ghost', 'sm'), flex: 1, justifyContent: 'center', textDecoration: 'none',
                    backgroundColor: '#25D366', color: '#fff', border: 'none', display: 'flex', alignItems: 'center' }}>
                  💬 WhatsApp
                </a>
                <a href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
                  style={{ ...btn('ghost', 'sm'), flex: 1, justifyContent: 'center', textDecoration: 'none',
                    backgroundColor: '#3B82F6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center' }}>
                  📧 Email
                </a>
              </div>

              {/* Patient instructions */}
              <div style={{ backgroundColor: T.primaryLight, borderRadius: 10, padding: '10px 14px',
                border: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 6 }}>
                  📋 Istruzioni per il paziente
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.text, lineHeight: 1.7 }}>
                  <li>Apri il link ogni sera per <strong>7 giorni</strong></li>
                  <li>Rispondi alle <strong>6 brevi domande</strong> sul dolore</li>
                  <li>Richiede solo 1-2 minuti</li>
                  <li>I dati vengono inviati automaticamente al team APS</li>
                </ul>
              </div>

              <button onClick={() => setPostDischargeShareModal(false)}
                style={{ ...btn('ghost', 'sm'), alignSelf: 'center' }}>
                Chiudi
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// PATIENT DETAIL
// ============================================================
function PatientDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [patient, setPatient] = useState<any>(null);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [tab, setTab] = useState<'nrs'|'info'|'interventions'|'cpsp'|'audit'>('nrs');
  const [nrsValue, setNrsValue] = useState<number|null>(null);
  const [nrsMovement, setNrsMovement] = useState<number>(0);
  const [therapy, setTherapy] = useState('');
  const [notes, setNotes] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingNrsId, setEditingNrsId] = useState<string | null>(null);
  const [editNrsValue, setEditNrsValue] = useState<number>(0);
  const [editNrsMovement, setEditNrsMovement] = useState<number | null>(null);
  const [editNrsTime, setEditNrsTime] = useState<string>('');
  const [editNrsTherapy, setEditNrsTherapy] = useState<string>('');
  const [editNrsFas, setEditNrsFas] = useState<string>('');

  const canDelete = ['medico', 'admin'].includes(profile?.role);
  const canDeleteNRS = ['medico', 'infermiere', 'admin'].includes(profile?.role);
  const [dischargeQrUrl, setDischargeQrUrl] = useState('');
  const [dischargeQrCopied, setDischargeQrCopied] = useState(false);
  const [dischargeQrLoading, setDischargeQrLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const [pRes, iRes, mRes] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('interventions').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
      supabase.from('nrs_measurements').select('*').eq('patient_id', id).order('measured_at', { ascending: false }).limit(50),
    ]);
    setPatient(pRes.data);
    setInterventions(iRes.data || []);
    setMeasurements(mRes.data || []);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-select closest past scheduled NRS slot on first load
  useEffect(() => {
    if (selectedSlot !== '') return;
    const endTimeStr = interventions[0]?.intervention_end_time;
    if (!endTimeStr) {
      // No intervention: auto-select closest past default slot
      const now = new Date();
      const defaultSlots = ['08:00', '12:00', '16:00', '20:00', '24:00'];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      let closest = defaultSlots[0];
      for (const slot of defaultSlots) {
        const [h, m] = slot.split(':').map(Number);
        if (h * 60 + m <= currentMinutes) closest = slot;
      }
      setSelectedSlot(closest);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const [h, m] = closest.split(':').map(Number);
      today.setHours(h, m, 0, 0);
      setCustomTime(format(today, "yyyy-MM-dd'T'HH:mm"));
      return;
    }
    const endTime = new Date(endTimeStr);
    const now = new Date();
    const offsets = [6, 12, 18, 24, 48];
    const pastOffsets = offsets.filter(h => endTime.getTime() + h * 3600000 <= now.getTime());
    const selectedH = pastOffsets.length > 0 ? pastOffsets[pastOffsets.length - 1] : offsets[0];
    const slotTime = new Date(endTime.getTime() + selectedH * 3600000);
    setSelectedSlot(`+${selectedH}h`);
    setCustomTime(format(slotTime, "yyyy-MM-dd'T'HH:mm"));
  }, [interventions]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNrsToCpspTrajectory = async (nrsValue: number | null, nrsMovement: number | null, measuredAt: string) => {
    const nrsRestValue = nrsValue ?? null;
    const nrsMovValue: number | null = nrsMovement ?? null;
    if (nrsRestValue === null && nrsMovValue === null) return;

    const tenantId = localStorage.getItem('tenant_id');
    const { data: assessment } = await supabase
      .from('cpsp_assessments')
      .select('id, surgery_date, created_at')
      .eq('patient_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!assessment) return;

    // Fallback: se surgery_date è null usa created_at dell'assessment
    const surgeryDate = new Date(assessment.surgery_date || assessment.created_at);
    const measDate = new Date(measuredAt);
    const podDay = Math.max(1, Math.floor((measDate.getTime() - surgeryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    if (podDay > 7) return;

    await supabase.from('cpsp_nrs_daily').upsert({
      patient_id: id,
      assessment_id: assessment.id,
      tenant_id: tenantId,
      pod_day: podDay,
      nrs_rest: nrsRestValue,
      nrs_movement: nrsMovValue,
      source: 'clinician',
      recorded_at: measuredAt || new Date().toISOString(),
    }, { onConflict: 'assessment_id,pod_day,source' });
  };

  const saveNRS = async () => {
    if (nrsValue === null) return alert('Seleziona un valore NRS');
    setSaving(true);
    const measuredAt = customTime ? new Date(customTime).toISOString() : new Date().toISOString();
    const nrsMovVal = nrsMovement > 0 ? nrsMovement : null;
    await supabase.from('nrs_measurements').insert({
      patient_id: id, intervention_id: interventions[0]?.id,
      nrs_value: nrsValue, nrs_movement: nrsMovVal,
      therapy_administered: therapy || null,
      notes: notes || null, measured_at: measuredAt, recorded_by: profile?.id,
    });
    // Sync silenzioso alla traiettoria CPSP (ignora errori)
    syncNrsToCpspTrajectory(nrsValue, nrsMovVal, measuredAt).catch(() => {});
    setNrsValue(null); setNrsMovement(0); setTherapy(''); setNotes(''); setCustomTime(''); setSelectedSlot('');
    await fetchAll(); setSaving(false);
  };

  const deleteNRS = async (nrsId: string) => {
    if (!window.confirm('Eliminare?')) return;
    await supabase.from('nrs_measurements').delete().eq('id', nrsId);
    setMeasurements(prev => prev.filter(m => m.id !== nrsId));
  };

  const handleEditNrs = (nrs: any) => {
    setEditingNrsId(nrs.id);
    setEditNrsValue(nrs.nrs_value ?? 0);
    setEditNrsMovement(nrs.nrs_movement ?? null);
    setEditNrsTime(nrs.measured_at ? new Date(nrs.measured_at).toISOString().slice(0, 16) : '');
    setEditNrsTherapy(nrs.therapy_administered ?? '');
    setEditNrsFas(nrs.fas_score ?? '');
  };

  const handleSaveEditNrs = async () => {
    if (!editingNrsId) return;
    const { error } = await supabase
      .from('nrs_measurements')
      .update({
        nrs_value: editNrsValue,
        nrs_movement: editNrsMovement,
        measured_at: editNrsTime ? new Date(editNrsTime).toISOString() : undefined,
        therapy_administered: editNrsTherapy || null,
        fas_score: editNrsFas || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingNrsId);
    if (error) { alert('Errore modifica: ' + error.message); return; }
    setEditingNrsId(null);
    await fetchAll();
  };

  const generateDischargeQr = async () => {
    setDischargeQrLoading(true);
    const tenantId = localStorage.getItem('tenant_id');
    const dischargeDateStr = patient?.discharge_date || new Date().toISOString().split('T')[0];
    const expiresAt = new Date(new Date(dischargeDateStr).getTime() + 10 * 86400000).toISOString();
    // Recupera l'ultimo assessment CPSP per collegare il token
    const { data: asmData } = await supabase
      .from('cpsp_assessments')
      .select('id')
      .eq('patient_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const assessmentId = asmData?.id || null;
    const { data, error } = await supabase
      .from('patient_questionnaire_tokens')
      .insert({
        assessment_id: assessmentId,
        patient_id: id,
        tenant_id: tenantId,
        token_type: 'post_discharge_nrs',
        scales: ['post_discharge_nrs'],
        discharge_date: dischargeDateStr,
        valid_until_pod: 7,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (error) { alert('Errore: ' + error.message); setDischargeQrLoading(false); return; }
    setDischargeQrUrl(`https://claudiogargiulo1-hash.github.io/aps-web/#/q/${data.token}`);
    setDischargeQrLoading(false);
  };

  const deleteIntervention = async (iId: string) => {
    if (!window.confirm('Eliminare?')) return;
    await supabase.from('interventions').delete().eq('id', iId);
    setInterventions(prev => prev.filter(i => i.id !== iId));
  };

  if (!patient) return <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>Caricamento...</div>;

  const tabs = [['nrs', '📊 NRS'], ['info', '👤 Info'], ['interventions', '🔧 Interventi'], ['cpsp', '🧠 CPSP'], ...(profile?.role === 'admin' ? [['audit', '📜 Cronologia']] : [])];

  // Scheduled NRS slots from last intervention end time, or default daily slots
  const lastEndTimeStr = interventions[0]?.intervention_end_time;
  const scheduledSlots: Array<{ key: string; label: string; localString: string }> = lastEndTimeStr
    ? [6, 12, 18, 24, 48].map(h => {
        const slotTime = new Date(new Date(lastEndTimeStr).getTime() + h * 3600000);
        return {
          key: `+${h}h`,
          label: `+${h}h (${format(slotTime, 'HH:mm dd/MM')})`,
          localString: format(slotTime, "yyyy-MM-dd'T'HH:mm"),
        };
      })
    : ['08:00', '12:00', '16:00', '20:00', '24:00'].map(slot => {
        const [h, m] = slot.split(':').map(Number);
        const today = new Date();
        today.setHours(h, m, 0, 0);
        return {
          key: slot,
          label: slot,
          localString: format(today, "yyyy-MM-dd'T'HH:mm"),
        };
      });

  // Chart data
  const chartData = [...measurements].reverse().slice(-15).map(m => ({
    time: format(parseISO(m.measured_at), 'dd/MM HH:mm'),
    nrs: m.nrs_value,
  }));

  const currentStatus = getPatientStatus(patient);
  const statusColor = PATIENT_STATUS_COLORS[currentStatus];
  const statusBg = PATIENT_STATUS_BG[currentStatus];

  const updateStatus = async (newStatus: string) => {
    const isActive = newStatus !== 'dimesso';
    const extra: any = isActive ? {} : { discharge_date: new Date().toISOString().split('T')[0] };
    await supabase.from('patients').update({ patient_status: newStatus, is_active: isActive, ...extra }).eq('id', id);
    await fetchAll();
  };

  const renderPostopDrugs = (postopDrugs: any) => {
    if (!postopDrugs) return null;
    let data = postopDrugs;
    if (typeof postopDrugs === 'string') {
      try { data = JSON.parse(postopDrugs); } catch {
        return <span style={{ fontSize: 13, color: T.text }}>{postopDrugs}</span>;
      }
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.opioids && data.opioids.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' as const, marginBottom: 4 }}>💊 Oppioidi</div>
            {data.opioids.map((op: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#FFF7ED', borderRadius: 8, padding: '6px 10px', marginBottom: 4, border: '1px solid #FED7AA' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#C2410C' }}>{op.drug}</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>{op.dose}mg</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>·</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>{op.frequency}</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>·</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>{op.route}</span>
              </div>
            ))}
          </div>
        )}
        {data.other && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' as const, marginBottom: 4 }}>🩺 Altri farmaci</div>
            <div style={{ backgroundColor: '#F0F4F4', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: T.text, whiteSpace: 'pre-line' as const }}>
              {data.other}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/patients')} style={{ background: T.primaryLight, border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary }}>←</button>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, color: T.text, fontWeight: 800 }}>{patient.last_name} {patient.first_name}</h1>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{patient.ward} · Letto {patient.bed || '—'} · {patient.admission_number}</div>
            <span style={{ display: 'inline-block', marginTop: 4, backgroundColor: statusBg, color: statusColor, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10 }}>
              {PATIENT_STATUS_LABELS[currentStatus]}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <button onClick={() => navigate('/patients/' + id + '/edit')} style={btn('ghost', 'sm')}>✏️ Modifica</button>
          {canDelete && (
            <>
              {currentStatus === 'pre_ricovero' && (
                <button onClick={() => updateStatus('ricoverato')}
                  style={{ background: '#EFF6FF', border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: '#3B82F6', fontWeight: 600, fontSize: 13 }}>
                  🏥 Ricovera
                </button>
              )}
              {currentStatus === 'ricoverato' && (
                <button onClick={async () => {
                  const notes = window.prompt('Note di dimissione (opzionale):') ?? '';
                  if (notes === null) return;
                  await supabase.from('patients').update({ is_active: false, patient_status: 'dimesso', discharge_date: new Date().toISOString().split('T')[0], discharge_notes: notes || null }).eq('id', id);
                  await fetchAll();
                }} style={{ background: T.warningLight, border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: T.warning, fontWeight: 600, fontSize: 13 }}>
                  🏠 Dimetti
                </button>
              )}
              {currentStatus === 'dimesso' && (
                <>
                  <button onClick={() => updateStatus('followup_cpsp')}
                    style={{ background: '#EDE9FE', border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: '#7C3AED', fontWeight: 600, fontSize: 13 }}>
                    🧠 Attiva Follow-up CPSP
                  </button>
                  <button onClick={dischargeQrUrl ? () => setDischargeQrUrl('') : generateDischargeQr} disabled={dischargeQrLoading}
                    style={{ background: '#E0F2FE', border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: '#0369A1', fontWeight: 600, fontSize: 13 }}>
                    {dischargeQrLoading ? '⏳' : dischargeQrUrl ? '✕ Chiudi QR' : '📱 Attiva Monitoraggio NRS Domiciliare (POD1→7)'}
                  </button>
                </>
              )}
              {currentStatus !== 'ricoverato' && (
                <button onClick={() => updateStatus('ricoverato')}
                  style={{ background: T.primaryLight, border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: T.primary, fontWeight: 600, fontSize: 13 }}>
                  ↺ Riattiva
                </button>
              )}
              <button onClick={async () => { if (window.confirm('Eliminare definitivamente?')) { await supabase.from('patients').delete().eq('id', id); navigate('/patients'); }}}
                style={{ background: T.dangerLight, border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: T.danger, fontWeight: 600, fontSize: 13 }}>🗑</button>
            </>
          )}
        </div>
      </div>

      {/* Discharge QR Panel */}
      {dischargeQrUrl && (
        <div style={{ backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1D4ED8', marginBottom: 12 }}>📱 Monitoraggio NRS Domiciliare — QR Paziente</div>
          <div style={{ fontSize: 12, color: '#3B82F6', backgroundColor: '#DBEAFE', borderRadius: 8, padding: '6px 10px', marginBottom: 12, lineHeight: 1.5 }}>
            Invia questo link al paziente — potrà compilare il dolore ogni giorno da casa per 7 giorni
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
            <div style={{ backgroundColor: '#fff', padding: 10, borderRadius: 10, border: '1px solid #BFDBFE', flexShrink: 0 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(dischargeQrUrl)}`}
                alt="QR Code" width={160} height={160} style={{ display: 'block' }} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ backgroundColor: '#fff', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#374151', wordBreak: 'break-all' as const, lineHeight: 1.5, marginBottom: 8 }}>
                {dischargeQrUrl}
              </div>
              <button onClick={() => { navigator.clipboard.writeText(dischargeQrUrl); setDischargeQrCopied(true); setTimeout(() => setDischargeQrCopied(false), 2000); }}
                style={{ padding: '7px 16px', borderRadius: 10, border: '1.5px solid #3B82F6', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 600, fontSize: 12, cursor: 'pointer', width: '100%' }}>
                {dischargeQrCopied ? '✓ Copiato!' : '📋 Copia link'}
              </button>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>⏱ Link valido 10 giorni · POD1 → POD7</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, backgroundColor: T.card, borderRadius: 14, padding: 4, boxShadow: '0 2px 8px rgba(0,80,80,0.08)', width: 'fit-content' }}>
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as any)}
            style={{ padding: isMobile ? '8px 14px' : '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: isMobile ? 13 : 14,
              backgroundColor: tab === t ? T.primary : 'transparent',
              color: tab === t ? '#fff' : T.textMuted, transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* NRS Tab */}
      {tab === 'nrs' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          {/* Input */}
          <div style={card}>
            <h3 style={{ margin: '0 0 16px', color: T.text, fontSize: 15, fontWeight: 700 }}>+ Nuova Rilevazione</h3>
            <label style={{ ...lbl, marginBottom: 6 }}>NRS Riposo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setNrsValue(n)}
                  style={{ width: 42, height: 42, borderRadius: 12, border: `2px solid ${getNrsColor(n)}`,
                    backgroundColor: nrsValue === n ? getNrsColor(n) : 'transparent',
                    color: nrsValue === n ? '#fff' : getNrsColor(n),
                    fontWeight: 800, fontSize: 15, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {n}
                </button>
              ))}
            </div>
            <label style={{ ...lbl, marginBottom: 6 }}>NRS Movimento <span style={{ fontWeight: 400, color: T.textLight }}>(opzionale)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setNrsMovement(nrsMovement === n ? 0 : n)}
                  style={{ width: 42, height: 42, borderRadius: 12, border: `2px solid ${getNrsColor(n)}`,
                    backgroundColor: nrsMovement === n && n > 0 ? getNrsColor(n) : 'transparent',
                    color: nrsMovement === n && n > 0 ? '#fff' : getNrsColor(n),
                    fontWeight: 800, fontSize: 15, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 6 }}>Data/Ora rilevazione</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {scheduledSlots.map(slot => (
                  <button key={slot.key} onClick={() => { setSelectedSlot(slot.key); setCustomTime(slot.localString); }}
                    style={{ padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${selectedSlot === slot.key ? T.primary : T.border}`,
                      backgroundColor: selectedSlot === slot.key ? T.primaryLight : '#fff',
                      color: selectedSlot === slot.key ? T.primary : T.textMuted,
                      fontWeight: selectedSlot === slot.key ? 700 : 400, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                    {slot.label}
                  </button>
                ))}
                <button onClick={() => setSelectedSlot('custom')}
                  style={{ padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${selectedSlot === 'custom' ? T.primary : T.border}`,
                    backgroundColor: selectedSlot === 'custom' ? T.primaryLight : '#fff',
                    color: selectedSlot === 'custom' ? T.primary : T.textMuted,
                    fontWeight: selectedSlot === 'custom' ? 700 : 400, fontSize: 12, cursor: 'pointer' }}>
                  🕐 Personalizzato
                </button>
              </div>
              {selectedSlot === 'custom' && (
                <input type="datetime-local" value={customTime} onChange={e => setCustomTime(e.target.value)}
                  style={{ ...inp }} />
              )}
            </div>
            <input value={therapy} onChange={e => setTherapy(e.target.value)} placeholder="Terapia somministrata"
              style={{ ...inp, marginBottom: 8 }} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note..."
              style={{ ...inp, marginBottom: 12, minHeight: 70, resize: 'vertical' as const }} />
            <button onClick={saveNRS} disabled={saving || nrsValue === null}
              style={{ ...btn(nrsValue !== null ? 'primary' : 'ghost', 'md'), width: '100%', justifyContent: 'center', fontSize: 15, padding: 12 }}>
              {saving ? 'Salvataggio...' : '💾 Salva Rilevazione'}
            </button>
          </div>

          {/* List */}
          <div style={{ ...card, maxHeight: 480, overflowY: 'auto' as const }}>
            <h3 style={{ margin: '0 0 12px', color: T.text, fontSize: 15, fontWeight: 700 }}>Rilevazioni</h3>
            {measurements.length === 0 ? <div style={{ textAlign: 'center', color: T.textMuted, padding: 20 }}>Nessuna</div> :
              measurements.map((m: any) => (
                editingNrsId === m.id ? (
                  <div key={m.id} style={{ backgroundColor: '#F0F4F4', borderRadius: 10, padding: 12, border: '2px solid #0A6E6E', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0A6E6E', marginBottom: 10 }}>✏️ Modifica Rilevazione</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={lbl}>NRS Riposo</label>
                        <input type="range" min={0} max={10} value={editNrsValue}
                          onChange={e => setEditNrsValue(parseInt(e.target.value))}
                          style={{ width: '100%' }} />
                        <div style={{ textAlign: 'center', fontWeight: 800, color: editNrsValue <= 3 ? '#16A34A' : editNrsValue <= 6 ? '#F97316' : '#DC2626' }}>
                          {editNrsValue}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={lbl}>NRS Movimento</label>
                        <input type="range" min={0} max={10} value={editNrsMovement ?? 0}
                          onChange={e => setEditNrsMovement(parseInt(e.target.value))}
                          style={{ width: '100%' }} />
                        <div style={{ textAlign: 'center', fontWeight: 800, color: !editNrsMovement ? '#9CA3AF' : editNrsMovement <= 3 ? '#16A34A' : editNrsMovement <= 6 ? '#F97316' : '#DC2626' }}>
                          {editNrsMovement ?? '—'}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={lbl}>Data e ora</label>
                        <input type="datetime-local" value={editNrsTime}
                          onChange={e => setEditNrsTime(e.target.value)} style={inp} />
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={lbl}>FAS</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {['A', 'B', 'C'].map(v => (
                            <button key={v} onClick={() => setEditNrsFas(editNrsFas === v ? '' : v)}
                              style={{ flex: 1, padding: '6px 0', borderRadius: 8, cursor: 'pointer',
                                border: `2px solid ${editNrsFas === v ? '#0A6E6E' : '#E2E8F0'}`,
                                backgroundColor: editNrsFas === v ? '#E6F4F4' : '#fff',
                                fontWeight: 700, color: editNrsFas === v ? '#0A6E6E' : '#6B7280' }}>
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={lbl}>Terapia somministrata</label>
                      <input type="text" value={editNrsTherapy}
                        onChange={e => setEditNrsTherapy(e.target.value)}
                        placeholder="Es. Paracetamolo 1g EV, Ketorolac 30mg..."
                        style={inp} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={handleSaveEditNrs} style={btn('primary', 'sm')}>💾 Salva modifiche</button>
                      <button onClick={() => setEditingNrsId(null)} style={btn('ghost', 'sm')}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.bg}` }}>
                    <span style={{ backgroundColor: getNrsBg(m.nrs_value), color: getNrsColor(m.nrs_value), padding: '5px 12px', borderRadius: 20, fontWeight: 800, fontSize: 17, minWidth: 40, textAlign: 'center' as const }}>
                      {m.nrs_value}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: T.textMuted }}>{format(parseISO(m.measured_at), 'dd/MM/yyyy HH:mm')}</div>
                      {m.therapy_administered && <div style={{ fontSize: 12, color: T.accent, marginTop: 2 }}>💊 {m.therapy_administered}</div>}
                      {m.notes && <div style={{ fontSize: 12, color: T.textMuted }}>{m.notes}</div>}
                    </div>
                    {canDeleteNRS && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleEditNrs(m)} style={btn('ghost', 'sm')}>✏️</button>
                        <button onClick={() => deleteNRS(m.id)} style={{ ...btn('danger', 'sm') }}>🗑</button>
                      </div>
                    )}
                  </div>
                )
              ))
            }
          </div>
        </div>
      )}

      {/* Info Tab */}
      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* NRS Chart */}
          {chartData.length > 1 && (
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', color: T.text, fontSize: 15, fontWeight: 700 }}>📊 Andamento NRS</h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: T.textMuted }}>Ultime {chartData.length} rilevazioni</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.bg} />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} ticks={[0,2,4,6,8,10]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }} />
                  <ReferenceLine y={7} stroke={T.danger} strokeDasharray="4 4" />
                  <ReferenceLine y={4} stroke={T.warning} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="nrs" stroke={T.primary} strokeWidth={2.5} dot={{ r: 4, fill: T.primary }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Data */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', color: T.text, fontSize: 15, fontWeight: 700 }}>👤 Dati Paziente</h3>
            {[
              ['Nome', patient.first_name + ' ' + patient.last_name],
              ['Data di nascita', formatDateDisplay(patient.date_of_birth)],
              ['Codice Fiscale', patient.fiscal_code || '—'],
              ['Sesso', patient.gender || '—'],
              ['N° Ricovero', patient.admission_number],
              ['Reparto', patient.ward],
              ['Letto', patient.bed || '—'],
              ['Data ricovero', formatDateDisplay(patient.admission_date)],
              ['Peso', patient.weight_kg ? patient.weight_kg + ' kg' : '—'],
              ['Altezza', patient.height_cm ? patient.height_cm + ' cm' : '—'],
              ['Classe ASA', patient.asa_class ? 'ASA ' + patient.asa_class : '—'],
              ['Allergie', patient.allergies || '—'],
              ['Note', patient.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', padding: '9px 0', borderBottom: `1px solid ${T.bg}` }}>
                <div style={{ width: 130, fontSize: 12, color: T.textMuted, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{label}</div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: label === 'Allergie' && value !== '—' ? 700 : 400, color: label === 'Allergie' && value !== '—' ? T.danger : T.text }}>{value}</div>
              </div>
            ))}
          </div>
          <OpioidTracker patientId={id!} interventionId={interventions[0]?.id} profile={profile} />
        </div>
      )}

      {/* Interventions Tab */}
      {tab === 'interventions' && (
        <div>
          {(profile?.role === 'medico' || profile?.role === 'admin') && (
            <button onClick={() => navigate('/patients/' + id + '/interventions/new')} style={{ ...btn('primary'), marginBottom: 16 }}>
              + Aggiungi Intervento
            </button>
          )}
          {interventions.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 60, color: T.textMuted }}>Nessun intervento registrato</div>
          ) : interventions.map((i: any) => (
            <div key={i.id} style={{ ...card, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: '0 0 6px', color: T.text, fontSize: 16, fontWeight: 700 }}>{i.intervention_name}</h3>
                  {i.intervention_subtype && (
                    <span style={{ backgroundColor: T.primaryLight, color: T.primary, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{i.intervention_subtype}</span>
                  )}
                </div>
                {canDelete && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => navigate('/patients/' + id + '/interventions/' + i.id + '/edit')} style={{ ...btn('ghost', 'sm'), padding: '4px 10px' }}>✏️</button>
                    <button onClick={() => deleteIntervention(i.id)} style={{ background: T.dangerLight, border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', color: T.danger, fontSize: 12 }}>🗑</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  ['Categoria', i.category],
                  ['Anestesia', i.anesthesia_type],
                  ['Protocollo', i.pain_protocol?.replace(/_/g, ' ')],
                  ['Chirurgo', i.surgeon || '—'],
                  ['Anestesista', i.anesthesiologist_name || '—'],
                  ['Fine intervento', i.intervention_end_time ? format(parseISO(i.intervention_end_time), 'dd/MM/yyyy HH:mm') : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ backgroundColor: T.bg, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
              {i.postop_drugs && (
                <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: T.accentLight, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8 }}>🩹 Terapia Post-Op</div>
                  {renderPostopDrugs(i.postop_drugs)}
                </div>
              )}
            </div>
          ))}
          <OpioidDischargePlan patientId={id!} profile={profile} />
        </div>
      )}

      {/* CPSP Tab */}
      {tab === 'cpsp' && <CPSPTab patientId={id!} profile={profile} patient={patient} />}

      {/* Audit Tab (solo admin) */}
      {tab === 'audit' && profile?.role === 'admin' && <AuditTab patientId={id!} />}
    </div>
  );
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function NotificationsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [notifications, setNotifications] = useState<any[]>([]);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase.from('notifications')
      .select('*, patients(first_name, last_name)')
      .eq('recipient_id', profile?.id)
      .order('created_at', { ascending: false }).limit(100);
    setNotifications(data || []);
  }, [profile?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', profile?.id).eq('is_read', false);
    setNotifications(n => n.map(x => ({ ...x, is_read: true })));
  };

  const deleteOne = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(n => n.filter(x => x.id !== id));
  };

  const deleteAll = async () => {
    if (!window.confirm('Eliminare tutte le notifiche? L\'operazione è irreversibile.')) return;
    await supabase.from('notifications').delete().eq('recipient_id', profile?.id);
    setNotifications([]);
  };

  const unread = notifications.filter(n => !n.is_read).length;
  const pColor: Record<string, string> = { critical: T.danger, high: T.warning, normal: T.primary };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Notifiche</h1>
          {unread > 0 && <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{unread} non lette</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unread > 0 && <button onClick={markAllRead} style={btn('ghost', 'sm')}>✓ Segna tutte lette</button>}
          {notifications.length > 0 && <button onClick={deleteAll} style={btn('danger', 'sm')}>🗑 Elimina tutte</button>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 60, color: T.textMuted }}>Nessuna notifica</div>
        ) : notifications.map((n: any) => (
          <div key={n.id} onClick={() => { if (!n.is_read) markRead(n.id); if (n.patient_id) navigate('/patients/' + n.patient_id); }}
            style={{ ...card, padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${pColor[n.priority] || T.primary}`,
              backgroundColor: n.is_read ? T.card : T.primaryLight, opacity: n.is_read ? 0.8 : 1,
              display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 26, flexShrink: 0 }}>{n.type === 'nrs_alert' ? '🔴' : '⚠️'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: n.is_read ? 500 : 700, color: T.text, fontSize: 14 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{n.body}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: T.textLight }}>{formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: it })}</div>
              {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pColor[n.priority] || T.primary }} />}
              <button onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                style={{ background: T.dangerLight, border: 'none', color: T.danger, width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PATIENT FORM
// ============================================================
function PatientFormPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = window.innerWidth < 768;
  const isEdit = !!id && id !== 'new';
  const patientId = isEdit ? id : null;

  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '', fiscal_code: '',
    gender: 'M', admission_number: '', ward: '', bed: '',
    admission_date: new Date().toISOString().split('T')[0],
    allergies: '', weight_kg: '', height_cm: '', asa_class: '', notes: '',
    birth_place: '', birth_province: '',
    patient_status: 'ricoverato',
  });
  const [saving, setSaving] = useState(false);
  const [wards, setWards] = useState<{ id: string; name: string; code: string }[]>([]);

  useEffect(() => {
    supabase.from('wards').select('id, name, code').eq('is_active', true).order('sort_order')
      .then(({ data }) => setWards(data || []));
  }, []);

  const loadPatient = useCallback(async () => {
    const { data } = await supabase.from('patients').select('*').eq('id', patientId).single();
    if (data) setForm({
      first_name: data.first_name || '', last_name: data.last_name || '',
      date_of_birth: data.date_of_birth, fiscal_code: data.fiscal_code || '',
      gender: data.gender || 'M', admission_number: data.admission_number,
      ward: data.ward, bed: data.bed || '',
      admission_date: data.admission_date, allergies: data.allergies || '',
      weight_kg: data.weight_kg?.toString() || '', height_cm: data.height_cm?.toString() || '',
      asa_class: data.asa_class?.toString() || '', notes: data.notes || '',
      birth_place: data.birth_place || '', birth_province: data.birth_province || '',
      patient_status: data.patient_status || 'ricoverato',
    });
  }, [patientId]);

  useEffect(() => { if (patientId) loadPatient(); }, [patientId, loadPatient]);

  const handleChange = useCallback((key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  const handleSave = async () => {
    const admissionRequired = form.patient_status === 'ricoverato';
    if (!form.first_name || !form.last_name || !form.ward ||
        (admissionRequired && !form.admission_number)) {
      alert('Compila i campi obbligatori'); return;
    }
    setSaving(true);
    const tenantId = localStorage.getItem('tenant_id') ?? '00000000-0000-0000-0000-000000000001';
    const payload: any = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth, fiscal_code: form.fiscal_code || null,
      gender: form.gender, admission_number: form.admission_number || null,
      ward: form.ward, bed: form.bed || null, admission_date: form.admission_date,
      allergies: form.allergies || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      asa_class: form.asa_class ? parseInt(form.asa_class) : null,
      notes: form.notes || null, created_by: profile?.id,
      patient_status: form.patient_status,
      is_active: form.patient_status !== 'dimesso',
      tenant_id: tenantId,
    };
    if (patientId) {
      const { error } = await supabase.from('patients').update(payload).eq('id', patientId);
      if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
      navigate('/patients/' + patientId);
    } else {
      console.log('INSERT PATIENT tenant_id:', tenantId);
      const { data, error } = await supabase.from('patients').insert(payload).select().single();
      if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
      navigate('/patients/' + data?.id);
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, color: T.text, fontWeight: 800 }}>{patientId ? 'Modifica Paziente' : 'Nuovo Paziente'}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={btn('ghost')}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={btn('primary')}>
            {saving ? 'Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <Section title="👤 Anagrafica">
          {([['Nome *', 'first_name'], ['Cognome *', 'last_name'], ['Codice Fiscale', 'fiscal_code']] as [string,string][]).map(([label, key]) => (
            <Field key={key} label={label}>
              <input value={(form as any)[key]} onChange={e => handleChange(key, e.target.value)} style={inp} />
            </Field>
          ))}
          <Field label="Data di nascita *">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={e => handleChange('date_of_birth', e.target.value)}
              style={inp}
            />
          </Field>
          <Field label="Sesso">
            <div style={{ display: 'flex', gap: 8 }}>
              {['M', 'F', 'altro'].map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, gender: g }))} style={chip(form.gender === g)}>
                  {g === 'M' ? '♂ M' : g === 'F' ? '♀ F' : '⚧ Altro'}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="🏥 Ricovero">
            {([[form.patient_status === 'ricoverato' ? 'N° Ricovero *' : 'N° Ricovero (opzionale)', 'admission_number'], ['Letto', 'bed']] as [string,string][]).map(([label, key]) => (
              <Field key={key} label={label}>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
              </Field>
            ))}
            <Field label="Data ricovero">
              <input type="date" value={form.admission_date} onChange={e => setForm(f => ({ ...f, admission_date: e.target.value }))} style={inp} />
            </Field>
            <Field label="Reparto *">
              <select value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))} style={inp}>
                <option value="">— Seleziona reparto —</option>
                {wards.map(w => <option key={w.id} value={w.name}>{w.name}{w.code ? ` (${w.code})` : ''}</option>)}
                {form.ward && !wards.find(w => w.name === form.ward) && (
                  <option value={form.ward}>{form.ward}</option>
                )}
              </select>
            </Field>
            <Field label="Stato paziente">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {([['pre_ricovero', '🔵 Pre-ricovero'], ['ricoverato', '🟡 Ricoverato'], ['dimesso', '✅ Dimesso'], ['followup_cpsp', '🧠 Follow-up CPSP']] as [string, string][]).map(([v, l]) => {
                  const active = form.patient_status === v;
                  const color = PATIENT_STATUS_COLORS[v];
                  return (
                    <button key={v} onClick={() => setForm(f => ({ ...f, patient_status: v }))}
                      style={{ padding: '6px 12px', borderRadius: 20, border: `2px solid ${active ? color : T.border}`,
                        backgroundColor: active ? PATIENT_STATUS_BG[v] : '#fff', color: active ? color : T.textMuted,
                        fontWeight: active ? 700 : 400, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section title="🩺 Dati Clinici">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {([['Peso (kg)', 'weight_kg'], ['Altezza (cm)', 'height_cm']] as [string,string][]).map(([label, key]) => (
                <Field key={key} label={label}>
                  <input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
                </Field>
              ))}
            </div>
            <Field label="Classe ASA">
              <div style={{ display: 'flex', gap: 6 }}>
                {['1','2','3','4','5'].map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, asa_class: f.asa_class === c ? '' : c }))} style={chip(form.asa_class === c)}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="⚠️ Allergie">
              <textarea value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
            </Field>
            <Field label="Note">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STATS
// ============================================================
function StatsPage() {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState<any>({ nrsTrend: [], wardCounts: [], categories: [] });
  const [period, setPeriod] = useState(7);

  const fetchStats = useCallback(async () => {
    const since = new Date(Date.now() - period * 86400000).toISOString();
    const [pRes, iRes, mRes] = await Promise.all([
      supabase.from('patients').select('ward').eq('is_active', true),
      supabase.from('interventions').select('category').gte('created_at', since),
      supabase.from('nrs_measurements').select('measured_at, nrs_value').gte('measured_at', since).order('measured_at'),
    ]);
    const wardMap: Record<string, number> = {};
    (pRes.data || []).forEach((p: any) => { wardMap[p.ward] = (wardMap[p.ward] || 0) + 1; });
    const catMap: Record<string, number> = {};
    (iRes.data || []).forEach((i: any) => { catMap[i.category] = (catMap[i.category] || 0) + 1; });
    const byDay: Record<string, number[]> = {};
    (mRes.data || []).forEach((m: any) => {
      const day = m.measured_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m.nrs_value);
    });
    const nrsTrend = Object.entries(byDay).map(([day, vals]) => ({
      day: day.slice(5), avg: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)),
      high: vals.filter(v => v >= 7).length, total: vals.length,
    }));
    setStats({
      wardCounts: Object.entries(wardMap).map(([ward, count]) => ({ ward, count })),
      categories: Object.entries(catMap).map(([cat, count]) => ({ cat, count })).sort((a: any, b: any) => b.count - a.count),
      nrsTrend,
    });
  }, [period]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const totalNRS = stats.nrsTrend.reduce((a: number, d: any) => a + d.total, 0);
  const highNRS = stats.nrsTrend.reduce((a: number, d: any) => a + d.high, 0);
  const maxWard = Math.max(...stats.wardCounts.map((w: any) => w.count), 1);
  const maxCat = Math.max(...stats.categories.map((c: any) => c.count), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Statistiche</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 14, 30].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={chip(period === p)}>{p}gg</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { icon: '🏥', label: 'Pazienti', value: stats.wardCounts.reduce((a: number, w: any) => a + w.count, 0), color: T.primary },
          { icon: '📊', label: `Rilevazioni (${period}gg)`, value: totalNRS, color: T.accent },
          { icon: '🔴', label: 'Alert NRS', value: `${totalNRS > 0 ? Math.round(highNRS / totalNRS * 100) : 0}%`, color: T.danger },
        ].map(k => (
          <div key={k.label} style={{ ...card, borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 24 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, margin: '6px 0 4px' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* NRS Chart */}
      {stats.nrsTrend.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', color: T.text, fontSize: 15, fontWeight: 700 }}>📊 Andamento NRS</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={stats.nrsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.bg} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} ticks={[0,5,10]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 13 }} />
              <ReferenceLine y={7} stroke={T.danger} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="avg" stroke={T.primary} strokeWidth={2.5} dot={{ r: 4 }} name="Media NRS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', color: T.text, fontSize: 15, fontWeight: 700 }}>🏥 Pazienti per Reparto</h3>
          {stats.wardCounts.length === 0 ? <p style={{ color: T.textMuted }}>Nessun dato</p> :
            stats.wardCounts.map((w: any) => (
              <div key={w.ward} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 13, color: T.textMuted, flexShrink: 0 }}>{w.ward}</div>
                <div style={{ flex: 1, height: 18, backgroundColor: T.bg, borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(w.count / maxWard) * 100}%`, backgroundColor: T.primary, borderRadius: 9, transition: 'width 0.5s' }} />
                </div>
                <div style={{ width: 20, fontWeight: 700, color: T.text, textAlign: 'right' as const }}>{w.count}</div>
              </div>
            ))}
        </div>
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', color: T.text, fontSize: 15, fontWeight: 700 }}>🔧 Tipi Intervento</h3>
          {stats.categories.length === 0 ? <p style={{ color: T.textMuted }}>Nessun dato</p> :
            stats.categories.map((c: any) => (
              <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 90, fontSize: 13, color: T.textMuted, flexShrink: 0 }}>{c.cat}</div>
                <div style={{ flex: 1, height: 18, backgroundColor: T.bg, borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c.count / maxCat) * 100}%`, backgroundColor: T.accent, borderRadius: 9, transition: 'width 0.5s' }} />
                </div>
                <div style={{ width: 20, fontWeight: 700, color: T.text, textAlign: 'right' as const }}>{c.count}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EXPORT
// ============================================================
function ExportPage() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState<string|null>(null);

  const toCSV = (data: any[]) => {
    if (!data?.length) return 'Nessun dato\n';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => {
      const v = String(row[h] ?? '').replace(/"/g, '""');
      return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  const exportData = async (table: string, label: string) => {
    setLoading(table);
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    const blob = new Blob(['\uFEFF' + toCSV(data || [])], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `APS_${label}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url); setLoading(null);
  };

  const tables = [
    { id: 'patients', label: 'Pazienti', icon: '👥', desc: 'Anagrafica e dati clinici' },
    { id: 'interventions', label: 'Interventi', icon: '🔧', desc: 'Procedure chirurgiche' },
    { id: 'nrs_measurements', label: 'Rilevazioni NRS', icon: '📊', desc: 'Misurazioni del dolore' },
    { id: 'notifications', label: 'Notifiche', icon: '🔔', desc: 'Alert e avvisi' },
    { id: 'profiles', label: 'Utenti', icon: '👤', desc: 'Profili del personale' },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 8px', fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Export CSV</h1>
      <p style={{ margin: '0 0 20px', color: T.textMuted, fontSize: 14 }}>File compatibili con Excel, Numbers, Google Sheets</p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        {tables.map(t => (
          <div key={t.id} style={{ ...card, textAlign: 'center' as const, padding: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>{t.desc}</div>
            <button onClick={() => exportData(t.id, t.label)} disabled={!!loading} style={{ ...btn('primary'), width: '100%', justifyContent: 'center' }}>
              {loading === t.id ? 'Esportando...' : '⬇ Scarica CSV'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: T.warningLight, borderRadius: 12, color: T.warning, fontSize: 13 }}>
        ⚠️ Dati sensibili — gestire nel rispetto del GDPR.
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS
// ============================================================
function SettingsPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const tenantCode = localStorage.getItem('tenant_code') || '';
  const tenantName = localStorage.getItem('tenant_name') || '';
  const tenantId = localStorage.getItem('tenant_id');

  // Change db password
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldDbPwd, setOldDbPwd] = useState('');
  const [newDbPwd, setNewDbPwd] = useState('');
  const [confirmDbPwd, setConfirmDbPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');

  // Gestione Reparti
  const [wards, setWards] = useState<any[]>([]);
  const [newWardName, setNewWardName] = useState('');
  const [newWardCode, setNewWardCode] = useState('');
  const [savingWard, setSavingWard] = useState(false);
  const [editingWardId, setEditingWardId] = useState<string|null>(null);
  const [editingWardName, setEditingWardName] = useState('');
  const [editingWardCode, setEditingWardCode] = useState('');

  const loadWards = useCallback(async () => {
    const { data } = await supabase.from('wards').select('*').order('sort_order');
    setWards(data || []);
  }, []);

  useEffect(() => { loadWards(); }, [loadWards]);

  const addWard = async () => {
    if (!newWardName.trim()) return;
    setSavingWard(true);
    const maxSort = wards.reduce((m, w) => Math.max(m, w.sort_order || 0), 0);
    const { error } = await supabase.from('wards').insert({
      name: newWardName.trim(), code: newWardCode.trim() || null,
      is_active: true, sort_order: maxSort + 1, tenant_id: tenantId,
    });
    if (error) { alert('Errore: ' + error.message); } else { setNewWardName(''); setNewWardCode(''); await loadWards(); }
    setSavingWard(false);
  };

  const saveEditWard = async () => {
    if (!editingWardName.trim() || !editingWardId) return;
    await supabase.from('wards').update({ name: editingWardName.trim(), code: editingWardCode.trim() || null }).eq('id', editingWardId);
    setEditingWardId(null); await loadWards();
  };

  const toggleWardActive = async (ward: any) => {
    if (ward.is_active) {
      const { count } = await supabase.from('patients').select('*', { count: 'exact', head: true }).eq('ward', ward.name).eq('is_active', true);
      if ((count ?? 0) > 0 && !window.confirm(`Ci sono ${count} pazienti attivi in "${ward.name}". Disattivare comunque?`)) return;
    }
    await supabase.from('wards').update({ is_active: !ward.is_active }).eq('id', ward.id);
    await loadWards();
  };

  const moveWard = async (ward: any, dir: -1|1) => {
    const idx = wards.findIndex(w => w.id === ward.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= wards.length) return;
    const other = wards[swapIdx];
    await Promise.all([
      supabase.from('wards').update({ sort_order: other.sort_order }).eq('id', ward.id),
      supabase.from('wards').update({ sort_order: ward.sort_order }).eq('id', other.id),
    ]);
    await loadWards();
  };

  // Delete modal: step 0=closed, 1=warning, 2=password, 3=confirm text
  const [deleteStep, setDeleteStep] = useState(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChangeDbPassword = async () => {
    if (!oldDbPwd || !newDbPwd) { setPwdMsg('Compila tutti i campi.'); return; }
    if (newDbPwd !== confirmDbPwd) { setPwdMsg('Le nuove password non coincidono.'); return; }
    setSavingPwd(true); setPwdMsg('');
    const res = await callTenantFnAuth({ action: 'change_password', code: tenantCode, oldPassword: oldDbPwd, newPassword: newDbPwd });
    setSavingPwd(false);
    if (res.error) { setPwdMsg('Errore: ' + res.error); return; }
    setPwdMsg('Password aggiornata!');
    setOldDbPwd(''); setNewDbPwd(''); setConfirmDbPwd('');
    setTimeout(() => { setShowChangePwd(false); setPwdMsg(''); }, 1500);
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'ELIMINA') { setDeleteError('Scrivi esattamente "ELIMINA" per confermare.'); return; }
    setDeleting(true); setDeleteError('');
    const res = await callTenantFnAuth({ action: 'delete', code: tenantCode, password: deletePassword, confirmText: deleteConfirmText });
    setDeleting(false);
    if (res.error) { setDeleteError(res.error); return; }
    localStorage.removeItem('tenant_code');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('tenant_name');
    await supabase.auth.signOut();
    window.location.reload();
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ margin: '0 0 24px', fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Impostazioni</h1>

      {/* Database info */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Database</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={lbl}>Nome database</div>
            <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{tenantName || '—'}</div>
          </div>
          <div>
            <div style={lbl}>Codice accesso</div>
            <div style={{ fontWeight: 800, color: T.primary, fontSize: 18, letterSpacing: 2 }}>{tenantCode}</div>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowChangePwd(true); setPwdMsg(''); }} style={btn('ghost', 'sm')}>
            🔑 Cambia password database
          </button>
        )}
      </div>

      {/* Change password modal */}
      {showChangePwd && (
        <Modal title="Cambia Password Database" onClose={() => setShowChangePwd(false)}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Password attuale</label>
            <input type="password" value={oldDbPwd} onChange={e => setOldDbPwd(e.target.value)} style={inp} placeholder="Password corrente del database" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Nuova password</label>
            <input type="password" value={newDbPwd} onChange={e => setNewDbPwd(e.target.value)} style={inp} placeholder="Minimo 6 caratteri" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Conferma nuova password</label>
            <input type="password" value={confirmDbPwd} onChange={e => setConfirmDbPwd(e.target.value)} style={inp} />
          </div>
          {pwdMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 500,
              backgroundColor: pwdMsg.startsWith('Errore') ? T.dangerLight : T.successLight,
              color: pwdMsg.startsWith('Errore') ? T.danger : T.success }}>
              {pwdMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowChangePwd(false)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button onClick={handleChangeDbPassword} disabled={savingPwd} style={{ ...btn('primary'), flex: 1, justifyContent: 'center' }}>
              {savingPwd ? 'Salvataggio...' : 'Aggiorna Password'}
            </button>
          </div>
        </Modal>
      )}

      {/* Gestione Reparti */}
      {isAdmin && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>🏥 Gestione Reparti</h2>

          {/* Lista reparti */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {wards.length === 0 && <div style={{ color: T.textMuted, fontSize: 13 }}>Nessun reparto configurato.</div>}
            {wards.map((w, idx) => (
              <div key={w.id} style={{ borderRadius: 10, border: `1.5px solid ${T.border}`, overflow: 'hidden', opacity: w.is_active ? 1 : 0.6 }}>
                {/* View row */}
                {editingWardId !== w.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: w.is_active ? '#fff' : T.bg }}>
                    {/* Frecce riordino */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <button onClick={() => moveWard(w, -1)} disabled={idx === 0}
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? T.border : T.textMuted, fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▲</button>
                      <button onClick={() => moveWard(w, 1)} disabled={idx === wards.length - 1}
                        style={{ background: 'none', border: 'none', cursor: idx === wards.length - 1 ? 'default' : 'pointer', color: idx === wards.length - 1 ? T.border : T.textMuted, fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▼</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{w.name}</span>
                      {w.code && <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8, backgroundColor: T.bg, borderRadius: 6, padding: '1px 6px' }}>{w.code}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: w.is_active ? T.success : T.textMuted, flexShrink: 0 }}>
                      {w.is_active ? '● Attivo' : '○ Inattivo'}
                    </span>
                    {/* Edit */}
                    <button onClick={() => { setEditingWardId(w.id); setEditingWardName(w.name); setEditingWardCode(w.code || ''); }}
                      style={{ background: T.primaryLight, border: 'none', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                    {/* Toggle attivo */}
                    <button onClick={() => toggleWardActive(w)}
                      style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${w.is_active ? T.warning : T.success}`,
                        background: 'transparent', color: w.is_active ? T.warning : T.success, fontWeight: 600, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                      {w.is_active ? '🗑 Disattiva' : '✓ Attiva'}
                    </button>
                  </div>
                ) : (
                  /* Edit inline */
                  <div style={{ display: 'flex', gap: 8, padding: '10px 12px', backgroundColor: T.primaryLight, flexWrap: 'wrap' as const }}>
                    <input value={editingWardName} onChange={e => setEditingWardName(e.target.value)}
                      placeholder="Nome reparto *" style={{ ...inp, flex: 2, minWidth: 120 }} autoFocus />
                    <input value={editingWardCode} onChange={e => setEditingWardCode(e.target.value)}
                      placeholder="Codice" style={{ ...inp, flex: 1, minWidth: 80 }} />
                    <button onClick={saveEditWard} disabled={!editingWardName.trim()} style={btn('primary', 'sm')}>💾 Salva</button>
                    <button onClick={() => setEditingWardId(null)} style={btn('ghost', 'sm')}>Annulla</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Aggiungi nuovo reparto */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>➕ Aggiungi reparto</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <input value={newWardName} onChange={e => setNewWardName(e.target.value)}
                placeholder="Nome reparto *" style={{ ...inp, flex: 2, minWidth: 140 }}
                onKeyDown={e => e.key === 'Enter' && addWard()} />
              <input value={newWardCode} onChange={e => setNewWardCode(e.target.value)}
                placeholder="Codice (es. ORT)" style={{ ...inp, flex: 1, minWidth: 90 }}
                onKeyDown={e => e.key === 'Enter' && addWard()} />
              <button onClick={addWard} disabled={savingWard || !newWardName.trim()} style={btn('primary', 'sm')}>
                {savingWard ? '...' : '➕ Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger zone */}
      {isAdmin && (
        <div style={{ ...card, border: `2px solid ${T.danger}`, marginTop: 8 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: T.danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>⚠️ Zona Pericolosa</h2>
          <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 16 }}>
            Le azioni in questa sezione sono irreversibili e possono causare perdita permanente di dati.
          </p>
          <button onClick={() => setDeleteStep(1)} style={{ ...btn('danger', 'sm') }}>
            🗑 Elimina Database
          </button>
        </div>
      )}

      {/* Delete modal */}
      {deleteStep > 0 && (
        <Modal title="🗑 Elimina Database" onClose={() => { setDeleteStep(0); setDeletePassword(''); setDeleteConfirmText(''); setDeleteError(''); }}>

          {/* Step 1: warning */}
          {deleteStep === 1 && (
            <div>
              <div style={{ backgroundColor: T.dangerLight, border: `1.5px solid ${T.danger}`, borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
                <div style={{ fontWeight: 800, color: T.danger, fontSize: 15, marginBottom: 8 }}>Questa azione è IRREVERSIBILE</div>
                <p style={{ color: T.danger, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Verranno eliminati <strong>definitivamente</strong> tutti i:
                </p>
                <ul style={{ color: T.danger, fontSize: 13, marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Pazienti e i loro dati</li>
                  <li>Interventi</li>
                  <li>Rilevazioni NRS</li>
                  <li>Registrazioni oppioidi</li>
                  <li>Utenti del database</li>
                  <li>Il database stesso</li>
                </ul>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setDeleteStep(0); }} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
                <button onClick={() => setDeleteStep(2)} style={{ ...btn('danger'), flex: 1, justifyContent: 'center' }}>Continua →</button>
              </div>
            </div>
          )}

          {/* Step 2: password */}
          {deleteStep === 2 && (
            <div>
              <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 16 }}>
                Inserisci la <strong>password del database</strong> per verificare la tua identità.
              </p>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Password database</label>
                <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
                  style={inp} placeholder="Password di accesso al database" autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteStep(1)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>← Indietro</button>
                <button onClick={() => { if (!deletePassword) return; setDeleteStep(3); }} style={{ ...btn('danger'), flex: 1, justifyContent: 'center' }}>Continua →</button>
              </div>
            </div>
          )}

          {/* Step 3: confirm text */}
          {deleteStep === 3 && (
            <div>
              <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 16 }}>
                Per confermare, scrivi <strong style={{ color: T.danger }}>ELIMINA</strong> nel campo sottostante.
              </p>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Conferma eliminazione</label>
                <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                  style={{ ...inp, borderColor: deleteConfirmText === 'ELIMINA' ? T.danger : T.border }} placeholder="Scrivi: ELIMINA" autoFocus />
              </div>
              {deleteError && (
                <div style={{ backgroundColor: T.dangerLight, color: T.danger, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
                  ⚠️ {deleteError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteStep(2)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>← Indietro</button>
                <button onClick={handleDelete} disabled={deleting || deleteConfirmText !== 'ELIMINA'}
                  style={{ ...btn('danger'), flex: 1, justifyContent: 'center', opacity: deleteConfirmText !== 'ELIMINA' ? 0.5 : 1 }}>
                  {deleting ? 'Eliminazione...' : '🗑 Elimina definitivamente'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: T.text, fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: T.bg, border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// USERS
// ============================================================
function UsersPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', department: '', badgeNumber: '', phone: '' });
  const [form, setForm] = useState({ email: '', password: '', role: 'infermiere', firstName: '', lastName: '', department: '', badgeNumber: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const FUNCTION_URL = 'https://oigokazmocdfufjxxyji.supabase.co/functions/v1/manage-users';

  const callFn = async (body: any) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { alert('Sessione scaduta'); return {}; }
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ29rYXptb2NkZnVmanh4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDU2NjgsImV4cCI6MjA4NzgyMTY2OH0.e_c2CHXgsTbeMaF0m3dYtc_eMnoGTjOWuot-1BIqgYM' },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const updateProfile = async () => {
    setSaving(true);
    const res = await callFn({ action: 'update_profile', userId: editUser.id, firstName: editForm.firstName, lastName: editForm.lastName, email: editForm.email, department: editForm.department, badgeNumber: editForm.badgeNumber, phone: editForm.phone });
    setSaving(false);
    if (res.error) { alert('Errore: ' + res.error); return; }
    setEditUser(null);
    fetchUsers();
  };

  const createUser = async () => {
    if (!form.email || !form.password || !form.firstName || !form.lastName) { alert('Compila tutti i campi obbligatori'); return; }
    setSaving(true);
    const tenantId = localStorage.getItem('tenant_id');
    const res = await callFn({ action: 'create', email: form.email, password: form.password, role: form.role, firstName: form.firstName, lastName: form.lastName, department: form.department, badgeNumber: form.badgeNumber, phone: form.phone, tenantId });
    setSaving(false);
    if (res.error) { alert('Errore: ' + res.error); return; }
    setShowForm(false);
    setForm({ email: '', password: '', role: 'infermiere', firstName: '', lastName: '', department: '', badgeNumber: '', phone: '' });
    fetchUsers();
  };

  const fetchUsers = async () => {
    try {
      const tenantId = localStorage.getItem('tenant_id');
      const { data } = await supabase.from('profiles').select('*').or(`tenant_id.eq.${tenantId},tenant_id.is.null`).order('last_name');
      setUsers(data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchRequests = async () => {
    try {
      const res = await callFn({ action: 'list_requests' });
      setRequests(res.requests || []);
    } catch(e) { console.error(e); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); fetchRequests(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Gestione Utenti</h1>
        <button onClick={() => setShowForm(true)} style={btn('primary')}>+ Nuovo Utente</button>
      </div>

      {showForm && (
        <Modal title="Nuovo Utente" onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([['Nome *', 'firstName'], ['Cognome *', 'lastName'], ['Email *', 'email'], ['Password *', 'password'], ['Reparto', 'department'], ['Badge', 'badgeNumber'], ['Telefono', 'phone']] as [string,string][]).map(([label, key]) => (
              <div key={key} style={{ gridColumn: ['email','password'].includes(key) ? '1 / -1' : 'auto' }}>
                <label style={lbl}>{label}</label>
                <input type={key === 'password' ? 'password' : 'text'} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Ruolo</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['admin','medico','infermiere','paziente'].map(r => (
                  <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))} style={chip(form.role === r, roleColor[r] || T.primary)}>{r}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowForm(false)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button onClick={createUser} disabled={saving} style={{ ...btn('primary'), flex: 1, justifyContent: 'center' }}>
              {saving ? 'Creazione...' : 'Crea Utente'}
            </button>
          </div>
        </Modal>
      )}

      {editUser && (
        <Modal title={`Modifica: ${editUser.first_name} ${editUser.last_name}`} onClose={() => setEditUser(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([['Nome', 'firstName'], ['Cognome', 'lastName'], ['Email', 'email'], ['Reparto', 'department'], ['Badge', 'badgeNumber'], ['Telefono', 'phone']] as [string, string][]).map(([label, key]) => (
              <div key={key} style={{ gridColumn: key === 'email' ? '1 / -1' : 'auto' }}>
                <label style={lbl}>{label}</label>
                <input type="text" value={(editForm as any)[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setEditUser(null)} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button onClick={updateProfile} disabled={saving} style={{ ...btn('primary'), flex: 1, justifyContent: 'center' }}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </Modal>
      )}

      {resetUser && (
        <Modal title="Reset Password" onClose={() => { setResetUser(null); setNewPassword(''); }}>
          <p style={{ color: T.textMuted, marginBottom: 16 }}>{resetUser.first_name} {resetUser.last_name}</p>
          <label style={lbl}>Nuova Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimo 6 caratteri" style={{ ...inp, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setResetUser(null); setNewPassword(''); }} style={{ ...btn('ghost'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button onClick={async () => {
              if (!newPassword || newPassword.length < 6) { alert('Password minimo 6 caratteri'); return; }
              setSaving(true);
              const res = await callFn({ action: 'reset_password', userId: resetUser.id, password: newPassword });
              setSaving(false);
              if (res.error) { alert('Errore: ' + res.error); return; }
              setResetUser(null); setNewPassword(''); alert('Password aggiornata!');
            }} disabled={saving} style={{ background: T.danger, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, flex: 1 }}>
              {saving ? '...' : 'Aggiorna'}
            </button>
          </div>
        </Modal>
      )}

      {requests.length > 0 && (
        <div style={{ ...card, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', color: T.warning, fontSize: 15, fontWeight: 700 }}>⏳ Richieste in attesa ({requests.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, backgroundColor: T.warningLight, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{r.last_name || r.lastName} {r.first_name || r.firstName}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{r.email}{r.department ? ` · ${r.department}` : ''}</div>
                  {r.message && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, fontStyle: 'italic' }}>{r.message}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => {
                    const res = await callFn({ action: 'approve_request', requestId: r.id });
                    if (res.error) { alert('Errore: ' + res.error); return; }
                    fetchRequests(); fetchUsers();
                  }} style={{ ...btn('accent', 'sm') }}>✅ Approva</button>
                  <button onClick={async () => {
                    const res = await callFn({ action: 'reject_request', requestId: r.id });
                    if (res.error) { alert('Errore: ' + res.error); return; }
                    fetchRequests();
                  }} style={{ ...btn('danger', 'sm') }}>❌ Rifiuta</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>Caricamento...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map((u: any) => (
            <div key={u.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: (roleColor[u.role] || T.primary) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: roleColor[u.role] || T.primary, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {u.first_name?.[0]}{u.last_name?.[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{u.last_name} {u.first_name}</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>{u.email} · {u.department || 'N/D'}</div>
              </div>
              <select value={u.role} onChange={async e => { const res = await callFn({ action: 'update_role', userId: u.id, role: e.target.value }); if (res.error) alert('Errore'); else fetchUsers(); }}
                style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${roleColor[u.role] || T.border}`, color: roleColor[u.role] || T.text, fontWeight: 700, cursor: 'pointer', outline: 'none', backgroundColor: (roleColor[u.role] || T.primary) + '15', fontSize: 12 }}>
                {['admin','medico','infermiere','paziente'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: u.is_active ? T.successLight : T.dangerLight, color: u.is_active ? T.success : T.danger }}>
                {u.is_active ? 'Attivo' : 'Disattivo'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditUser(u); setEditForm({ firstName: u.first_name || '', lastName: u.last_name || '', email: u.email || '', department: u.department || '', badgeNumber: u.badge_number || '', phone: u.phone || '' }); }} style={{ background: T.primaryLight, border: 'none', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: T.primary, fontSize: 12 }}>✏️</button>
                <button onClick={() => setResetUser(u)} style={{ background: T.warningLight, border: 'none', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: T.warning, fontSize: 12 }}>🔑</button>
                {u.id !== profile?.id && (
                  <button onClick={async () => { const res = await callFn({ action: 'toggle_active', userId: u.id }); if (res.error) alert('Errore'); else fetchUsers(); }}
                    style={{ background: u.is_active ? T.dangerLight : T.successLight, border: 'none', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: u.is_active ? T.danger : T.success, fontSize: 12 }}>
                    {u.is_active ? '🚫' : '✅'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ============================================================
// OPIOID EQUIVALENTS
// ============================================================
// Fattori MEO basati su: CDC 2022, NIH HEAL 2024, StatPearls 2024
const OPIOIDS: Record<string, { factor: number; routes: string[]; note: string }> = {
  'Morfina orale': { factor: 1, routes: ['orale'], note: 'Standard di riferimento' },
  'Morfina EV/SC': { factor: 3, routes: ['ev','sc','im'], note: '10mg EV = 30mg orale (ratio 1:3)' },
  'Oramorph': { factor: 1, routes: ['orale'], note: 'Morfina solfato orale' },
  'Ossicodone orale': { factor: 1.5, routes: ['orale'], note: 'CDC 2022: 1mg = 1.5mg MEO' },
  'Ossicodone EV': { factor: 3, routes: ['ev'], note: 'EV equivale a orale x2' },
  'Idromorfone orale': { factor: 4, routes: ['orale'], note: '7.5mg orale = 30mg morfina' },
  'Idromorfone EV': { factor: 20, routes: ['ev','sc'], note: '1.5mg EV = 30mg morfina orale' },
  'Fentanyl TTS': { factor: 2.4, routes: ['td'], note: 'Inserire dose in mcg/h. 25mcg/h ≈ 60mg MEO/die' },
  'Fentanyl EV': { factor: 100, routes: ['ev'], note: '0.1mg EV = 10mg morfina orale' },
  'Tramadolo orale': { factor: 0.2, routes: ['orale'], note: '100mg = 20mg MEO (NIH HEAL 2024)' },
  'Tramadolo EV': { factor: 0.2, routes: ['ev','im'], note: 'Stesso fattore orale' },
  'Buprenorfina SL': { factor: 30, routes: ['sl'], note: 'CDC 2022: 1mg SL = 30mg MEO' },
  'Buprenorfina TDS': { factor: 2.4, routes: ['td'], note: 'Inserire dose in mcg/h. 35mcg/h ≈ 84mg MEO/die' },
  'Tapentadolo': { factor: 0.4, routes: ['orale'], note: 'Palexia: 100mg = 40mg MEO' },
  'Codeina': { factor: 0.15, routes: ['orale'], note: '200mg codeina ≈ 30mg morfina' },
};

const ROUTES: Record<string, string> = {
  orale: '💊 Orale', ev: '💉 EV', sc: '🩸 SC', im: '💪 IM', td: '🩹 TD', sl: '👅 SL', epidurale: '🔬 Epidurale'
};

function toMEO(drug: string, dose: number): number {
  return dose * (OPIOIDS[drug]?.factor || 1);
}

const FREQUENCIES = ['1x/die', '2x/die', '3x/die', '4x/die', '6x/die', '8x/die'];
const FREQ_MAP: Record<string, number> = { '1x/die': 1, '2x/die': 2, '3x/die': 3, '4x/die': 4, '6x/die': 6, '8x/die': 8 };

// OME_CONVERSION and calcOME imported from ./utils/omeConversion

function OpioidDischargePlan({ patientId, profile }: { patientId: string; profile: any }) {
  const tenantId = localStorage.getItem('tenant_id');
  const [plans, setPlans] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opioidPlanned, setOpioidPlanned] = useState(false);
  const [drug, setDrug] = useState('Morfina');
  const [doseMg, setDoseMg] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [isMrLa, setIsMrLa] = useState(false);
  const [taperingInstructions, setTaperingInstructions] = useState('');
  const [patientEducated, setPatientEducated] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase.from('opioid_discharge_plans').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    setPlans(data || []);
  }, [patientId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const resetForm = () => {
    setOpioidPlanned(false); setDrug('Morfina'); setDoseMg(''); setDurationDays('7');
    setIsMrLa(false); setTaperingInstructions(''); setPatientEducated(false); setOverrideReason('');
  };

  const savePlan = async () => {
    const days = Number(durationDays);
    if (opioidPlanned && !doseMg) return alert('Inserisci la dose');
    if (opioidPlanned && days > 7 && !overrideReason) return alert('Indicare motivazione per durata > 7 giorni');
    setSaving(true);
    const { error } = await supabase.from('opioid_discharge_plans').insert({
      patient_id: patientId, tenant_id: tenantId, recorded_by: profile?.id,
      opioid_planned: opioidPlanned,
      drug_name: opioidPlanned ? drug : null,
      dose_mg: opioidPlanned && doseMg ? Number(doseMg) : null,
      duration_days: opioidPlanned ? days : null,
      is_mr_la: opioidPlanned ? isMrLa : null,
      tapering_instructions: taperingInstructions || null,
      patient_educated: patientEducated,
      override_reason: (opioidPlanned && days > 7) ? overrideReason : null,
    });
    if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
    resetForm(); setShowForm(false); await fetchPlans(); setSaving(false);
  };

  const deletePlan = async (id: string) => {
    if (!window.confirm('Eliminare questo piano?')) return;
    await supabase.from('opioid_discharge_plans').delete().eq('id', id);
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  const canEdit = ['medico', 'admin'].includes(profile?.role);
  const daysNum = Number(durationDays);

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>📋 Piano Dimissione Oppioidi</h3>
        {canEdit && <button onClick={() => { resetForm(); setShowForm(s => !s); }} style={btn('primary', 'sm')}>+ Nuovo Piano</button>}
      </div>

      {showForm && (
        <div style={{ backgroundColor: T.bg, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Oppioidi pianificati alla dimissione?</label>
            <button onClick={() => setOpioidPlanned(!opioidPlanned)}
              style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${opioidPlanned ? T.warning : T.border}`,
                backgroundColor: opioidPlanned ? T.warningLight : '#fff', color: opioidPlanned ? T.warning : T.textMuted,
                fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {opioidPlanned ? 'Sì' : 'No'}
            </button>
          </div>

          {opioidPlanned && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <label style={lbl}>Farmaco</label>
                  <select value={drug} onChange={e => setDrug(e.target.value)} style={{ ...inp }}>
                    {Object.keys(OPIOIDS).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Dose (mg)</label>
                  <input type="number" value={doseMg} onChange={e => setDoseMg(e.target.value)} placeholder="Es. 5" min={0} style={{ ...inp }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Durata (giorni)</label>
                  <input type="number" value={durationDays} onChange={e => setDurationDays(e.target.value)} placeholder="7" min={1} style={{ ...inp, borderColor: daysNum > 7 ? T.warning : undefined }} />
                </div>
              </div>

              {daysNum > 7 && (
                <div style={{ backgroundColor: T.warningLight, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.warning, fontWeight: 600 }}>
                  ⚠️ Durata &gt; 7 giorni: indicare motivazione clinica (campo obbligatorio)
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Formulazione MR/LA (a rilascio modificato/prolungato)?</label>
                <button onClick={() => setIsMrLa(!isMrLa)}
                  style={{ padding: '6px 16px', borderRadius: 20, border: `2px solid ${isMrLa ? T.danger : T.border}`,
                    backgroundColor: isMrLa ? T.dangerLight : '#fff', color: isMrLa ? T.danger : T.textMuted,
                    fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {isMrLa ? 'Sì' : 'No'}
                </button>
              </div>
              {isMrLa && (
                <div style={{ backgroundColor: T.dangerLight, borderRadius: 8, padding: '10px 14px', border: `1.5px solid ${T.danger}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.danger }}>❌ Non raccomandato per dolore acuto post-operatorio</div>
                  <div style={{ fontSize: 12, color: T.danger, marginTop: 4 }}>Preferire formulazioni IR (a rilascio immediato) per dolore acuto. Le formulazioni MR/LA aumentano il rischio di dipendenza e overdose.</div>
                </div>
              )}

              <div>
                <label style={lbl}>Istruzioni deprescrizione / piano di stop</label>
                <textarea value={taperingInstructions} onChange={e => setTaperingInstructions(e.target.value)}
                  placeholder="Es. ridurre di 25% ogni 3 giorni, stop dopo 7 giorni..." rows={3}
                  style={{ ...inp, resize: 'vertical' as const }} />
              </div>

              {daysNum > 7 && (
                <div>
                  <label style={{ ...lbl, color: T.danger }}>Motivazione override durata &gt; 7 giorni *</label>
                  <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                    placeholder="Indicare motivazione clinica (dolore cronico preesistente, chirurgia maggiore...)" rows={2}
                    style={{ ...inp, resize: 'vertical' as const, borderColor: !overrideReason ? T.danger : T.border }} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <label style={{ ...lbl, marginBottom: 0, flex: 1 }}>Paziente educato sul piano di stop?</label>
            <button onClick={() => setPatientEducated(!patientEducated)}
              style={{ padding: '6px 16px', borderRadius: 20, border: `2px solid ${patientEducated ? T.success : T.border}`,
                backgroundColor: patientEducated ? T.successLight : '#fff', color: patientEducated ? T.success : T.textMuted,
                fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {patientEducated ? 'Sì ✓' : 'No'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={savePlan} disabled={saving}
              style={{ ...btn('primary', 'sm'), flex: 1, justifyContent: 'center' }}>
              {saving ? 'Salvataggio...' : '💾 Salva Piano'}
            </button>
            <button onClick={() => { resetForm(); setShowForm(false); }} style={btn('ghost', 'sm')}>Annulla</button>
          </div>
        </div>
      )}

      {plans.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', color: T.textMuted, padding: 20, fontSize: 13 }}>Nessun piano di dimissione registrato</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map(p => (
            <div key={p.id} style={{ backgroundColor: T.bg, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                {p.opioid_planned ? (
                  <span style={{ backgroundColor: T.warningLight, color: T.warning, borderRadius: 14, padding: '3px 12px', fontWeight: 700, fontSize: 13 }}>
                    💊 {p.drug_name} {p.dose_mg}mg × {p.duration_days}gg
                  </span>
                ) : (
                  <span style={{ backgroundColor: T.successLight, color: T.success, borderRadius: 14, padding: '3px 12px', fontWeight: 700, fontSize: 13 }}>✓ Nessun oppioide alla dimissione</span>
                )}
                {p.is_mr_la && <span style={{ backgroundColor: T.dangerLight, color: T.danger, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>⚠️ MR/LA</span>}
                {p.duration_days > 7 && <span style={{ backgroundColor: T.warningLight, color: T.warning, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>Override {p.duration_days}gg</span>}
                {p.patient_educated && <span style={{ backgroundColor: T.successLight, color: T.success, borderRadius: 14, padding: '3px 10px', fontWeight: 600, fontSize: 12 }}>Educato ✓</span>}
                <span style={{ fontSize: 11, color: T.textLight, marginLeft: 'auto' }}>{format(parseISO(p.created_at), 'dd/MM/yy')}</span>
                {canEdit && <button onClick={() => deletePlan(p.id)} style={{ ...btn('ghost', 'sm'), padding: '3px 8px', color: T.danger }}>🗑</button>}
              </div>
              {p.tapering_instructions && <div style={{ fontSize: 12, color: T.textMuted }}>📉 {p.tapering_instructions}</div>}
              {p.override_reason && <div style={{ fontSize: 12, color: T.warning, marginTop: 2 }}>⚠️ Override: {p.override_reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpioidTracker({ patientId, interventionId, profile }: { patientId: string; interventionId?: string; profile: any }) {
  const tenantId = localStorage.getItem('tenant_id');
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [drug, setDrug] = useState('Morfina');
  const [doseMg, setDoseMg] = useState('');
  const [route, setRoute] = useState('orale');
  const [frequency, setFrequency] = useState('2x/die');
  const [isPrn, setIsPrn] = useState(false);
  const [prnDosesGiven, setPrnDosesGiven] = useState(2);
  const [notes, setNotes] = useState('');

  const fetchPrescriptions = useCallback(async () => {
    const { data } = await supabase.from('opioid_prescriptions')
      .select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    setPrescriptions(data || []);
  }, [patientId]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const drugDef = OME_CONVERSION[drug];
  const availableRoutes = drugDef ? Object.keys(drugDef.routes) : ['orale'];
  const isTd = drugDef?.isTd ?? false;
  const doseUnit = drugDef?.doseUnit ?? 'mg';
  const doseNum = parseFloat(doseMg) || 0;
  const { omePerDose, omeDaily } = doseNum > 0
    ? calcOME(drug, doseNum, route, FREQ_MAP[frequency] || 1, isPrn, prnDosesGiven)
    : { omePerDose: 0, omeDaily: 0 };

  const totalOmeDaily = prescriptions.reduce((sum, p) => sum + (p.ome_daily || 0), 0);
  const omeBadgeColor = totalOmeDaily > 120 ? T.danger : totalOmeDaily > 90 ? T.warning : T.primary;
  const omeBadgeBg = totalOmeDaily > 120 ? T.dangerLight : totalOmeDaily > 90 ? T.warningLight : T.primaryLight;

  const resetForm = () => {
    setDrug('Morfina'); setDoseMg(''); setRoute('orale');
    setFrequency('2x/die'); setIsPrn(false); setPrnDosesGiven(2); setNotes('');
  };

  const savePrescription = async () => {
    if (!doseMg) { alert('Inserisci la dose'); return; }
    setSaving(true);
    const { error } = await supabase.from('opioid_prescriptions').insert({
      patient_id: patientId,
      intervention_id: interventionId || null,
      tenant_id: tenantId,
      drug_name: drug,
      dose_mg: doseNum,
      route,
      is_prn: isPrn,
      frequency: isPrn ? null : frequency,
      prn_doses_given: isPrn ? prnDosesGiven : null,
      ome_per_dose: omePerDose,
      ome_daily: omeDaily,
      notes: notes || null,
      recorded_by: profile?.id,
    });
    if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
    resetForm(); setShowForm(false);
    await fetchPrescriptions();
    setSaving(false);
  };

  const deletePrescription = async (id: string) => {
    if (!window.confirm('Eliminare questa prescrizione?')) return;
    await supabase.from('opioid_prescriptions').delete().eq('id', id);
    setPrescriptions(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div style={{ marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: T.text, fontSize: 15, fontWeight: 700 }}>💊 Terapia Oppioide — OME</h3>
        <button onClick={() => { resetForm(); setShowForm(s => !s); }} style={btn('primary', 'sm')}>+ Prescrizione</button>
      </div>

      {/* Total OME banner */}
      {prescriptions.length > 0 && (
        <div style={{ backgroundColor: omeBadgeBg, borderRadius: 12, padding: '12px 16px', marginBottom: 12, borderLeft: `4px solid ${omeBadgeColor}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase' as const }}>📊 OME Totale Giornaliero</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: omeBadgeColor, marginTop: 2 }}>
            {totalOmeDaily.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 400 }}>mg/die</span>
          </div>
          {totalOmeDaily > 120 && <div style={{ fontSize: 12, color: T.danger, fontWeight: 700, marginTop: 2 }}>🔴 Dose molto elevata — revisione necessaria</div>}
          {totalOmeDaily > 90 && totalOmeDaily <= 120 && <div style={{ fontSize: 12, color: T.warning, fontWeight: 700, marginTop: 2 }}>⚠️ Dose elevata — monitorare attentamente</div>}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ backgroundColor: T.bg, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* Drug */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Farmaco</label>
              <select value={drug} onChange={e => {
                const d = e.target.value;
                const routes = Object.keys(OME_CONVERSION[d]?.routes || { orale: 1 });
                setDrug(d); setRoute(routes[0]);
              }} style={inp}>
                {Object.keys(OME_CONVERSION).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {drugDef?.note && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>ℹ️ {drugDef.note}</div>}
            </div>
            {/* Dose */}
            <div>
              <label style={lbl}>Dose ({doseUnit})</label>
              <input type="number" value={doseMg} onChange={e => setDoseMg(e.target.value)}
                placeholder={isTd ? 'Es. 25' : 'Es. 10'} min={0} style={inp} />
            </div>
            {/* Route */}
            <div>
              <label style={lbl}>Via</label>
              <select value={route} onChange={e => setRoute(e.target.value)} style={inp}>
                {availableRoutes.map(r => <option key={r} value={r}>{ROUTES[r] || r}</option>)}
              </select>
            </div>
            {/* Frequency / PRN — not shown for transdermal */}
            {!isTd && (
              <>
                <div>
                  <label style={lbl}>Modalità</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setIsPrn(false)} style={{ ...chip(!isPrn), flex: 1, justifyContent: 'center', fontSize: 12 }}>🕐 Schedulata</button>
                    <button onClick={() => setIsPrn(true)}  style={{ ...chip(isPrn),  flex: 1, justifyContent: 'center', fontSize: 12 }}>⚡ PRN</button>
                  </div>
                </div>
                <div>
                  {isPrn ? (
                    <>
                      <label style={lbl}>Dosi somministrate oggi</label>
                      <input type="number" value={prnDosesGiven} onChange={e => setPrnDosesGiven(Number(e.target.value))} min={0} max={20} style={inp} />
                    </>
                  ) : (
                    <>
                      <label style={lbl}>Frequenza</label>
                      <select value={frequency} onChange={e => setFrequency(e.target.value)} style={inp}>
                        {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </>
            )}
            {/* Notes */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Note</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note opzionali..." style={inp} />
            </div>
          </div>

          {/* Real-time OME preview */}
          {doseNum > 0 && (
            <div style={{ backgroundColor: T.primaryLight, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 24 }}>
                {!isTd && (
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' as const }}>OME per dose</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: T.primary }}>{omePerDose.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 400 }}>mg</span></div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' as const }}>OME giornaliero</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: omeDaily > 120 ? T.danger : omeDaily > 90 ? T.warning : T.primary }}>
                    {omeDaily.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 400 }}>mg/die</span>
                  </div>
                  {omeDaily > 120 && <div style={{ fontSize: 11, color: T.danger, marginTop: 2 }}>🔴 Dose molto elevata</div>}
                  {omeDaily > 90 && omeDaily <= 120 && <div style={{ fontSize: 11, color: T.warning, marginTop: 2 }}>⚠️ Dose elevata</div>}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ ...btn('ghost', 'sm'), flex: 1, justifyContent: 'center' }}>Annulla</button>
            <button onClick={savePrescription} disabled={saving} style={{ ...btn('primary', 'sm'), flex: 1, justifyContent: 'center' }}>
              {saving ? '...' : '➕ Aggiungi prescrizione'}
            </button>
          </div>
        </div>
      )}

      {/* Prescriptions list */}
      {prescriptions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 13 }}>Nessuna prescrizione attiva</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {prescriptions.map(p => {
            const pDef = OME_CONVERSION[p.drug_name];
            const pDoseUnit = pDef?.doseUnit ?? 'mg';
            const pIsTd = pDef?.isTd ?? false;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: T.bg, borderRadius: 10 }}>
                <div style={{ backgroundColor: T.primaryLight, borderRadius: 8, padding: '6px 10px', textAlign: 'center' as const, minWidth: 68 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.primary }}>{(p.ome_daily ?? 0).toFixed(1)}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>mg OME/die</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>
                    {p.drug_name} {p.dose_mg}{pDoseUnit} <span style={{ color: T.textMuted, fontWeight: 400 }}>({ROUTES[p.route] || p.route})</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>
                    {p.is_prn ? `PRN — ${p.prn_doses_given} dosi/die` : p.frequency}
                    {!pIsTd && p.ome_per_dose != null && ` • ${p.ome_per_dose.toFixed(1)} mg OME/dose`}
                  </div>
                  {p.notes && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{p.notes}</div>}
                </div>
                <button onClick={() => deletePrescription(p.id)}
                  style={{ background: T.dangerLight, border: 'none', padding: '4px 8px', borderRadius: 8, cursor: 'pointer', color: T.danger, fontSize: 12 }}>🗑</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// INTERVENTION FORM
// ============================================================
const CATEGORIES = ['ortopedico','addominale','toracico','urologico','ginecologico','vascolare','neurochirurgico','altro'];
const SUBTYPES: Record<string, string[]> = {
  ortopedico: ['Protesi totale anca','Protesi monocompartimentale ginocchio','Protesi totale ginocchio','Artroscopia ginocchio','Artroscopia spalla','Protesi spalla','Osteosintesi femore','Osteosintesi tibia','Osteosintesi radio/ulna','Artrodesi colonna','Discectomia lombare','Laminectomia','Amputazione','Altro ortopedico'],
  addominale: ['Appendicectomia','Colecistectomia','Laparotomia','Ernioplastica','Resezione colon','Altro addominale'],
  toracico: ['Lobectomia','Toracoscopia','VATS','Altro toracico'],
  urologico: ['Prostatectomia','Nefrectomia','Cistoscopia','TURP','Altro urologico'],
  ginecologico: ['Isterectomia','Miomectomia','Laparoscopia ginecologica','Altro ginecologico'],
  vascolare: ['Bypass','Endoarteriectomia','Aneurisma aorta','Altro vascolare'],
  neurochirurgico: ['Craniotomia','Derivazione','Microdiscectomia','Altro neurochirurgico'],
  altro: ['Altro'],
};

const ANESTHESIA_TYPES = ['Generale', 'Spinale', 'Epidurale', 'Combinata spinale-epidurale', 'Locoregionale', 'Sedazione', 'Locale'];
const BASE_ANALGESIC_OPTIONS = ['Paracetamolo', 'Ketorolac', 'Ketoprofene', 'Ibuprofene', 'Celecoxib', 'Desametasone', 'Magnesio solfato'];
const GABAPENTINOID_OPTIONS = ['Nessuno', 'Gabapentin', 'Pregabalin'];
const KETAMINE_POSTOP_DOSE_OPTIONS = ['0.05 mg/kg/h (IOR)', '0.1 mg/kg/h', '0.2 mg/kg/h', 'Personalizzata'];
const NRS_TARGET_OPTIONS = ['≤3 a riposo', '≤4 a riposo', 'Personalizzato'];

const LOCAL_ANESTHETICS = ['Bupivacaina', 'Bupivacaina iperbarica', 'Bupivacaina isobarica', 'Levobupivacaina', 'Ropivacaina', 'Lidocaina', 'Mepivacaina', 'Altro'];
const EPIDURALE_OPIOIDS = ['Nessuno', 'Morfina', 'Fentanil', 'Sufentanil'];
const GENERALE_HYPNOTICS = ['Propofol', 'Sevoflurano', 'Desflurano', 'Combinato'];
const GENERALE_INDUZIONE_OPIOIDS = ['Nessuno', 'Fentanil', 'Sufentanil', 'Remifentanil', 'Metadone'];
const NEUROMUSCULAR_BLOCKERS = ['Nessuno', 'Rocuronio', 'Vecuronio', 'Cisatracurio'];
const LOCO_ADJUVANTS = ['Desametasone', 'Adrenalina', 'Clonidina', 'Bicarbonato'];
const SEDAZIONE_DRUGS = ['Propofol TCI', 'Propofol mg/kg/h', 'Midazolam', 'Dexmedetomidina', 'Ketamina', 'Combinato'];
const SEDAZIONE_PLACEHOLDERS: Record<string, string> = {
  'Propofol TCI': 'es. 2.5 µg/ml (target)',
  'Propofol mg/kg/h': 'es. 4 mg/kg/h',
  'Midazolam': 'es. 2 mg',
  'Dexmedetomidina': 'es. 0.5 µg/kg/h',
  'Ketamina': 'es. 0.5 mg/kg/h',
  'Combinato': 'es. descrivi schema',
};
const LOCO_BLOCK_OPTIONS = ['PENG', 'ACB', 'Fascia Iliaca', 'LIA', 'ESPB', 'Paravertebrale (PVB)', 'Interscaleno', 'TAP', 'PECS', 'Epidurale toracica', 'Intercostale', 'Ileo-inguinale'];

const getNowStr = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
};

// ============================================================
// AUDIT LOG (Cronologia modifiche) — solo admin
// ============================================================
const AUDIT_TABLE_LABELS: Record<string, string> = {
  patients: '👤 Paziente',
  interventions: '🔧 Intervento',
  cpsp_assessments: '🧠 Valutazione CPSP',
  cpsp_followups: '🧠 Follow-up CPSP',
  nrs_measurements: '📊 Rilevazione NRS',
  wards: '🏥 Reparto',
  opioid_records: '💊 Somministrazione oppioidi',
  opioid_prescriptions: '💊 Prescrizione oppioidi',
  opioid_discharge_plans: '💊 Piano dimissione oppioidi',
  profiles: '✦ Utente',
  registration_requests: '✦ Richiesta di accesso',
};

const AUDIT_ACTION_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  INSERT: { label: 'Creazione', color: '#16A34A', bg: '#DCFCE7' },
  UPDATE: { label: 'Modifica', color: '#0369A1', bg: '#E0F2FE' },
  DELETE: { label: 'Eliminazione', color: T.danger, bg: T.dangerLight },
};

async function fetchAuditEntries(opts: { patientId?: string; tableName?: string; limit?: number }) {
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(opts.limit || 100);
  if (opts.patientId) query = query.eq('patient_id', opts.patientId);
  if (opts.tableName) query = query.eq('table_name', opts.tableName);
  const { data, error } = await query;
  if (error || !data) return [];
  const userIds = Array.from(new Set(data.map((r: any) => r.user_id).filter(Boolean)));
  let usersMap: Record<string, any> = {};
  if (userIds.length) {
    const { data: users } = await supabase.from('profiles').select('id, first_name, last_name, role').in('id', userIds);
    usersMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]));
  }
  return data.map((r: any) => ({ ...r, _user: usersMap[r.user_id] || null }));
}

/** Confronta old/new e restituisce solo i campi effettivamente cambiati. */
function diffAuditValues(oldV: any, newV: any): [string, any, any][] {
  const skip = ['id', 'created_at', 'updated_at'];
  if (!oldV && newV) return Object.entries(newV).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, undefined, v]);
  if (oldV && !newV) return Object.entries(oldV).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, v, undefined]);
  if (!oldV || !newV) return [];
  const keys = Array.from(new Set([...Object.keys(oldV), ...Object.keys(newV)]));
  const changed: [string, any, any][] = [];
  keys.forEach(k => {
    if (skip.includes(k)) return;
    const a = oldV[k], b = newV[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push([k, a, b]);
  });
  return changed;
}

function AuditEntryRow({ entry }: { entry: any }) {
  const [open, setOpen] = useState(false);
  const style = AUDIT_ACTION_STYLE[entry.action] || { label: entry.action, color: T.textMuted, bg: T.bg };
  const who = entry._user ? `${entry._user.first_name} ${entry._user.last_name}` : (entry.user_id ? 'Utente eliminato' : 'Sistema');
  const changed = entry.action === 'UPDATE' ? diffAuditValues(entry.old_values, entry.new_values)
    : entry.action === 'INSERT' ? diffAuditValues(null, entry.new_values)
    : diffAuditValues(entry.old_values, null);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}`, padding: '12px 0' }}>
      <div onClick={() => changed.length && setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: changed.length ? 'pointer' : 'default', flexWrap: 'wrap' as const }}>
        <span style={{ backgroundColor: style.bg, color: style.color, borderRadius: 8, padding: '3px 10px', fontWeight: 700, fontSize: 11 }}>{style.label}</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{AUDIT_TABLE_LABELS[entry.table_name] || entry.table_name}</span>
        <span style={{ fontSize: 13, color: T.textMuted }}>— {who}{entry._user?.role ? ` (${entry._user.role})` : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textLight }}>{formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true, locale: it })}</span>
        {changed.length > 0 && <span style={{ fontSize: 12, color: T.textLight }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && changed.length > 0 && (
        <div style={{ marginTop: 8, backgroundColor: T.bg, borderRadius: 10, padding: 10, fontSize: 12 }}>
          {changed.map(([k, a, b]) => (
            <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: `1px dashed ${T.border}` }}>
              <span style={{ color: T.textMuted, minWidth: 140, fontWeight: 600, flexShrink: 0 }}>{k}</span>
              {entry.action === 'UPDATE' ? (
                <span style={{ color: T.text, wordBreak: 'break-word' as const }}><span style={{ color: T.danger, textDecoration: 'line-through' }}>{String(a ?? '—')}</span> {'→'} <span style={{ color: '#16A34A' }}>{String(b ?? '—')}</span></span>
              ) : (
                <span style={{ color: T.text, wordBreak: 'break-word' as const }}>{String((a ?? b) ?? '—')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditTab({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditEntries({ patientId, limit: 200 }).then(e => { setEntries(e); setLoading(false); });
  }, [patientId]);

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, color: T.text, fontWeight: 700 }}>📜 Cronologia modifiche</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: T.textMuted }}>Visibile solo agli amministratori. Tutte le modifiche registrate per questo paziente.</p>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>Caricamento…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>Nessuna modifica registrata</div>
      ) : entries.map(e => <AuditEntryRow key={e.id} entry={e} />)}
    </div>
  );
}

function AuditLogPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAuditEntries({ tableName: tableFilter || undefined, limit: 300 });
    setEntries(data);
    setLoading(false);
  }, [tableFilter]);

  useEffect(() => { load(); }, [load]);

  if (profile?.role !== 'admin') return <Navigate to="/" />;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Cronologia modifiche</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textMuted }}>Chi ha creato, modificato o eliminato dati — visibile solo agli admin</p>
        </div>
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">Tutte le tabelle</option>
          {Object.entries(AUDIT_TABLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <div style={card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>Caricamento…</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: T.textMuted }}>Nessuna modifica registrata</div>
        ) : entries.map(e => <AuditEntryRow key={e.id} entry={e} />)}
      </div>
    </div>
  );
}

function InterventionFormPage() {

  const { id, interventionId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = window.innerWidth < 768;
  const isEdit = !!interventionId;

  const [form, setForm] = useState<{
    intervention_name: string; intervention_subtype: string; category: string;
    anesthesia_type: string; anesthesia_types: string[]; anesthesia_drugs: string;
    pain_protocol: string; pain_protocols: string[]; regional_blocks: string;
    regional_drugs: string; postop_drugs: string; surgeon: string;
    anesthesiologist_name: string; nrs_alert_threshold: string;
    intervention_end_time: string; notes: string;
  }>({
    intervention_name: '', intervention_subtype: '', category: 'ortopedico',
    anesthesia_type: '', anesthesia_types: [], anesthesia_drugs: '', pain_protocol: '',
    pain_protocols: [], regional_blocks: '', regional_drugs: '', postop_drugs: '',
    surgeon: '', anesthesiologist_name: '', nrs_alert_threshold: '6',
    intervention_end_time: getNowStr(), notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const firstDrug = Object.keys(OPIOIDS)[0];
  const [opioidPrescriptions, setOpioidPrescriptions] = useState<Array<{drug: string, dose: number, frequency: string, route: string}>>([]);
  const [newOpioid, setNewOpioid] = useState({ drug: firstDrug, dose: '', frequency: '2x/die', route: OPIOIDS[firstDrug].routes[0] });
  const [otherDrugs, setOtherDrugs] = useState('');

  // Structured anesthesia fields
  const [activeFormTab, setActiveFormTab] = useState<'anesthesia'|'pain'>('anesthesia');
  const [anesthesiaDetails, setAnesthesiaDetails] = useState<any>({
    types: [],
    spinale: { la_drug: '', la_drug_custom: '', la_concentration: '', la_volume: '', morfina_it: false, morfina_dose_ug: '', fentanil_it: false, fentanil_dose_ug: '', clonidina_it: false, clonidina_dose_ug: '', ketamina_it: false, ketamina_dose_mg: '', desametasone: false, desametasone_dose_mg: '' },
    epidurale: { la_drug: '', la_drug_custom: '', la_concentration: '', la_volume: '', opioide: 'Nessuno', opioide_dose: '', clonidina: false, clonidina_dose_ug: '', desametasone: false, desametasone_dose_mg: '', pca: false, pca_bolo_ml: '', pca_lockout_min: '' },
    generale: { ipnotico: '', ipnotico_dose: '', opioide_induzione: 'Nessuno', opioide_dose: '', ketamina_ev: false, ketamina_bolus_mgkg: '', ketamina_infusion_mgkgh: '', lidocaina_ev: false, lidocaina_bolus_mgkg: '', lidocaina_infusion_mgkgh: '', desametasone: false, desametasone_dose_mg: '', curarizzazione: 'Nessuno', curarizzazione_dose: '' },
    locoregionale: { blocks: [] },
    sedazione: { farmaci: [] as string[], dosi: {} as Record<string, string> },
    locale: { la_drug: '', la_drug_custom: '', la_concentration: '', la_volume: '', adrenalina: false },
  });
  const [localAnestheticDetails, setLocalAnestheticDetails] = useState<{drug:string,conc:string,vol:string}[]>([]);
  const [intraopOpioids, setIntraopOpioids] = useState<string[]>([]);
  const [ketamineIntraop, setKetamineIntraop] = useState(false);
  const [ketamineBolusMgkg, setKetamineBolusMgkg] = useState('');
  const [ketamineInfusionMgkgh, setKetamineInfusionMgkgh] = useState('');
  const [lidocaineIvIntraop, setLidocaineIvIntraop] = useState(false);
  const [lidocaineBolusMgkg, setLidocaineBolusMgkg] = useState('');
  const [lidocaineInfusionMgkgh, setLidocaineInfusionMgkgh] = useState('');
  const [dexamethasoneIv, setDexamethasoneIv] = useState(false);
  const [dexamethasoneDoseMg, setDexamethasoneDoseMg] = useState('');
  // Structured pain fields
  const [painProtocol, setPainProtocol] = useState('');
  const [baseAnalgesics, setBaseAnalgesics] = useState<string[]>([]);
  const [gabapentinoid, setGabapentinoid] = useState('');
  const [ketaminePostop, setKetaminePostop] = useState(false);
  const [ketaminePostopDose, setKetaminePostopDose] = useState('');
  const [ketaminePostopHours, setKetaminePostopHours] = useState('');
  const [ketaminePostopCustom, setKetaminePostopCustom] = useState('');
  const [lidocaineIvPostop, setLidocaineIvPostop] = useState(false);
  const [lidocainePostopHours, setLidocainePostopHours] = useState('');
  const [postopOpioid, setPostopOpioid] = useState('');
  const [postopOpioidRoute, setPostopOpioidRoute] = useState('');
  const [pcaUsed, setPcaUsed] = useState(false);
  const [pcaType, setPcaType] = useState('');
  const [duloxetinePeriop, setDuloxetinePeriop] = useState(false);
  const [clonidineUsed, setClonidineUsed] = useState(false);
  const [clonidineDoseMg, setClonidineDoseMg] = useState('');
  const [nrsTarget, setNrsTarget] = useState('');
  const [patientCsiScore, setPatientCsiScore] = useState<number|null>(null);
  const [baseAnalgesicsDetails, setBaseAnalgesicsDetails] = useState<Record<string, { dose: string, route: string, freq: string }>>({});
  const [gabapentinoidDose, setGabapentinoidDose] = useState('');
  const [gabapentinoidFreq, setGabapentinoidFreq] = useState('');
  const [lidocainePostopDoseMgkgh, setLidocainePostopDoseMgkgh] = useState('');
  const [opioidTherapyDuration, setOpioidTherapyDuration] = useState('');

  const setAnesField = (section: string, field: string, value: any) =>
    setAnesthesiaDetails((prev: any) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const toggleAnesType = (type: string) => {
    setAnesthesiaDetails((prev: any) => {
      const types = prev.types.includes(type) ? prev.types.filter((t: string) => t !== type) : [...prev.types, type];
      return { ...prev, types };
    });
  };

  const toggleLocoBlock = (block: string) =>
    setAnesthesiaDetails((prev: any) => {
      const blocks = prev.locoregionale.blocks.includes(block)
        ? prev.locoregionale.blocks.filter((b: string) => b !== block)
        : [...prev.locoregionale.blocks, block];
      return { ...prev, locoregionale: { ...prev.locoregionale, blocks } };
    });

  const setBlockField = (block: string, field: string, value: any) =>
    setAnesthesiaDetails((prev: any) => ({
      ...prev,
      locoregionale: { ...prev.locoregionale, [block]: { ...(prev.locoregionale[block] || {}), [field]: value } },
    }));

  const loadIntervention = useCallback(async () => {
    const { data } = await supabase.from('interventions').select('*').eq('id', interventionId).single();
    if (!data) return;
    setForm({
      intervention_name: data.intervention_name,
      intervention_subtype: data.intervention_subtype || '',
      category: data.category,
      anesthesia_type: data.anesthesia_type || '',
      anesthesia_types: data.anesthesia_type ? data.anesthesia_type.split(',') : [],
      anesthesia_drugs: data.anesthesia_drugs || '',
      pain_protocol: data.pain_protocol || '',
      pain_protocols: data.pain_protocol ? data.pain_protocol.split(',') : [],
      regional_blocks: data.regional_blocks || '',
      regional_drugs: data.regional_drugs || '',
      postop_drugs: data.postop_drugs || '',
      surgeon: data.surgeon || '',
      anesthesiologist_name: data.anesthesiologist_name || '',
      nrs_alert_threshold: data.nrs_alert_threshold?.toString() || '6',
      intervention_end_time: data.intervention_end_time ? data.intervention_end_time.slice(0,16) : getNowStr(),
      notes: data.notes || '',
    });
    // Load structured anesthesia fields (backward compat mapping)
    const legacyTypes = data.anesthesia_type ? data.anesthesia_type.split(',') : [];
    setPainProtocol(data.pain_protocol || '');
    // Load anesthesia_details JSON (new structured form)
    if (data.anesthesia_details) {
      try {
        const ad = JSON.parse(data.anesthesia_details);
        setAnesthesiaDetails((prev: any) => ({ ...prev, ...ad, locoregionale: { blocks: [], ...(ad.locoregionale || {}) } }));
      } catch {}
    } else if (legacyTypes.length) {
      setAnesthesiaDetails((prev: any) => ({ ...prev, types: legacyTypes }));
    }
    // Load new structured fields (available after DB migration)
    if (data.local_anesthetic_details) { try { setLocalAnestheticDetails(JSON.parse(data.local_anesthetic_details)); } catch {} }
    if (data.intraop_opioids) setIntraopOpioids(data.intraop_opioids.split(','));
    setKetamineIntraop(!!data.ketamine_intraop);
    setKetamineBolusMgkg(data.ketamine_bolus_mgkg?.toString() || '');
    setKetamineInfusionMgkgh(data.ketamine_infusion_mgkgh?.toString() || '');
    setLidocaineIvIntraop(!!data.lidocaine_iv_intraop);
    setLidocaineBolusMgkg(data.lidocaine_bolus_mgkg?.toString() || '');
    setLidocaineInfusionMgkgh(data.lidocaine_infusion_mgkgh?.toString() || '');
    setDexamethasoneIv(!!data.dexamethasone_iv);
    setDexamethasoneDoseMg(data.dexamethasone_dose_mg?.toString() || '');
    if (data.base_analgesics) setBaseAnalgesics(data.base_analgesics.split(','));
    const gabRaw = data.gabapentinoid || '';
    setGabapentinoid(gabRaw.toLowerCase().includes('pregabalin') ? 'Pregabalin' : gabRaw.toLowerCase().includes('gabapentin') ? 'Gabapentin' : gabRaw);
    setKetaminePostop(!!data.ketamine_postop);
    setKetaminePostopDose(data.ketamine_postop_dose || '');
    setKetaminePostopHours(data.ketamine_postop_hours?.toString() || '');
    setLidocaineIvPostop(!!data.lidocaine_iv_postop);
    setLidocainePostopHours(data.lidocaine_postop_hours?.toString() || '');
    setPostopOpioid(data.postop_opioid || '');
    setPostopOpioidRoute(data.postop_opioid_route || '');
    setPcaUsed(!!data.pca_used);
    setPcaType(data.pca_type || '');
    setDuloxetinePeriop(!!data.duloxetine_periop);
    setClonidineUsed(!!data.clonidine_used);
    setClonidineDoseMg(data.clonidine_dose_mg?.toString() || '');
    setNrsTarget(data.nrs_target || '');
    if (data.pain_therapy_details) {
      try {
        const ptd = JSON.parse(data.pain_therapy_details);
        if (ptd.base_analgesics_details) setBaseAnalgesicsDetails(ptd.base_analgesics_details);
        if (ptd.gabapentinoid_dose) setGabapentinoidDose(ptd.gabapentinoid_dose);
        if (ptd.gabapentinoid_freq) setGabapentinoidFreq(ptd.gabapentinoid_freq);
        if (ptd.lidocaine_postop_dose_mgkgh) setLidocainePostopDoseMgkgh(ptd.lidocaine_postop_dose_mgkgh);
        if (ptd.opioid_therapy_duration) setOpioidTherapyDuration(ptd.opioid_therapy_duration);
      } catch {}
    }
    const raw = data.postop_drugs || '';
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        setOpioidPrescriptions(parsed.opioids || []);
        setOtherDrugs(parsed.other || '');
      } catch { setOtherDrugs(raw); }
    } else {
      setOtherDrugs(raw);
    }
  }, [interventionId]);

  useEffect(() => { if (isEdit) loadIntervention(); }, [isEdit, loadIntervention]);
  useEffect(() => {
    if (!id) return;
    supabase.from('cpsp_assessments').select('csi_total').eq('patient_id', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.csi_total != null) setPatientCsiScore(data.csi_total); });
  }, [id]);

  const handleSave = async () => {
    if (!form.intervention_name.trim()) { alert('Inserisci il nome'); return; }
    setSaving(true);
    const payload: any = {
      intervention_name: form.intervention_name,
      intervention_subtype: form.intervention_subtype || null,
      category: form.category,
      anesthesia_type: anesthesiaDetails.types.length > 0 ? anesthesiaDetails.types.join(',') : null,
      anesthesia_drugs: anesthesiaDetails.generale.ipnotico || null,
      pain_protocol: painProtocol || null,
      regional_blocks: anesthesiaDetails.locoregionale.blocks.join(',') || null,
      regional_drugs: null,
      anesthesia_details: JSON.stringify(anesthesiaDetails),
      postop_drugs: (opioidPrescriptions.length > 0 || otherDrugs.trim()) ? JSON.stringify({ opioids: opioidPrescriptions, other: otherDrugs }) : null,
      surgeon: form.surgeon || null,
      anesthesiologist_name: form.anesthesiologist_name || null,
      nrs_alert_threshold: parseInt(form.nrs_alert_threshold) || 6,
      intervention_end_time: form.intervention_end_time ? new Date(form.intervention_end_time).toISOString() : null,
      notes: form.notes || null,
      // Nuovi campi strutturati — richiedono migrazione DB (salvati con || null per compatibilità)
      local_anesthetic_details: localAnestheticDetails.length > 0 ? JSON.stringify(localAnestheticDetails) : null,
      intraop_opioids: intraopOpioids.filter(o => o !== 'Nessuno').join(',') || null,
      ketamine_intraop: ketamineIntraop || null,
      ketamine_bolus_mgkg: ketamineBolusMgkg ? parseFloat(ketamineBolusMgkg) : null,
      ketamine_infusion_mgkgh: ketamineInfusionMgkgh ? parseFloat(ketamineInfusionMgkgh) : null,
      lidocaine_iv_intraop: lidocaineIvIntraop || null,
      lidocaine_bolus_mgkg: lidocaineBolusMgkg ? parseFloat(lidocaineBolusMgkg) : null,
      lidocaine_infusion_mgkgh: lidocaineInfusionMgkgh ? parseFloat(lidocaineInfusionMgkgh) : null,
      dexamethasone_iv: dexamethasoneIv || null,
      dexamethasone_dose_mg: dexamethasoneDoseMg ? parseFloat(dexamethasoneDoseMg) : null,
      base_analgesics: baseAnalgesics.length > 0 ? baseAnalgesics.join(',') : null,
      gabapentinoid: gabapentinoid || null,
      ketamine_postop: ketaminePostop || null,
      ketamine_postop_dose: ketaminePostopDose === 'Personalizzata' ? (ketaminePostopCustom || null) : (ketaminePostopDose || null),
      ketamine_postop_hours: ketaminePostopHours ? parseInt(ketaminePostopHours) : null,
      lidocaine_iv_postop: lidocaineIvPostop || null,
      lidocaine_postop_hours: lidocainePostopHours ? parseInt(lidocainePostopHours) : null,
      postop_opioid: postopOpioid || null,
      postop_opioid_route: postopOpioidRoute || null,
      pca_used: pcaUsed || null,
      pca_type: pcaType || null,
      duloxetine_periop: duloxetinePeriop || null,
      clonidine_used: clonidineUsed || null,
      clonidine_dose_mg: clonidineDoseMg ? parseFloat(clonidineDoseMg) : null,
      nrs_target: nrsTarget || null,
      pain_therapy_details: JSON.stringify({
        base_analgesics_details: Object.keys(baseAnalgesicsDetails).length > 0 ? baseAnalgesicsDetails : null,
        gabapentinoid_dose: gabapentinoidDose || null,
        gabapentinoid_freq: gabapentinoidFreq || null,
        lidocaine_postop_dose_mgkgh: lidocainePostopDoseMgkgh || null,
        opioid_therapy_duration: opioidTherapyDuration || null,
      }),
    };
    if (isEdit) {
      const { error } = await supabase.from('interventions').update(payload).eq('id', interventionId);
      if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('interventions').insert({ ...payload, patient_id: id, intervention_date: new Date().toISOString(), created_by: profile?.id });
      if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
    }
    setSaving(false);
    navigate('/patients/' + id);
  };

  const anesBox = { border: `2px solid ${T.primary}`, borderRadius: 10, padding: 14, backgroundColor: `${T.primary}08`, marginTop: 8 };
  const togStyle = (active: boolean) => ({ padding: '5px 16px', borderRadius: 20, border: `2px solid ${active ? T.success : T.border}`, backgroundColor: active ? T.successLight : '#fff', color: active ? T.success : T.textMuted, fontWeight: 700 as const, cursor: 'pointer' as const, fontSize: 12 });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, color: T.text, fontWeight: 800 }}>{isEdit ? 'Modifica Intervento' : 'Nuovo Intervento'}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={btn('ghost')}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={btn('primary')}>{saving ? 'Salvataggio...' : '💾 Salva'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="🔧 Intervento">
            <Field label="Categoria">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(c => <button key={c} onClick={() => set('category', c)} style={chip(form.category === c)}>{c}</button>)}
              </div>
            </Field>
            <Field label="Tipo Specifico">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(SUBTYPES[form.category] || []).map(s => (
                  <button key={s} onClick={() => { const v = form.intervention_subtype === s ? '' : s; set('intervention_subtype', v); if (v) set('intervention_name', v); }} style={chip(form.intervention_subtype === s, T.accent)}>{s}</button>
                ))}
              </div>
              <input value={form.intervention_subtype} onChange={e => set('intervention_subtype', e.target.value)} placeholder="Oppure scrivi..." style={inp} />
            </Field>
            <Field label="Nome Intervento *">
              <input value={form.intervention_name} onChange={e => set('intervention_name', e.target.value)} style={inp} />
            </Field>
            <Field label="Chirurgo">
              <input value={form.surgeon} onChange={e => set('surgeon', e.target.value)} style={inp} />
            </Field>
            <Field label="Anestesista">
              <input value={form.anesthesiologist_name} onChange={e => set('anesthesiologist_name', e.target.value)} style={inp} />
            </Field>
            <Field label="Fine Intervento">
              <input type="datetime-local" value={form.intervention_end_time} onChange={e => set('intervention_end_time', e.target.value)} style={inp} />
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>NRS programmati a +6h, +12h, +24h, +48h</div>
            </Field>
            <Field label="Soglia Alert NRS">
              <input type="number" min="0" max="10" value={form.nrs_alert_threshold} onChange={e => set('nrs_alert_threshold', e.target.value)} style={inp} />
            </Field>
          </Section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <button onClick={() => setActiveFormTab('anesthesia')} style={{ flex: 1, padding: '10px 0', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', backgroundColor: activeFormTab === 'anesthesia' ? T.primary : '#fff', color: activeFormTab === 'anesthesia' ? '#fff' : T.text, transition: 'background 0.15s' }}>💉 Anestesia</button>
            <button onClick={() => setActiveFormTab('pain')} style={{ flex: 1, padding: '10px 0', fontWeight: 700, fontSize: 13, border: 'none', borderLeft: `1px solid ${T.border}`, cursor: 'pointer', backgroundColor: activeFormTab === 'pain' ? T.accent : '#fff', color: activeFormTab === 'pain' ? '#fff' : T.text, transition: 'background 0.15s' }}>💊 Terapia Dolore</button>
          </div>

          {activeFormTab === 'anesthesia' && (
            <Section title="💉 Anestesia">
              <Field label="Tipo anestesia">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ANESTHESIA_TYPES.map(a => {
                    const sel = anesthesiaDetails.types.includes(a);
                    return <button key={a} onClick={() => toggleAnesType(a)} style={chip(sel)}>{a}</button>;
                  })}
                </div>
                {anesthesiaDetails.types.length === 0 && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, fontStyle: 'italic' }}>Seleziona uno o più tipi per visualizzare i campi specifici</div>
                )}
              </Field>

              {/* ── GENERALE ── */}
              {anesthesiaDetails.types.includes('Generale') && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Generale</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Ipnotico</label>
                      <select value={anesthesiaDetails.generale.ipnotico} onChange={e => setAnesField('generale','ipnotico',e.target.value)} style={inp}>
                        <option value="">—</option>
                        {GENERALE_HYPNOTICS.map(h => <option key={h}>{h}</option>)}
                      </select>
                    </div>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Dose / concentrazione</label>
                      <input value={anesthesiaDetails.generale.ipnotico_dose} onChange={e => setAnesField('generale','ipnotico_dose',e.target.value)} placeholder="Es. 2mg/kg o 2%" style={inp} />
                    </div>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Oppioide induzione</label>
                      <select value={anesthesiaDetails.generale.opioide_induzione} onChange={e => setAnesField('generale','opioide_induzione',e.target.value)} style={inp}>
                        {GENERALE_INDUZIONE_OPIOIDS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    {anesthesiaDetails.generale.opioide_induzione !== 'Nessuno' && (
                      <div><label style={{ ...lbl, fontSize: 11 }}>Dose (µg o mg)</label>
                        <input value={anesthesiaDetails.generale.opioide_dose} onChange={e => setAnesField('generale','opioide_dose',e.target.value)} placeholder="Es. 100µg" style={inp} />
                      </div>
                    )}
                    <div><label style={{ ...lbl, fontSize: 11 }}>Curarizzazione</label>
                      <select value={anesthesiaDetails.generale.curarizzazione} onChange={e => setAnesField('generale','curarizzazione',e.target.value)} style={inp}>
                        {NEUROMUSCULAR_BLOCKERS.map(n => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    {anesthesiaDetails.generale.curarizzazione !== 'Nessuno' && (
                      <div><label style={{ ...lbl, fontSize: 11 }}>Dose (mg/kg)</label>
                        <input type="number" step="0.1" value={anesthesiaDetails.generale.curarizzazione_dose} onChange={e => setAnesField('generale','curarizzazione_dose',e.target.value)} placeholder="Es. 0.6" style={inp} />
                      </div>
                    )}
                  </div>
                  {[
                    { key: 'ketamina_ev', label: 'Ketamina EV', bKey: 'ketamina_bolus_mgkg', bPlh: '0.3', bUnit: 'Bolo mg/kg', iKey: 'ketamina_infusion_mgkgh', iPlh: '0.1', iUnit: 'Inf. mg/kg/h' },
                    { key: 'lidocaina_ev', label: 'Lidocaina EV', bKey: 'lidocaina_bolus_mgkg', bPlh: '1.5', bUnit: 'Bolo mg/kg', iKey: 'lidocaina_infusion_mgkgh', iPlh: '2', iUnit: 'Inf. mg/kg/h' },
                  ].map(({ key, label, bKey, bPlh, bUnit, iKey, iPlh, iUnit }) => (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: anesthesiaDetails.generale[key] ? 6 : 0 }}>
                        <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>{label}</label>
                        <button onClick={() => setAnesField('generale', key, !anesthesiaDetails.generale[key])} style={togStyle(anesthesiaDetails.generale[key])}>{anesthesiaDetails.generale[key] ? 'Sì' : 'No'}</button>
                      </div>
                      {anesthesiaDetails.generale[key] && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div><label style={{ ...lbl, fontSize: 10 }}>{bUnit}</label><input type="number" step="0.05" value={anesthesiaDetails.generale[bKey]} onChange={e => setAnesField('generale',bKey,e.target.value)} placeholder={bPlh} style={{ ...inp, width: 100 }} /></div>
                          <div><label style={{ ...lbl, fontSize: 10 }}>{iUnit}</label><input type="number" step="0.05" value={anesthesiaDetails.generale[iKey]} onChange={e => setAnesField('generale',iKey,e.target.value)} placeholder={iPlh} style={{ ...inp, width: 110 }} /></div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: anesthesiaDetails.generale.desametasone ? 6 : 0 }}>
                    <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>Desametasone</label>
                    <button onClick={() => setAnesField('generale','desametasone',!anesthesiaDetails.generale.desametasone)} style={togStyle(anesthesiaDetails.generale.desametasone)}>{anesthesiaDetails.generale.desametasone ? 'Sì' : 'No'}</button>
                  </div>
                  {anesthesiaDetails.generale.desametasone && (
                    <div><label style={{ ...lbl, fontSize: 11 }}>Dose (mg)</label><input type="number" step="1" value={anesthesiaDetails.generale.desametasone_dose_mg} onChange={e => setAnesField('generale','desametasone_dose_mg',e.target.value)} placeholder="Es. 8" style={{ ...inp, width: 110 }} /></div>
                  )}
                </div>
              )}

              {/* ── SPINALE ── */}
              {(anesthesiaDetails.types.includes('Spinale') || anesthesiaDetails.types.includes('Combinata spinale-epidurale')) && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                    {anesthesiaDetails.types.includes('Combinata spinale-epidurale') ? 'Spinale (CSE)' : 'Spinale'}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...lbl, fontSize: 11 }}>Anestetico locale</label>
                    <select value={anesthesiaDetails.spinale.la_drug} onChange={e => setAnesField('spinale','la_drug',e.target.value)} style={inp}>
                      <option value="">—</option>
                      {LOCAL_ANESTHETICS.map(a => <option key={a}>{a}</option>)}
                    </select>
                    {anesthesiaDetails.spinale.la_drug === 'Altro' && (
                      <input value={anesthesiaDetails.spinale.la_drug_custom} onChange={e => setAnesField('spinale','la_drug_custom',e.target.value)} placeholder="Nome anestetico" style={{ ...inp, marginTop: 4 }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Concentrazione</label>
                        <input value={anesthesiaDetails.spinale.la_concentration} onChange={e => setAnesField('spinale','la_concentration',e.target.value)} placeholder="es. 0.5%" style={inp} />
                      </div>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Volume</label>
                        <input value={anesthesiaDetails.spinale.la_volume} onChange={e => setAnesField('spinale','la_volume',e.target.value)} placeholder="es. 20 ml" style={inp} />
                      </div>
                    </div>
                  </div>
                  {[
                    { key: 'morfina_it', dKey: 'morfina_dose_ug', label: 'Morfina intratecale', plh: '100-300 µg' },
                    { key: 'fentanil_it', dKey: 'fentanil_dose_ug', label: 'Fentanil intratecale', plh: '10-25 µg' },
                    { key: 'clonidina_it', dKey: 'clonidina_dose_ug', label: 'Clonidina intratecale', plh: 'µg' },
                    { key: 'ketamina_it', dKey: 'ketamina_dose_mg', label: 'Ketamina intratecale', plh: 'mg' },
                    { key: 'desametasone', dKey: 'desametasone_dose_mg', label: 'Desametasone', plh: 'mg' },
                  ].map(({ key, dKey, label, plh }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>{label}</label>
                      <button onClick={() => setAnesField('spinale', key, !anesthesiaDetails.spinale[key])} style={togStyle(anesthesiaDetails.spinale[key])}>{anesthesiaDetails.spinale[key] ? 'Sì' : 'No'}</button>
                      {anesthesiaDetails.spinale[key] && <input type="number" value={anesthesiaDetails.spinale[dKey]} onChange={e => setAnesField('spinale', dKey, e.target.value)} placeholder={plh} style={{ ...inp, width: 110 }} />}
                    </div>
                  ))}
                </div>
              )}

              {/* ── EPIDURALE ── */}
              {(anesthesiaDetails.types.includes('Epidurale') || anesthesiaDetails.types.includes('Combinata spinale-epidurale')) && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                    {anesthesiaDetails.types.includes('Combinata spinale-epidurale') ? 'Epidurale (CSE)' : 'Epidurale'}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...lbl, fontSize: 11 }}>Anestetico locale</label>
                    <select value={anesthesiaDetails.epidurale.la_drug} onChange={e => setAnesField('epidurale','la_drug',e.target.value)} style={inp}>
                      <option value="">—</option>
                      {LOCAL_ANESTHETICS.map(a => <option key={a}>{a}</option>)}
                    </select>
                    {anesthesiaDetails.epidurale.la_drug === 'Altro' && (
                      <input value={anesthesiaDetails.epidurale.la_drug_custom} onChange={e => setAnesField('epidurale','la_drug_custom',e.target.value)} placeholder="Nome anestetico" style={{ ...inp, marginTop: 4 }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Concentrazione</label>
                        <input value={anesthesiaDetails.epidurale.la_concentration} onChange={e => setAnesField('epidurale','la_concentration',e.target.value)} placeholder="es. 0.5%" style={inp} />
                      </div>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Volume</label>
                        <input value={anesthesiaDetails.epidurale.la_volume} onChange={e => setAnesField('epidurale','la_volume',e.target.value)} placeholder="es. 20 ml" style={inp} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Oppioide</label>
                      <select value={anesthesiaDetails.epidurale.opioide} onChange={e => setAnesField('epidurale','opioide',e.target.value)} style={inp}>
                        {EPIDURALE_OPIOIDS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    {anesthesiaDetails.epidurale.opioide !== 'Nessuno' && (
                      <div><label style={{ ...lbl, fontSize: 11 }}>Dose</label>
                        <input value={anesthesiaDetails.epidurale.opioide_dose} onChange={e => setAnesField('epidurale','opioide_dose',e.target.value)} placeholder="Es. 50µg" style={inp} />
                      </div>
                    )}
                  </div>
                  {[
                    { key: 'clonidina', dKey: 'clonidina_dose_ug', label: 'Clonidina', plh: 'µg' },
                    { key: 'desametasone', dKey: 'desametasone_dose_mg', label: 'Desametasone', plh: 'mg' },
                  ].map(({ key, dKey, label, plh }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>{label}</label>
                      <button onClick={() => setAnesField('epidurale', key, !anesthesiaDetails.epidurale[key])} style={togStyle(anesthesiaDetails.epidurale[key])}>{anesthesiaDetails.epidurale[key] ? 'Sì' : 'No'}</button>
                      {anesthesiaDetails.epidurale[key] && <input type="number" value={anesthesiaDetails.epidurale[dKey]} onChange={e => setAnesField('epidurale', dKey, e.target.value)} placeholder={plh} style={{ ...inp, width: 110 }} />}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: anesthesiaDetails.epidurale.pca ? 8 : 0 }}>
                    <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>PCA epidurale</label>
                    <button onClick={() => setAnesField('epidurale','pca',!anesthesiaDetails.epidurale.pca)} style={togStyle(anesthesiaDetails.epidurale.pca)}>{anesthesiaDetails.epidurale.pca ? 'Sì' : 'No'}</button>
                  </div>
                  {anesthesiaDetails.epidurale.pca && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div><label style={{ ...lbl, fontSize: 10 }}>Bolo (ml)</label><input type="number" step="0.5" value={anesthesiaDetails.epidurale.pca_bolo_ml} onChange={e => setAnesField('epidurale','pca_bolo_ml',e.target.value)} placeholder="5" style={{ ...inp, width: 90 }} /></div>
                      <div><label style={{ ...lbl, fontSize: 10 }}>Lockout (min)</label><input type="number" step="5" value={anesthesiaDetails.epidurale.pca_lockout_min} onChange={e => setAnesField('epidurale','pca_lockout_min',e.target.value)} placeholder="20" style={{ ...inp, width: 100 }} /></div>
                    </div>
                  )}
                </div>
              )}

              {/* ── LOCOREGIONALE ── */}
              {anesthesiaDetails.types.includes('Locoregionale') && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Locoregionale</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {LOCO_BLOCK_OPTIONS.map(b => {
                      const sel = anesthesiaDetails.locoregionale.blocks.includes(b);
                      return <button key={b} onClick={() => toggleLocoBlock(b)} style={chip(sel, T.success)}>{b}</button>;
                    })}
                  </div>
                  {anesthesiaDetails.locoregionale.blocks.map((block: string) => {
                    const bd = anesthesiaDetails.locoregionale[block] || {};
                    return (
                      <div key={block} style={{ border: `1.5px solid ${T.success}`, borderRadius: 8, padding: 10, backgroundColor: T.successLight + '44', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: T.success, marginBottom: 8 }}>{block}</div>
                        <div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ ...lbl, fontSize: 11 }}>Anestetico locale</label>
                            <select value={bd.drug || ''} onChange={e => setBlockField(block,'drug',e.target.value)} style={inp}>
                              <option value="">—</option>
                              {LOCAL_ANESTHETICS.map(a => <option key={a}>{a}</option>)}
                            </select>
                            {bd.drug === 'Altro' && (
                              <input value={bd.drug_custom || ''} onChange={e => setBlockField(block,'drug_custom',e.target.value)} placeholder="Nome anestetico" style={{ ...inp, marginTop: 4 }} />
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                              <div><label style={{ ...lbl, fontSize: 11 }}>Concentrazione</label>
                                <input value={bd.drug_concentration || ''} onChange={e => setBlockField(block,'drug_concentration',e.target.value)} placeholder="es. 0.5%" style={inp} />
                              </div>
                              <div><label style={{ ...lbl, fontSize: 11 }}>Volume</label>
                                <input value={bd.volume_ml || ''} onChange={e => setBlockField(block,'volume_ml',e.target.value)} placeholder="es. 20 ml" style={inp} />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label style={{ ...lbl, fontSize: 11 }}>Adiuvanti</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: (bd.adjuvants || []).length ? 8 : 0 }}>
                              {LOCO_ADJUVANTS.map(a => {
                                const sel = (bd.adjuvants || []).some((x: any) => x.adjuvant === a);
                                return (
                                  <button key={a} onClick={() => {
                                    const cur = bd.adjuvants || [];
                                    setBlockField(block, 'adjuvants', sel ? cur.filter((x: any) => x.adjuvant !== a) : [...cur, { adjuvant: a, dose: '' }]);
                                  }} style={chip(sel, T.warning)}>{a}</button>
                                );
                              })}
                            </div>
                            {(bd.adjuvants || []).map((adj: any) => (
                              <div key={adj.adjuvant} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <label style={{ ...lbl, marginBottom: 0, fontSize: 12, flex: 1 }}>{adj.adjuvant}</label>
                                <input value={adj.dose} onChange={e => setBlockField(block, 'adjuvants', (bd.adjuvants || []).map((x: any) => x.adjuvant === adj.adjuvant ? { ...x, dose: e.target.value } : x))} placeholder="Es. 4mg" style={{ ...inp, width: 120 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── SEDAZIONE ── */}
              {anesthesiaDetails.types.includes('Sedazione') && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Sedazione</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: (anesthesiaDetails.sedazione.farmaci || []).length ? 10 : 0 }}>
                    {SEDAZIONE_DRUGS.map(d => {
                      const sel = (anesthesiaDetails.sedazione.farmaci || []).includes(d);
                      return (
                        <button key={d} onClick={() => setAnesField('sedazione', 'farmaci', sel
                          ? (anesthesiaDetails.sedazione.farmaci || []).filter((f: string) => f !== d)
                          : [...(anesthesiaDetails.sedazione.farmaci || []), d]
                        )} style={chip(sel, T.primary)}>{d}</button>
                      );
                    })}
                  </div>
                  {(anesthesiaDetails.sedazione.farmaci || []).map((drug: string) => (
                    <div key={drug} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>{drug}</label>
                      <input
                        value={(anesthesiaDetails.sedazione.dosi || {})[drug] || ''}
                        onChange={e => setAnesField('sedazione', 'dosi', { ...(anesthesiaDetails.sedazione.dosi || {}), [drug]: e.target.value })}
                        placeholder={SEDAZIONE_PLACEHOLDERS[drug] || ''}
                        style={{ ...inp, width: 180 }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── LOCALE ── */}
              {anesthesiaDetails.types.includes('Locale') && (
                <div style={anesBox}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: T.primary, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Locale</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...lbl, fontSize: 11 }}>Anestetico locale</label>
                    <select value={anesthesiaDetails.locale.la_drug} onChange={e => setAnesField('locale','la_drug',e.target.value)} style={inp}>
                      <option value="">—</option>
                      {LOCAL_ANESTHETICS.map(a => <option key={a}>{a}</option>)}
                    </select>
                    {anesthesiaDetails.locale.la_drug === 'Altro' && (
                      <input value={anesthesiaDetails.locale.la_drug_custom} onChange={e => setAnesField('locale','la_drug_custom',e.target.value)} placeholder="Nome anestetico" style={{ ...inp, marginTop: 4 }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Concentrazione</label>
                        <input value={anesthesiaDetails.locale.la_concentration} onChange={e => setAnesField('locale','la_concentration',e.target.value)} placeholder="es. 0.5%" style={inp} />
                      </div>
                      <div><label style={{ ...lbl, fontSize: 11 }}>Volume</label>
                        <input value={anesthesiaDetails.locale.la_volume} onChange={e => setAnesField('locale','la_volume',e.target.value)} placeholder="es. 20 ml" style={inp} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ ...lbl, marginBottom: 0, flex: 1, fontSize: 12 }}>Adrenalina aggiunta</label>
                    <button onClick={() => setAnesField('locale','adrenalina',!anesthesiaDetails.locale.adrenalina)} style={togStyle(anesthesiaDetails.locale.adrenalina)}>{anesthesiaDetails.locale.adrenalina ? 'Sì' : 'No'}</button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {activeFormTab === 'pain' && (
            <Section title="💊 Terapia del Dolore">
              <Field label="Analgesici di base">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: baseAnalgesics.length ? 10 : 0 }}>
                  {BASE_ANALGESIC_OPTIONS.map(a => {
                    const sel = baseAnalgesics.includes(a);
                    return <button key={a} onClick={() => {
                      setBaseAnalgesics(prev => sel ? prev.filter(x => x !== a) : [...prev, a]);
                      if (sel) setBaseAnalgesicsDetails(prev => { const n = { ...prev }; delete n[a]; return n; });
                    }} style={chip(sel, T.success)}>{a}</button>;
                  })}
                </div>
                {baseAnalgesics.map(drug => {
                  const d = baseAnalgesicsDetails[drug] || { dose: '', route: '', freq: '' };
                  const setD = (field: string, val: string) => setBaseAnalgesicsDetails(prev => ({ ...prev, [drug]: { ...(prev[drug] || { dose: '', route: '', freq: '' }), [field]: val } }));
                  return (
                    <div key={drug} style={{ backgroundColor: T.successLight + '80', border: `1px solid ${T.success}44`, borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: T.success, marginBottom: 6 }}>{drug}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                        <div><label style={{ ...lbl, fontSize: 10 }}>Dosaggio</label>
                          <input value={d.dose} onChange={e => setD('dose', e.target.value)} placeholder="es. 1 g" style={inp} />
                        </div>
                        <div><label style={{ ...lbl, fontSize: 10 }}>Via</label>
                          <select value={d.route} onChange={e => setD('route', e.target.value)} style={inp}>
                            <option value="">—</option>
                            {['Orale', 'EV', 'IM', 'SC'].map(r => <option key={r}>{r}</option>)}
                          </select>
                        </div>
                        <div><label style={{ ...lbl, fontSize: 10 }}>Frequenza</label>
                          <input value={d.freq} onChange={e => setD('freq', e.target.value)} placeholder="es. x3/die" style={inp} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Field>

              <Field label="Gabapentinoidi">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: (gabapentinoid && gabapentinoid !== 'Nessuno') ? 8 : 0 }}>
                  {GABAPENTINOID_OPTIONS.map(g => (
                    <button key={g} onClick={() => { setGabapentinoid(gabapentinoid === g ? '' : g); setGabapentinoidDose(''); setGabapentinoidFreq(''); }} style={chip(gabapentinoid === g, '#7C3AED')}>{g}</button>
                  ))}
                </div>
                {gabapentinoid && gabapentinoid !== 'Nessuno' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Dosaggio</label>
                      <input value={gabapentinoidDose} onChange={e => setGabapentinoidDose(e.target.value)} placeholder="es. 75 mg" style={inp} />
                    </div>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Quantità giornaliera</label>
                      <input value={gabapentinoidFreq} onChange={e => setGabapentinoidFreq(e.target.value)} placeholder="es. x2/die" style={inp} />
                    </div>
                  </div>
                )}
              </Field>

              <Field label="Ketamina postoperatoria">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: ketaminePostop ? 10 : 0 }}>
                  <button onClick={() => setKetaminePostop(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${ketaminePostop ? T.success : T.border}`, backgroundColor: ketaminePostop ? T.successLight : '#fff', color: ketaminePostop ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{ketaminePostop ? 'Sì' : 'No'}</button>
                </div>
                {ketaminePostop && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {KETAMINE_POSTOP_DOSE_OPTIONS.map(d => (
                        <button key={d} onClick={() => setKetaminePostopDose(ketaminePostopDose === d ? '' : d)} style={chip(ketaminePostopDose === d)}>{d}</button>
                      ))}
                    </div>
                    {ketaminePostopDose === 'Personalizzata' && (
                      <input value={ketaminePostopCustom} onChange={e => setKetaminePostopCustom(e.target.value)} placeholder="Dose personalizzata..." style={inp} />
                    )}
                    <div><label style={{ ...lbl, fontSize: 11 }}>Durata (ore)</label><input type="number" value={ketaminePostopHours} onChange={e => setKetaminePostopHours(e.target.value)} placeholder="Es. 24" style={{ ...inp, width: 110 }} /></div>
                  </div>
                )}
              </Field>

              <Field label="Lidocaina EV postoperatoria">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: lidocaineIvPostop ? 10 : 0 }}>
                  <button onClick={() => setLidocaineIvPostop(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${lidocaineIvPostop ? T.success : T.border}`, backgroundColor: lidocaineIvPostop ? T.successLight : '#fff', color: lidocaineIvPostop ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{lidocaineIvPostop ? 'Sì' : 'No'}</button>
                </div>
                {lidocaineIvPostop && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Dosaggio</label>
                      <input value={lidocainePostopDoseMgkgh} onChange={e => setLidocainePostopDoseMgkgh(e.target.value)} placeholder="es. 1.5 mg/kg/h" style={inp} />
                    </div>
                    <div><label style={{ ...lbl, fontSize: 11 }}>Durata (ore)</label>
                      <input type="number" value={lidocainePostopHours} onChange={e => setLidocainePostopHours(e.target.value)} placeholder="Es. 24" style={inp} />
                    </div>
                  </div>
                )}
              </Field>

              <Field label="PCA / infusione continua">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: pcaUsed ? 10 : 0 }}>
                  <button onClick={() => setPcaUsed(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${pcaUsed ? T.success : T.border}`, backgroundColor: pcaUsed ? T.successLight : '#fff', color: pcaUsed ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{pcaUsed ? 'Sì' : 'No'}</button>
                </div>
                {pcaUsed && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['Epidurale', 'EV', 'Subcutanea'].map(t => (
                      <button key={t} onClick={() => setPcaType(pcaType === t ? '' : t)} style={chip(pcaType === t)}>{t}</button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Duloxetina perioperatoria">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: duloxetinePeriop ? 10 : 0 }}>
                  <button onClick={() => setDuloxetinePeriop(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${duloxetinePeriop ? T.success : T.border}`, backgroundColor: duloxetinePeriop ? T.successLight : '#fff', color: duloxetinePeriop ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{duloxetinePeriop ? 'Sì' : 'No'}</button>
                </div>
                {duloxetinePeriop && (patientCsiScore === null || patientCsiScore < 40) && (
                  <div style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#C2410C', display: 'flex', gap: 6 }}>
                    <span>⚠️</span><span>Duloxetina raccomandata solo se CSI≥40 (sensitizzazione centrale documentata)</span>
                  </div>
                )}
              </Field>

              <Field label="Clonidina">
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>Indicata se PASS≥30</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: clonidineUsed ? 10 : 0 }}>
                  <button onClick={() => setClonidineUsed(v => !v)} style={{ padding: '6px 18px', borderRadius: 20, border: `2px solid ${clonidineUsed ? T.success : T.border}`, backgroundColor: clonidineUsed ? T.successLight : '#fff', color: clonidineUsed ? T.success : T.textMuted, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{clonidineUsed ? 'Sì' : 'No'}</button>
                </div>
                {clonidineUsed && (
                  <div><label style={{ ...lbl, fontSize: 11 }}>Dose (mg)</label><input type="number" step="0.05" value={clonidineDoseMg} onChange={e => setClonidineDoseMg(e.target.value)} placeholder="Es. 0.15" style={{ ...inp, width: 110 }} /></div>
                )}
              </Field>

              <Field label="Target NRS">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {NRS_TARGET_OPTIONS.map(n => (
                    <button key={n} onClick={() => setNrsTarget(nrsTarget === n ? '' : n)} style={chip(nrsTarget === n, T.success)}>{n}</button>
                  ))}
                </div>
              </Field>

              <Field label="Prescrizione Oppioidi (MEO)">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Farmaco</label>
                    <select value={newOpioid.drug} onChange={e => { const d = e.target.value; setNewOpioid(p => ({ ...p, drug: d, route: OPIOIDS[d]?.routes[0] || 'orale' })); }} style={inp}>
                      {Object.keys(OPIOIDS).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Dose (mg)</label>
                    <input type="number" value={newOpioid.dose} onChange={e => setNewOpioid(p => ({ ...p, dose: e.target.value }))} placeholder="mg" style={inp} />
                  </div>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Frequenza</label>
                    <select value={newOpioid.frequency} onChange={e => setNewOpioid(p => ({ ...p, frequency: e.target.value }))} style={inp}>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...lbl, fontSize: 10 }}>Via</label>
                    <select value={newOpioid.route} onChange={e => setNewOpioid(p => ({ ...p, route: e.target.value }))} style={inp}>
                      {(OPIOIDS[newOpioid.drug]?.routes || ['orale']).map(r => <option key={r} value={r}>{ROUTES[r] || r}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={() => {
                  if (!newOpioid.dose || parseFloat(newOpioid.dose) <= 0) return;
                  setOpioidPrescriptions(prev => [...prev, { drug: newOpioid.drug, dose: parseFloat(newOpioid.dose), frequency: newOpioid.frequency, route: newOpioid.route }]);
                  setNewOpioid(p => ({ ...p, dose: '' }));
                }} style={{ ...btn('accent'), width: '100%' }}>+ Aggiungi oppioide</button>
                <div style={{ marginTop: 10 }}>
                  <label style={{ ...lbl, fontSize: 11 }}>Durata terapia</label>
                  <input value={opioidTherapyDuration} onChange={e => setOpioidTherapyDuration(e.target.value)} placeholder="es. 7 giorni" style={inp} />
                </div>
                {opioidPrescriptions.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {opioidPrescriptions.map((op, i) => {
                      const meoDay = toMEO(op.drug, op.dose) * (FREQ_MAP[op.frequency] || 1);
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: T.primaryLight, borderRadius: 8, marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{op.drug}</span>
                            <span style={{ fontSize: 12, color: T.textMuted }}> {op.dose}mg {op.frequency} {ROUTES[op.route] || op.route}</span>
                            <span style={{ fontSize: 12, color: T.primary, fontWeight: 600 }}> = {meoDay.toFixed(1)} MEO/die</span>
                          </div>
                          <button onClick={() => setOpioidPrescriptions(prev => prev.filter((_, j) => j !== i))} style={{ ...btn('ghost'), padding: '2px 8px', fontSize: 12 }}>✕</button>
                        </div>
                      );
                    })}
                    <div style={{ backgroundColor: T.accent + '22', borderRadius: 10, padding: '10px 14px', marginTop: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: T.accent }}>Totale MEO/die: {opioidPrescriptions.reduce((sum, op) => sum + toMEO(op.drug, op.dose) * (FREQ_MAP[op.frequency] || 1), 0).toFixed(1)} mg</span>
                    </div>
                  </div>
                )}
              </Field>

              <Field label="Note">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
              </Field>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP ROUTER
// ============================================================
// ============================================================
// PATIENT QUESTIONNAIRE (public, no auth)
// ============================================================


const QUEST_URL = 'https://oigokazmocdfufjxxyji.supabase.co/functions/v1/patient-questionnaire';
const QUEST_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ29rYXptb2NkZnVmanh4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDU2NjgsImV4cCI6MjA4NzgyMTY2OH0.e_c2CHXgsTbeMaF0m3dYtc_eMnoGTjOWuot-1BIqgYM';

function nrsEmoji(v: number) { return v <= 2 ? '😊' : v <= 4 ? '😐' : v <= 6 ? '😟' : v <= 8 ? '😣' : '😭'; }
function nrsEmojiColor(v: number) { return v <= 2 ? '#16A34A' : v <= 4 ? '#CA8A04' : v <= 6 ? '#EA580C' : '#DC2626'; }

function PostDischargeNrsView({ tokenRow }: { tokenRow: any }) {
  const [patientData, setPatientData] = useState<any>(null);
  const [nrsRest, setNrsRest] = useState(5);
  const [nrsMovement, setNrsMovement] = useState(5);
  const [painInterference, setPainInterference] = useState(5);
  const [sleepQuality, setSleepQuality] = useState(5);
  const [moodScore, setMoodScore] = useState(5);
  const [analgesicsUsed, setAnalgesicsUsed] = useState(false);
  const [analgesicsName, setAnalgesicsName] = useState('');
  const [checkingDay, setCheckingDay] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const [pRes, dRes] = await Promise.all([
        supabase.from('patients').select('first_name, last_name, discharge_date').eq('id', tokenRow.patient_id).single(),
        supabase.from('cpsp_nrs_daily').select('id').eq('patient_id', tokenRow.patient_id).eq('recorded_date', new Date().toISOString().split('T')[0]).maybeSingle(),
      ]);
      setPatientData(pRes.data);
      setAlreadyDone(!!dRes.data);
      setCheckingDay(false);
    };
    init();
  }, [tokenRow.patient_id]);

  const dischargeDate = patientData?.discharge_date || tokenRow.created_at?.split('T')[0];
  const msPerDay = 86400000;
  const dayNum = dischargeDate ? Math.max(1, Math.ceil((new Date().getTime() - new Date(dischargeDate).getTime()) / msPerDay)) : 1;
  const dayNumClamped = Math.min(7, dayNum);
  const isComplete = dayNum > 7;
  const daysCompleted = Math.min(7, dayNum - 1);

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('cpsp_nrs_daily').insert({
      patient_id: tokenRow.patient_id,
      assessment_id: tokenRow.assessment_id || null,
      token_id: tokenRow.id,
      pod_day: dayNumClamped,
      nrs_rest: nrsRest,
      nrs_movement: nrsMovement,
      pain_interference: painInterference,
      sleep_quality: sleepQuality,
      mood_score: moodScore,
      analgesics_used: analgesicsUsed,
      analgesics_name: (analgesicsUsed && analgesicsName) ? analgesicsName : null,
      recorded_date: new Date().toISOString().split('T')[0],
      tenant_id: tokenRow.tenant_id,
    });
    if (error) { alert('Errore invio: ' + error.message); setSubmitting(false); return; }
    setSubmitted(true);
    setSubmitting(false);
  };

  const gradBg = 'linear-gradient(135deg, #0A6E6E 0%, #00BFA5 100%)';
  const wrap = { minHeight: '100vh', background: gradBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as const;
  const cardSt = { backgroundColor: '#fff', borderRadius: 20, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' } as const;

  if (checkingDay) return (
    <div style={wrap}><div style={{ textAlign: 'center', color: '#fff' }}><div style={{ fontSize: 48 }}>🏠</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>Caricamento...</div></div></div>
  );

  if (isComplete) return (
    <div style={wrap}><div style={{ ...cardSt, padding: 36, textAlign: 'center' }}>
      <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0A6E6E' }}>Monitoraggio completato!</div>
      <div style={{ fontSize: 14, color: '#6B7280', marginTop: 10, lineHeight: 1.6 }}>Hai completato i 7 giorni di monitoraggio domiciliare.<br />Grazie per la tua collaborazione!</div>
    </div></div>
  );

  if (alreadyDone && !submitted) return (
    <div style={wrap}><div style={{ ...cardSt, padding: 36, textAlign: 'center' }}>
      <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0A6E6E' }}>Già compilato oggi!</div>
      <div style={{ fontSize: 14, color: '#6B7280', marginTop: 10, lineHeight: 1.6 }}>Hai già registrato il dolore di oggi.<br />Torna domani per il giorno {dayNumClamped + 1} di 7.</div>
      {/* Progress */}
      <div style={{ marginTop: 20, backgroundColor: '#F3F4F6', borderRadius: 10, padding: '10px 16px' }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Progressione monitoraggio</div>
        <div style={{ height: 10, backgroundColor: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(daysCompleted / 7) * 100}%`, backgroundColor: '#0A6E6E', borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 12, color: '#0A6E6E', fontWeight: 700, marginTop: 6 }}>{daysCompleted}/7 giorni completati</div>
      </div>
    </div></div>
  );

  if (submitted) return (
    <div style={wrap}><div style={{ ...cardSt, padding: 36, textAlign: 'center' }}>
      <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0A6E6E' }}>
        {dayNumClamped === 7 ? 'Monitoraggio completato! Grazie!' : `Giorno ${dayNumClamped} registrato!`}
      </div>
      <div style={{ fontSize: 14, color: '#6B7280', marginTop: 10, lineHeight: 1.6 }}>
        {dayNumClamped === 7 ? 'Hai completato tutti i 7 giorni di monitoraggio. Il tuo medico ha ricevuto i dati.' : `Torna domani per il giorno ${dayNumClamped + 1} di 7.`}
      </div>
    </div></div>
  );

  const NrsSlider = ({ label, value, onChange }: { label: string, value: number, onChange: (n: number) => void }) => (
    <div style={{ backgroundColor: '#F9FAFB', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 32 }}>{nrsEmoji(value)}</span>
        <div style={{ flex: 1 }}>
          <input type="range" min={0} max={10} value={value} onChange={e => onChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: nrsEmojiColor(value), height: 6 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
            <span>0 — Nessun dolore</span><span>10 — Massimo dolore</span>
          </div>
        </div>
        <span style={{ fontWeight: 800, fontSize: 22, color: nrsEmojiColor(value), minWidth: 28, textAlign: 'center' as const }}>{value}</span>
      </div>
    </div>
  );

  return (
    <div style={{ ...wrap, alignItems: 'flex-start', paddingTop: 24, paddingBottom: 40 }}>
      <div style={cardSt}>
        {/* Header */}
        <div style={{ background: gradBg, padding: '20px 24px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 26 }}>🏠</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>Monitoraggio Dolore a Casa</span>
          </div>
          {patientData && <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 10 }}>Ciao, <b>{patientData.first_name}!</b></div>}
          <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Giorno {dayNumClamped} di 7</div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#fff', height: '100%', width: `${(daysCompleted / 7) * 100}%`, borderRadius: 99 }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{daysCompleted}/7 giorni completati</div>
        </div>
        {/* Body */}
        <div style={{ padding: '20px 20px 24px' }}>
          <div style={{ fontSize: 15, color: '#374151', marginBottom: 18, lineHeight: 1.5 }}>
            È il <b>giorno {dayNumClamped}</b> dalla tua dimissione. Come stai oggi?
          </div>

          {/* 1. Dolore a riposo */}
          <NrsSlider label="1. Quanto dolore senti quando sei fermo/a?" value={nrsRest} onChange={setNrsRest} />

          {/* 2. Dolore in movimento */}
          <NrsSlider label="2. Quanto dolore senti quando ti muovi?" value={nrsMovement} onChange={setNrsMovement} />

          {/* 3. Interferenza attività */}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 10 }}>
              3. Quanto il dolore ha limitato le tue attività oggi?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>{painInterference <= 2 ? '🏃' : painInterference <= 5 ? '🚶' : painInterference <= 7 ? '🪑' : '🛋️'}</span>
              <div style={{ flex: 1 }}>
                <input type="range" min={0} max={10} value={painInterference}
                  onChange={e => setPainInterference(Number(e.target.value))}
                  style={{ width: '100%', accentColor: nrsEmojiColor(painInterference), height: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  <span>0 — Per nulla</span><span>5 — Abbastanza</span><span>10 — Completamente</span>
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 22, color: nrsEmojiColor(painInterference), minWidth: 28, textAlign: 'center' as const }}>{painInterference}</span>
            </div>
          </div>

          {/* 4. Qualità del sonno — INVERTITA: 10=ottimo, 0=pessimo */}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 10 }}>
              4. Come hai dormito la scorsa notte?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>{sleepQuality >= 8 ? '😴' : sleepQuality >= 5 ? '🙂' : sleepQuality >= 3 ? '😕' : '😫'}</span>
              <div style={{ flex: 1 }}>
                <input type="range" min={0} max={10} value={sleepQuality}
                  onChange={e => setSleepQuality(Number(e.target.value))}
                  style={{ width: '100%', accentColor: nrsEmojiColor(10 - sleepQuality), height: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  <span>0 — Pessimo</span><span>5 — Discreto</span><span>10 — Ottimo</span>
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 22, color: sleepQuality >= 7 ? '#16A34A' : sleepQuality >= 4 ? '#CA8A04' : '#DC2626', minWidth: 28, textAlign: 'center' as const }}>{sleepQuality}</span>
            </div>
          </div>

          {/* 5. Umore — INVERTITA: 10=ottimo, 0=molto giù */}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 10 }}>
              5. Come ti senti di umore oggi?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>{moodScore >= 8 ? '😊' : moodScore >= 5 ? '🙂' : moodScore >= 3 ? '😐' : '😢'}</span>
              <div style={{ flex: 1 }}>
                <input type="range" min={0} max={10} value={moodScore}
                  onChange={e => setMoodScore(Number(e.target.value))}
                  style={{ width: '100%', accentColor: nrsEmojiColor(10 - moodScore), height: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  <span>0 — Molto giù</span><span>5 — Così così</span><span>10 — Bene</span>
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 22, color: moodScore >= 7 ? '#16A34A' : moodScore >= 4 ? '#CA8A04' : '#DC2626', minWidth: 28, textAlign: 'center' as const }}>{moodScore}</span>
            </div>
          </div>

          {/* 6. Antidolorifici */}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 14, padding: '12px 16px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#111827' }}>6. Hai preso antidolorifici oggi?</span>
              <button onClick={() => setAnalgesicsUsed(!analgesicsUsed)}
                style={{ padding: '6px 20px', borderRadius: 20, border: `2px solid ${analgesicsUsed ? '#0A6E6E' : '#D1D5DB'}`,
                  backgroundColor: analgesicsUsed ? '#E6F4F4' : '#fff', color: analgesicsUsed ? '#0A6E6E' : '#9CA3AF',
                  fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                {analgesicsUsed ? 'Sì' : 'No'}
              </button>
            </div>
            {analgesicsUsed && (
              <input type="text" value={analgesicsName} onChange={e => setAnalgesicsName(e.target.value)}
                placeholder="Quale farmaco? (opzionale)" style={{ marginTop: 10, width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #D1D5DB', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
            )}
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', backgroundColor: '#0A6E6E', color: '#fff',
              fontWeight: 700, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Invio...' : `✅ Invia risposta del giorno ${dayNumClamped}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const Q_LABELS = ['0 — Mai', '1 — Raramente', '2 — A volte', '3 — Spesso', '4 — Sempre'];
const Q_BG     = ['#F3F4F6', '#DCFCE7', '#FEF9C3', '#FFEDD5', '#FECACA'];
const Q_COLOR  = ['#6B7280', '#16A34A', '#CA8A04', '#EA580C', '#DC2626'];

const SCALES_CFG = [
  { key: 'pcs'  as const, name: 'PCS',  label: 'PCS — Catastrofizzazione del dolore',  items: PCS_ITEMS,  maxVal: 4 },
  { key: 'pass' as const, name: 'PASS', label: 'PASS — Ansia da dolore',               items: PASS_ITEMS, maxVal: 4 },
  { key: 'csi'  as const, name: 'CSI',  label: 'CSI — Sensitizzazione centrale',        items: CSI_ITEMS,  maxVal: 4 },
];

function PatientQuestionnairePage() {
  const { token } = useParams<{ token: string }>();
  const [questData, setQuestData]   = useState<any>(null);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dischargeTokenRow, setDischargeTokenRow] = useState<any>(null);

  // Refs per il submit — aggiornati sincronicamente, mai stale
  const pcsRef  = useRef<number[]>(new Array(PCS_ITEMS.length).fill(0));
  const passRef = useRef<number[]>(new Array(PASS_ITEMS.length).fill(0));
  const csiRef  = useRef<number[]>(new Array(CSI_ITEMS.length).fill(0));

  const [allAnswers, setAllAnswers] = useState<{ pcs: number[]; pass: number[]; csi: number[] }>({
    pcs:  new Array(PCS_ITEMS.length).fill(0),
    pass: new Array(PASS_ITEMS.length).fill(0),
    csi:  new Array(CSI_ITEMS.length).fill(0),
  });
  // touched[scaleIdx][itemIdx] tracks whether the patient has explicitly tapped an answer
  const [touched, setTouched] = useState<boolean[][]>([
    new Array(PCS_ITEMS.length).fill(false),
    new Array(PASS_ITEMS.length).fill(false),
    new Array(CSI_ITEMS.length).fill(false),
  ]);

  const [currentScale, setCurrentScale] = useState(0);
  const [currentItem,  setCurrentItem]  = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        // Check token type directly first
        const { data: tokenRow } = await supabase
          .from('patient_questionnaire_tokens')
          .select('*')
          .eq('token', token)
          .single();
        if (tokenRow?.token_type === 'post_discharge_nrs' || tokenRow?.scales?.[0] === 'post_discharge_nrs') {
          setDischargeTokenRow(tokenRow);
          setLoading(false);
          return;
        }
        const res = await fetch(QUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': QUEST_ANON_KEY },
          body: JSON.stringify({ action: 'get_questionnaire', token }),
        });
        const data = await res.json();
        if (data.error) { setError(data.error); setLoading(false); return; }
        setQuestData(data);
        setAllAnswers({
          pcs:  new Array(PCS_ITEMS.length).fill(0),
          pass: new Array(PASS_ITEMS.length).fill(0),
          csi:  new Array(CSI_ITEMS.length).fill(0),
        });
      } catch (e: any) {
        setError('Errore di connessione. Verifica la tua connessione internet.');
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const scaleCfg      = SCALES_CFG[currentScale];
  const scaleKey      = scaleCfg.key;
  const items         = scaleCfg.items;
  const totalItems    = items.length;
  const currentAnswers = allAnswers[scaleKey];
  const isTouched     = touched[currentScale][currentItem];
  const selectedVal   = isTouched ? currentAnswers[currentItem] : null;

  const totalScales   = SCALES_CFG.length;
  const globalPct     = Math.round(
    (currentScale * totalItems * 100 + currentItem * 100) /
    (totalScales * totalItems)
  );
  const isLastItem    = currentItem === totalItems - 1;
  const isLastScale   = currentScale === totalScales - 1;

  const handleAnswer = (value: number) => {
    // 1. Aggiorna il ref sincronicamente (mai stale nel submit)
    if (scaleKey === 'pcs')  pcsRef.current[currentItem]  = value;
    if (scaleKey === 'pass') passRef.current[currentItem] = value;
    if (scaleKey === 'csi')  csiRef.current[currentItem]  = value;

    // 2. Aggiorna allAnswers per il rendering
    const newAnswers = {
      ...allAnswers,
      [scaleKey]: allAnswers[scaleKey].map((v, i) => i === currentItem ? value : v),
    };
    setAllAnswers(newAnswers);

    // 2. Segna come toccato
    const newTouched = touched.map((row, si) =>
      si === currentScale ? row.map((v, ii) => ii === currentItem ? true : v) : row
    );
    setTouched(newTouched);

    // 3. Avanza automaticamente dopo 300ms
    setTimeout(() => {
      if (!isLastItem) {
        setCurrentItem(i => i + 1);
      } else if (!isLastScale) {
        setCurrentScale(s => s + 1);
        setCurrentItem(0);
      }
      // Ultimo item ultima scala → rimane fermo, il paziente preme "Invia"
    }, 300);
  };

  const goBack = () => {
    if (currentItem > 0) {
      setCurrentItem(i => i - 1);
    } else if (currentScale > 0) {
      setCurrentScale(s => s - 1);
      setCurrentItem(SCALES_CFG[currentScale - 1].items.length - 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    console.log('Lunghezze:', pcsRef.current.length, passRef.current.length, csiRef.current.length);
    console.log('SUBMIT refs:', JSON.stringify({ pcs: pcsRef.current, pass: passRef.current, csi: csiRef.current }));
    try {
      const res = await fetch(QUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': QUEST_ANON_KEY },
        body: JSON.stringify({
          action: 'submit_questionnaire',
          token,
          pcsAnswers:  pcsRef.current.slice(0, 13),
          passAnswers: passRef.current.slice(0, 20),
          csiAnswers:  csiRef.current.slice(0, 25),
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setSubmitting(false); return; }
      setSubmitted(true);
    } catch {
      setError('Errore durante l\'invio. Riprova.');
    }
    setSubmitting(false);
  };

  const gradBg = `linear-gradient(135deg, ${T.primaryDark} 0%, ${T.primary} 100%)`;
  const wrap   = { minHeight: '100vh', background: gradBg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as const;
  const cardSt = { backgroundColor: '#fff', borderRadius: 20, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' } as const;

  if (dischargeTokenRow) return <PostDischargeNrsView tokenRow={dischargeTokenRow} />;

  if (loading) return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🩺</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>APS Manager</div>
        <div style={{ marginTop: 10, opacity: 0.7 }}>Caricamento questionario...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={wrap}>
      <div style={{ ...cardSt, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>Link non disponibile</div>
        <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>{error}</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={wrap}>
      <div style={{ ...cardSt, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 10 }}>Grazie!</div>
        <div style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.7 }}>
          Il tuo medico ha ricevuto le tue risposte.<br />Puoi chiudere questa pagina.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ ...wrap, alignItems: 'flex-start', paddingTop: 24, paddingBottom: 24 }}>
      <div style={cardSt}>

        {/* Header gradiente */}
        <div style={{ background: gradBg, padding: '20px 24px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 26 }}>🩺</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>APS Manager</span>
          </div>
          {questData?.patient_name && (
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginBottom: 10 }}>
              Ciao, <b>{questData.patient_name}!</b>
            </div>
          )}
          {/* Label scala + item */}
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
            Scala {currentScale + 1}/{totalScales} — {scaleCfg.label} · Domanda {currentItem + 1}/{totalItems}
          </div>
          {/* Progress bar */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, height: 7, overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#fff', height: '100%', width: `${globalPct}%`, borderRadius: 99, transition: 'width 0.35s ease' }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{globalPct}%</div>
        </div>

        {/* Domanda */}
        <div style={{ padding: '22px 22px 18px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, lineHeight: 1.5, marginBottom: 20, minHeight: 60 }}>
            {currentItem + 1}. {items[currentItem]}
          </div>

          {/* Pulsanti risposta */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 22 }}>
            {Q_LABELS.map((label, v) => {
              const selected = selectedVal === v;
              return (
                <button key={v} onClick={() => handleAnswer(v)}
                  style={{
                    padding: '15px 18px', borderRadius: 14, cursor: 'pointer', textAlign: 'left' as const,
                    border: `2px solid ${selected ? Q_COLOR[v] : '#E5E7EB'}`,
                    backgroundColor: selected ? Q_BG[v] : '#fff',
                    color: selected ? Q_COLOR[v] : T.textMuted,
                    fontWeight: selected ? 700 : 500, fontSize: 15,
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'all 0.15s',
                  }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 99, flexShrink: 0,
                    backgroundColor: selected ? Q_COLOR[v] : '#F3F4F6',
                    color: selected ? '#fff' : T.textMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14,
                  }}>{v}</span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Navigazione */}
          <div style={{ display: 'flex', gap: 10 }}>
            {(currentItem > 0 || currentScale > 0) && (
              <button onClick={goBack}
                style={{ ...btn('ghost', 'md'), flex: 1, justifyContent: 'center' }}>
                ← Indietro
              </button>
            )}
            {isLastItem && isLastScale && isTouched && (
              <button onClick={handleSubmit} disabled={submitting}
                style={{ ...btn('primary', 'md'), flex: 2, justifyContent: 'center', borderRadius: 12, backgroundColor: T.success, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Invio in corso...' : '✅ Invia questionario'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, loadingTimeout } = useAuth();
  const location = useLocation();
  const [tenantCode, setTenantCode] = useState(localStorage.getItem('tenant_code') || '');
  const [showRegister, setShowRegister] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Public route — no auth/tenant required
  if (location.pathname.startsWith('/q/')) {
    return (
      <Routes>
        <Route path="/q/:token" element={<PatientQuestionnairePage />} />
      </Routes>
    );
  }

  if (isPasswordRecovery) return <ResetPasswordPage onDone={() => { setIsPasswordRecovery(false); supabase.auth.signOut(); }} />;

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${T.primaryDark} 0%, ${T.primary} 100%)` }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🩺</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>APS Manager</div>
        {loadingTimeout ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ opacity: 0.7, fontSize: 14, marginBottom: 12 }}>Connessione lenta...</div>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', backgroundColor: '#fff', color: T.primary, border: 'none', borderRadius: 20, fontWeight: 700, cursor: 'pointer' }}>Riprova</button>
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.6, fontSize: 14 }}>Caricamento...</div>
        )}
      </div>
    </div>
  );

  if (!tenantCode) return <OnboardingPage onSelect={setTenantCode} />;
  if (!user) {
    if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} />;
    return <LoginPage onRegister={() => setShowRegister(true)} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/new" element={<PatientFormPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/patients/:id/edit" element={<PatientFormPage />} />
        <Route path="/patients/:id/interventions/new" element={<InterventionFormPage />} />
        <Route path="/patients/:id/interventions/:interventionId/edit" element={<InterventionFormPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
