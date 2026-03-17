import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from './services/supabase';
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
function Layout({ children }: any) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const path = window.location.pathname;

  const navItems = [
    { path: '/', icon: '⊞', label: 'Dashboard' },
    { path: '/patients', icon: '♥', label: 'Pazienti' },
    { path: '/notifications', icon: '◉', label: 'Notifiche' },
    { path: '/stats', icon: '↗', label: 'Statistiche' },
    ...(profile?.role === 'admin' ? [
      { path: '/export', icon: '⬇', label: 'Export' },
      { path: '/users', icon: '✦', label: 'Utenti' },
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
          <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>Esci</button>
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

            {/* Logout */}
            <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
            <div style={{ marginBottom: 24 }}>
              <label style={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={inp} placeholder="••••••••" required />
            </div>
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
  const greeting = hour < 12 ? '☀️ Buongiorno' : hour < 18 ? '⛅ Buon pomeriggio' : '🌙 Buonasera';

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
function PatientsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const canAdd = ['medico', 'infermiere', 'admin'].includes(profile?.role);
  const canDelete = ['medico', 'admin'].includes(profile?.role);
  const [showDischarged, setShowDischarged] = useState(false);

  useEffect(() => { fetchPatients(); }, [showDischarged]);

  const fetchPatients = async () => {
    const { data } = await supabase.from('patients')
      .select('*, nrs_measurements(nrs_value, measured_at)')
      .eq('is_active', !showDischarged).order('last_name');
    setPatients(data || []);
    setLoading(false);
  };

  const deletePatient = async (id: string) => {
    if (!window.confirm('Eliminare questo paziente?')) return;
    await supabase.from('patients').delete().eq('id', id);
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.ward} ${p.admission_number}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: T.text, fontWeight: 800 }}>Pazienti</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', flex: isMobile ? 1 : 'none' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca paziente..."
              style={{ ...inp, paddingLeft: 36, width: isMobile ? '100%' : 220, borderRadius: 20 }} />
          </div>
          <button onClick={() => { setShowDischarged(d => !d); setLoading(true); }}
            style={{ ...chip(!showDischarged), padding: '10px 16px', borderRadius: 10 }}>
            {showDischarged ? '👤 Pazienti Attivi' : '🏠 Dimessi'}
          </button>
          {canAdd && !showDischarged && (
            <button onClick={() => navigate('/patients/new')} style={btn('primary')}>
              + Aggiungi
            </button>
          )}
        </div>
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
            return (
              <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onClick={() => navigate('/patients/' + p.id)}>
                {/* Avatar */}
                <div style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: T.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {p.first_name?.[0]}{p.last_name?.[0]}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{p.last_name} {p.first_name}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                    {p.ward} · Letto {p.bed || '—'} · {p.admission_number}
                  </div>
                </div>
                {/* NRS badge */}
                {lastNRS ? (
                  <span style={{ backgroundColor: getNrsBg(lastNRS.nrs_value), color: getNrsColor(lastNRS.nrs_value), padding: '6px 14px', borderRadius: 20, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {lastNRS.nrs_value}
                  </span>
                ) : <span style={{ color: T.textLight, fontSize: 18, fontWeight: 700 }}>—</span>}
                {/* Actions */}
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
  const [tab, setTab] = useState<'nrs'|'info'|'interventions'>('nrs');
  const [nrsValue, setNrsValue] = useState<number|null>(null);
  const [therapy, setTherapy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canDelete = ['medico', 'admin'].includes(profile?.role);
  const canDeleteNRS = ['medico', 'infermiere', 'admin'].includes(profile?.role);

  useEffect(() => { fetchAll(); }, [id]);

  const fetchAll = async () => {
    const [pRes, iRes, mRes] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('interventions').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
      supabase.from('nrs_measurements').select('*').eq('patient_id', id).order('measured_at', { ascending: false }).limit(50),
    ]);
    setPatient(pRes.data);
    setInterventions(iRes.data || []);
    setMeasurements(mRes.data || []);
  };

  const saveNRS = async () => {
    if (nrsValue === null) return alert('Seleziona un valore NRS');
    setSaving(true);
    await supabase.from('nrs_measurements').insert({
      patient_id: id, intervention_id: interventions[0]?.id,
      nrs_value: nrsValue, therapy_administered: therapy || null,
      notes: notes || null, measured_at: new Date().toISOString(), recorded_by: profile?.id,
    });
    setNrsValue(null); setTherapy(''); setNotes('');
    await fetchAll(); setSaving(false);
  };

  const deleteNRS = async (nrsId: string) => {
    if (!window.confirm('Eliminare?')) return;
    await supabase.from('nrs_measurements').delete().eq('id', nrsId);
    setMeasurements(prev => prev.filter(m => m.id !== nrsId));
  };

  const deleteIntervention = async (iId: string) => {
    if (!window.confirm('Eliminare?')) return;
    await supabase.from('interventions').delete().eq('id', iId);
    setInterventions(prev => prev.filter(i => i.id !== iId));
  };

  if (!patient) return <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>Caricamento...</div>;

  const tabs = [['nrs', '📊 NRS'], ['info', '👤 Info'], ['interventions', '🔧 Interventi']];

  // Chart data
  const chartData = [...measurements].reverse().slice(-15).map(m => ({
    time: format(parseISO(m.measured_at), 'dd/MM HH:mm'),
    nrs: m.nrs_value,
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/patients')} style={{ background: T.primaryLight, border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary }}>←</button>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, color: T.text, fontWeight: 800 }}>{patient.last_name} {patient.first_name}</h1>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{patient.ward} · Letto {patient.bed || '—'} · {patient.admission_number}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/patients/' + id + '/edit')} style={btn('ghost', 'sm')}>✏️ Modifica</button>
          {canDelete && (
            <>
              <button onClick={async () => {
                const notes = window.prompt('Note di dimissione (opzionale):') ?? '';
                if (notes === null) return;
                await supabase.from('patients').update({ is_active: false, discharge_date: new Date().toISOString().split('T')[0], discharge_notes: notes || null }).eq('id', id);
                navigate('/patients');
              }} style={{ background: T.warningLight, border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: T.warning, fontWeight: 600, fontSize: 13 }}>🏠 Dimetti</button>
              <button onClick={async () => { if (window.confirm('Eliminare definitivamente?')) { await supabase.from('patients').delete().eq('id', id); navigate('/patients'); }}}
                style={{ background: T.dangerLight, border: 'none', padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: T.danger, fontWeight: 600, fontSize: 13 }}>🗑</button>
            </>
          )}
        </div>
      </div>

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
                    <button onClick={() => deleteNRS(m.id)} style={{ background: T.dangerLight, border: 'none', padding: '4px 8px', borderRadius: 8, cursor: 'pointer', color: T.danger, fontSize: 12 }}>🗑</button>
                  )}
                </div>
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
              ['Data di nascita', patient.date_of_birth],
              ['Codice Fiscale', patient.fiscal_code || '—'],
              ['Sesso', patient.gender || '—'],
              ['N° Ricovero', patient.admission_number],
              ['Reparto', patient.ward],
              ['Letto', patient.bed || '—'],
              ['Data ricovero', patient.admission_date],
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
                  <span style={{ fontSize: 12, color: T.primaryDark, fontWeight: 600 }}>💊 Post-op: </span>
                  <span style={{ fontSize: 12, color: T.primaryDark }}>{i.postop_drugs}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    const { data } = await supabase.from('notifications')
      .select('*, patients(first_name, last_name)')
      .eq('recipient_id', profile?.id)
      .order('created_at', { ascending: false }).limit(100);
    setNotifications(data || []);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', profile?.id).eq('is_read', false);
    setNotifications(n => n.map(x => ({ ...x, is_read: true })));
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
        {unread > 0 && <button onClick={markAllRead} style={btn('ghost', 'sm')}>✓ Segna tutte lette</button>}
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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (patientId) loadPatient(); }, [patientId]);

  const loadPatient = async () => {
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
    });
  };

  const handleChange = useCallback((key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.admission_number || !form.ward) {
      alert('Compila i campi obbligatori'); return;
    }
    setSaving(true);
    const payload: any = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth, fiscal_code: form.fiscal_code || null,
      gender: form.gender, admission_number: form.admission_number,
      ward: form.ward, bed: form.bed || null, admission_date: form.admission_date,
      allergies: form.allergies || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      asa_class: form.asa_class ? parseInt(form.asa_class) : null,
      notes: form.notes || null, created_by: profile?.id,
    };
    if (patientId) {
      const { error } = await supabase.from('patients').update(payload).eq('id', patientId);
      if (error) { alert('Errore: ' + error.message); setSaving(false); return; }
      navigate('/patients/' + patientId);
    } else {
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
          {([['Nome *', 'first_name'], ['Cognome *', 'last_name'], ['Data di nascita (YYYY-MM-DD) *', 'date_of_birth'], ['Codice Fiscale', 'fiscal_code']] as [string,string][]).map(([label, key]) => (
            <Field key={key} label={label}>
              <input value={(form as any)[key]} onChange={e => handleChange(key, e.target.value)} style={inp} />
            </Field>
          ))}
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
            {([['N° Ricovero *', 'admission_number'], ['Reparto *', 'ward'], ['Letto', 'bed'], ['Data ricovero (YYYY-MM-DD)', 'admission_date']] as [string,string][]).map(([label, key]) => (
              <Field key={key} label={label}>
                <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp} />
              </Field>
            ))}
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

  useEffect(() => { fetchStats(); }, [period]);

  const fetchStats = async () => {
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
  };

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
// USERS
// ============================================================
function UsersPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ email: '', password: '', role: 'infermiere', firstName: '', lastName: '', department: '', badgeNumber: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const FUNCTION_URL = 'https://oigokazmocdfufjxxyji.supabase.co/functions/v1/manage-users';

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').order('last_name');
      setUsers(data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

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

  const createUser = async () => {
    if (!form.email || !form.password || !form.firstName || !form.lastName) { alert('Compila tutti i campi obbligatori'); return; }
    setSaving(true);
    const res = await callFn({ action: 'create', email: form.email, password: form.password, role: form.role, firstName: form.firstName, lastName: form.lastName, department: form.department, badgeNumber: form.badgeNumber, phone: form.phone });
    setSaving(false);
    if (res.error) { alert('Errore: ' + res.error); return; }
    setShowForm(false);
    setForm({ email: '', password: '', role: 'infermiere', firstName: '', lastName: '', department: '', badgeNumber: '', phone: '' });
    fetchUsers();
  };

  const Modal = ({ title, children, onClose }: any) => (
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
// CODICE FISCALE UTILS
// ============================================================
const CF_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const CF_VOWELS = 'AEIOU';
const CF_MONTHS: Record<number, string> = {1:'A',2:'B',3:'C',4:'D',5:'E',6:'H',7:'L',8:'M',9:'P',10:'R',11:'S',12:'T'};
const CF_ODD: Record<string, number> = {0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23};

function cfNameCode(name: string): string {
  const n = name.toUpperCase().replace(/[^A-Z]/g, '');
  const cons = n.split('').filter(c => CF_CONSONANTS.includes(c));
  const vows = n.split('').filter(c => CF_VOWELS.includes(c));
  if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
  return [...cons, ...vows, 'X', 'X', 'X'].slice(0, 3).join('');
}

function cfSurnameCode(surname: string): string {
  const s = surname.toUpperCase().replace(/[^A-Z]/g, '');
  const cons = s.split('').filter(c => CF_CONSONANTS.includes(c));
  const vows = s.split('').filter(c => CF_VOWELS.includes(c));
  return [...cons, ...vows, 'X', 'X', 'X'].slice(0, 3).join('');
}

function cfCheckCode(cf15: string): string {
  let s = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf15[i];
    if (i % 2 === 0) s += CF_ODD[c] ?? 0;
    else s += isNaN(Number(c)) ? c.charCodeAt(0) - 65 : Number(c);
  }
  return String.fromCharCode(65 + (s % 26));
}

function computeCodiceFiscale(firstName: string, lastName: string, dob: string, gender: string, belfiore: string): string {
  try {
    if (belfiore.length !== 4) return '';
    const [year, month, day] = dob.split('-').map(Number);
    const cf15 = cfSurnameCode(lastName) + cfNameCode(firstName) + String(year).slice(-2) + (CF_MONTHS[month] || 'A') + (gender === 'F' ? String(day + 40).padStart(2, '0') : String(day).padStart(2, '0')) + belfiore;
    return cf15 + cfCheckCode(cf15);
  } catch(e) { return ''; }
}

function decodeCodiceFiscale(cf: string): { year: number; month: number; day: number; gender: string } | null {
  try {
    if (cf.length !== 16) return null;
    const yearPart = parseInt(cf.slice(6, 8));
    const year = yearPart > 30 ? 1900 + yearPart : 2000 + yearPart;
    const monthMap: Record<string, number> = {A:1,B:2,C:3,D:4,E:5,H:6,L:7,M:8,P:9,R:10,S:11,T:12};
    const month = monthMap[cf[8]] || 1;
    const dayRaw = parseInt(cf.slice(9, 11));
    const gender = dayRaw > 40 ? 'F' : 'M';
    return { year, month, day: gender === 'F' ? dayRaw - 40 : dayRaw, gender };
  } catch(e) { return null; }
}

// ============================================================
// INTERVENTION FORM
// ============================================================
const CATEGORIES = ['ortopedico','addominale','toracico','urologico','ginecologico','vascolare','neurochirurgico','altro'];
const ANESTHESIAS = ['generale','spinale','epidurale','locoregionale','sedazione','locale'];
const PROTOCOLS = ['PCA','epidurale_continua','blocco_nervoso','sistemico_ev','sistemico_orale'];
const REGIONAL_ANESTHESIAS = ['epidurale','locoregionale','spinale'];
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

const getNowStr = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
};

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

  useEffect(() => { if (isEdit) loadIntervention(); }, [interventionId]);

  const loadIntervention = async () => {
    const { data } = await supabase.from('interventions').select('*').eq('id', interventionId).single();
    if (data) setForm({
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
  };

  const showRegional = form.anesthesia_types.some(a => REGIONAL_ANESTHESIAS.includes(a)) || form.pain_protocols.some(p => ['blocco_nervoso','epidurale_continua'].includes(p));

  const handleSave = async () => {
    if (!form.intervention_name.trim()) { alert('Inserisci il nome'); return; }
    setSaving(true);
    const payload: any = {
      intervention_name: form.intervention_name,
      intervention_subtype: form.intervention_subtype || null,
      category: form.category,
      anesthesia_type: form.anesthesia_types.length > 0 ? form.anesthesia_types[0] : (form.anesthesia_type || 'generale'),
      anesthesia_drugs: form.anesthesia_drugs || null,
      pain_protocol: form.pain_protocols.length > 0 ? form.pain_protocols.join(',') : form.pain_protocol,
      regional_blocks: form.regional_blocks || null,
      regional_drugs: form.regional_drugs || null,
      postop_drugs: form.postop_drugs || null,
      surgeon: form.surgeon || null,
      anesthesiologist_name: form.anesthesiologist_name || null,
      nrs_alert_threshold: parseInt(form.nrs_alert_threshold) || 6,
      intervention_end_time: form.intervention_end_time ? new Date(form.intervention_end_time).toISOString() : null,
      notes: form.notes || null,
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
          <Section title="💉 Anestesia">
            <Field label="Tipo (selezione multipla)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ANESTHESIAS.map(a => {
                  const selected = form.anesthesia_types.includes(a);
                  return <button key={a} onClick={() => setForm(f => ({ ...f, anesthesia_types: selected ? f.anesthesia_types.filter(x => x !== a) : [...f.anesthesia_types, a] }))} style={chip(selected)}>{a}</button>;
                })}
              </div>
            </Field>
            <Field label="Farmaci Anestesia">
              <textarea value={form.anesthesia_drugs} onChange={e => set('anesthesia_drugs', e.target.value)} placeholder="Propofol, Fentanyl..." style={{ ...inp, minHeight: 70, resize: 'vertical' as const }} />
            </Field>
          </Section>

          <Section title="💊 Terapia Dolore">
            <Field label="Protocollo (selezione multipla)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PROTOCOLS.map(p => {
                  const selected = form.pain_protocols.includes(p);
                  return <button key={p} onClick={() => setForm(f => ({ ...f, pain_protocols: selected ? f.pain_protocols.filter(x => x !== p) : [...f.pain_protocols, p] }))} style={chip(selected, T.accent)}>{p.replace(/_/g, ' ')}</button>;
                })}
              </div>
            </Field>
            {showRegional && (
              <>
                <Field label="Blocchi Effettuati">
                  <textarea value={form.regional_blocks} onChange={e => set('regional_blocks', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
                </Field>
                <Field label="Farmaci Locoregionali">
                  <textarea value={form.regional_drugs} onChange={e => set('regional_drugs', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
                </Field>
              </>
            )}
            <Field label="Terapia Post-Operatoria">
              <textarea value={form.postop_drugs} onChange={e => set('postop_drugs', e.target.value)} style={{ ...inp, minHeight: 80, resize: 'vertical' as const }} />
            </Field>
            <Field label="Note">
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} />
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP ROUTER
// ============================================================
function AppRoutes() {
  const { user, loading, loadingTimeout } = useAuth();

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

  if (!user) return <LoginPage />;

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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
