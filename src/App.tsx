import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from './services/supabase';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

// ============================================================
// AUTH CONTEXT
// ============================================================
const AuthContext = createContext<any>(null);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: any) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
      const query = supabase.from('profiles').select('*').eq('id', userId).single();
      const { data } = await Promise.race([query, timeout]) as any;
      setProfile(data);
    } catch(e) {
      console.error('fetchProfile error:', e);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message || null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// HELPERS
// ============================================================
const getNrsColor = (v: number) => v <= 3 ? '#22C55E' : v <= 6 ? '#F59E0B' : '#EF4444';
const getNrsBg = (v: number) => v <= 3 ? '#DCFCE7' : v <= 6 ? '#FEF3C7' : '#FEE2E2';

// ============================================================
// LAYOUT
// ============================================================
function Layout({ children }: any) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const roleColor: Record<string, string> = {
    admin: '#7C3AED', medico: '#1A5F7A', infermiere: '#57C5B6', paziente: '#F59E0B'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F5F9FA', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw' }}>
      {/* Top Nav */}
      <nav style={{ backgroundColor: '#1A5F7A', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 24 }}>🩺</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: 0.5 }}>APS Manager</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[
            { path: '/', label: '🏠 Dashboard' },
            { path: '/patients', label: '👥 Pazienti' },
            { path: '/notifications', label: '🔔 Notifiche' },
            { path: '/stats', label: '📈 Statistiche' },
            ...(profile?.role === 'admin' ? [{ path: '/export', label: '📊 Export' }, { path: '/users', label: '👤 Utenti' }] : []),
          ].map(item => (
            <button key={item.path} onClick={() => navigate(item.path)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{profile?.first_name} {profile?.last_name}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{profile?.role}</div>
            </div>
          </div>
          <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>
            Logout
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {children}
      </main>
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
    setLoading(true);
    setError('');
    const err = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1A5F7A 0%, #134758 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 40, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🩺</div>
          <h1 style={{ margin: 0, color: '#1A5F7A', fontSize: 24, fontWeight: 700 }}>APS Manager</h1>
          <p style={{ color: '#8A9BA8', margin: '8px 0 0', fontSize: 13 }}>Acute Pain Service</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              placeholder="nome@ospedale.it" required />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              placeholder="••••••••" required />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '14px', backgroundColor: '#1A5F7A', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ active: 0, highPain: 0, missing: 0, total: 0 });
  const [recentNRS, setRecentNRS] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data: patients } = await supabase.from('patients').select('id').eq('is_active', true);
    const { data: highPain } = await supabase.from('nrs_measurements')
      .select('id').gte('nrs_value', 7)
      .gte('measured_at', new Date(Date.now() - 24*3600000).toISOString());
    const { data: recent } = await supabase.from('nrs_measurements')
      .select('*, patients(first_name, last_name, ward)')
      .order('measured_at', { ascending: false }).limit(10);

    setStats({
      active: patients?.length || 0,
      highPain: highPain?.length || 0,
      missing: 0,
      total: recent?.length || 0,
    });
    setRecentNRS(recent || []);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '☀️ Buongiorno' : hour < 18 ? '🌤 Buon pomeriggio' : '🌙 Buonasera';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: '#1A2730', fontSize: 24 }}>{greeting}, {profile?.first_name}!</h1>
        <p style={{ color: '#8A9BA8', margin: '4px 0 0' }}>{format(new Date(), "EEEE d MMMM yyyy", { locale: it })}</p>
      </div>

      {/* KPI */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: '🏥', label: 'Pazienti attivi', value: stats.active, color: '#1A5F7A' },
          { icon: '🔴', label: 'Alert NRS (24h)', value: stats.highPain, color: '#EF4444' },
          { icon: '📋', label: 'Rilevazioni oggi', value: stats.total, color: '#57C5B6' },
          { icon: '👤', label: 'Ruolo', value: profile?.role, color: '#7C3AED' },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: '3px solid ' + k.color }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 13, color: '#8A9BA8', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Rilevazioni recenti */}
      <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#1A2730' }}>📊 Rilevazioni Recenti</h2>
        {recentNRS.length === 0 ? (
          <p style={{ color: '#8A9BA8', textAlign: 'center', padding: 20 }}>Nessuna rilevazione</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F0F4F8' }}>
                {['Paziente', 'Reparto', 'NRS', 'Orario'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#8A9BA8', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentNRS.map((m: any) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #F0F4F8' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1A2730' }}>
                    {m.patients?.last_name} {m.patients?.first_name}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{m.patients?.ward}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ backgroundColor: getNrsBg(m.nrs_value), color: getNrsColor(m.nrs_value), padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 14 }}>
                      {m.nrs_value}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 13 }}>
                    {formatDistanceToNow(parseISO(m.measured_at), { addSuffix: true, locale: it })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const canAdd = ['medico', 'infermiere', 'admin'].includes(profile?.role);
  const canDelete = ['medico', 'admin'].includes(profile?.role);

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    const { data } = await supabase.from('patients')
      .select('*, nrs_measurements(nrs_value, measured_at)')
      .eq('is_active', true).order('last_name');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#1A2730' }}>👥 Pazienti</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Cerca paziente..."
            style={{ padding: '8px 16px', borderRadius: 20, border: '1.5px solid #D0E3EC', fontSize: 14, outline: 'none', width: 250 }} />
          {canAdd && (
            <button onClick={() => navigate('/patients/new')}
              style={{ backgroundColor: '#1A5F7A', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}>
              + Aggiungi Paziente
            </button>
          )}
        </div>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#8A9BA8' }}>Caricamento...</p> : (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#F8FAFB' }}>
              <tr>
                {['Paziente', 'Reparto', 'Letto', 'N° Ricovero', 'Ultimo NRS', 'Azioni'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#8A9BA8', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const lastNRS = (p.nrs_measurements || []).sort((a: any, b: any) =>
                  new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())[0];
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F0F4F8', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <td style={{ padding: '12px 16px' }} onClick={() => navigate(`/patients/${p.id}`)}>
                      <div style={{ fontWeight: 700, color: '#1A2730' }}>{p.last_name} {p.first_name}</div>
                      <div style={{ fontSize: 12, color: '#8A9BA8' }}>{format(parseISO(p.date_of_birth), 'dd/MM/yyyy')}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }} onClick={() => navigate(`/patients/${p.id}`)}>{p.ward}</td>
                    <td style={{ padding: '12px 16px', color: '#6B7280' }} onClick={() => navigate(`/patients/${p.id}`)}>{p.bed || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 13 }} onClick={() => navigate(`/patients/${p.id}`)}>{p.admission_number}</td>
                    <td style={{ padding: '12px 16px' }} onClick={() => navigate(`/patients/${p.id}`)}>
                      {lastNRS ? (
                        <span style={{ backgroundColor: getNrsBg(lastNRS.nrs_value), color: getNrsColor(lastNRS.nrs_value), padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}>
                          {lastNRS.nrs_value}
                        </span>
                      ) : <span style={{ color: '#8A9BA8' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => navigate(`/patients/${p.id}/edit`)}
                          style={{ background: '#EFF6FF', border: 'none', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#1D4ED8', fontSize: 13 }}>✏️</button>
                        {canDelete && (
                          <button onClick={() => deletePatient(p.id)}
                            style={{ background: '#FEE2E2', border: 'none', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#DC2626', fontSize: 13 }}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#8A9BA8', padding: 40 }}>Nessun paziente trovato</p>}
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
    const lastIntervention = interventions[0];
    await supabase.from('nrs_measurements').insert({
      patient_id: id,
      intervention_id: lastIntervention?.id,
      nrs_value: nrsValue,
      therapy_administered: therapy || null,
      notes: notes || null,
      measured_at: new Date().toISOString(),
      recorded_by: profile?.id,
    });
    setNrsValue(null); setTherapy(''); setNotes('');
    await fetchAll();
    setSaving(false);
  };

  const deleteNRS = async (nrsId: string) => {
    if (!window.confirm('Eliminare questa rilevazione?')) return;
    await supabase.from('nrs_measurements').delete().eq('id', nrsId);
    setMeasurements(prev => prev.filter(m => m.id !== nrsId));
  };

  const deleteIntervention = async (iId: string) => {
    if (!window.confirm('Eliminare questo intervento?')) return;
    await supabase.from('interventions').delete().eq('id', iId);
    setInterventions(prev => prev.filter(i => i.id !== iId));
  };

  if (!patient) return <div style={{ textAlign: 'center', padding: 60, color: '#8A9BA8' }}>Caricamento...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/patients')} style={{ background: 'none', border: 'none', color: '#1A5F7A', fontSize: 20, cursor: 'pointer' }}>←</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: '#1A2730' }}>{patient.last_name} {patient.first_name}</h1>
            <p style={{ margin: 0, color: '#8A9BA8', fontSize: 14 }}>{patient.ward} · Letto {patient.bed || '-'} · {patient.admission_number}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/patients/${id}/edit`)}
            style={{ background: '#EFF6FF', border: 'none', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', color: '#1D4ED8', fontWeight: 600 }}>✏️ Modifica</button>
          {canDelete && (
            <button onClick={async () => { if (window.confirm('Eliminare paziente?')) { await supabase.from('patients').delete().eq('id', id); navigate('/patients'); }}}
              style={{ background: '#FEE2E2', border: 'none', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', color: '#DC2626', fontWeight: 600 }}>🗑 Elimina</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, backgroundColor: '#fff', borderRadius: 12, padding: 4, width: 'fit-content', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        {[['nrs', '📊 NRS'], ['info', '👤 Info'], ['interventions', '🔧 Interventi']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as any)}
            style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              backgroundColor: tab === t ? '#1A5F7A' : 'transparent',
              color: tab === t ? '#fff' : '#8A9BA8' }}>
            {label}
          </button>
        ))}
      </div>

      {/* NRS Tab */}
      {tab === 'nrs' && (
        <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Inserimento NRS */}
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1A2730' }}>+ Nuova Rilevazione</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => setNrsValue(n)}
                  style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${getNrsColor(n)}`,
                    backgroundColor: nrsValue === n ? getNrsColor(n) : 'transparent',
                    color: nrsValue === n ? '#fff' : getNrsColor(n),
                    fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
                  {n}
                </button>
              ))}
            </div>
            <input value={therapy} onChange={e => setTherapy(e.target.value)} placeholder="Terapia somministrata"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', marginBottom: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', marginBottom: 12, fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: 80 }} />
            <button onClick={saveNRS} disabled={saving || nrsValue === null}
              style={{ width: '100%', padding: 12, backgroundColor: nrsValue !== null ? '#1A5F7A' : '#D0E3EC', color: '#fff', border: 'none', borderRadius: 10, cursor: nrsValue !== null ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15 }}>
              {saving ? 'Salvataggio...' : '💾 Salva Rilevazione'}
            </button>
          </div>

          {/* Lista NRS */}
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxHeight: 500, overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1A2730' }}>Rilevazioni Recenti</h3>
            {measurements.length === 0 ? <p style={{ color: '#8A9BA8', textAlign: 'center' }}>Nessuna rilevazione</p> : (
              measurements.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0F4F8' }}>
                  <span style={{ backgroundColor: getNrsBg(m.nrs_value), color: getNrsColor(m.nrs_value), padding: '6px 14px', borderRadius: 20, fontWeight: 800, fontSize: 18, minWidth: 44, textAlign: 'center' }}>
                    {m.nrs_value}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#6B7280' }}>{format(parseISO(m.measured_at), 'dd/MM/yyyy HH:mm')}</div>
                    {m.therapy_administered && <div style={{ fontSize: 12, color: '#57C5B6' }}>💊 {m.therapy_administered}</div>}
                    {m.notes && <div style={{ fontSize: 12, color: '#8A9BA8' }}>{m.notes}</div>}
                  </div>
                  {canDeleteNRS && (
                    <button onClick={() => deleteNRS(m.id)}
                      style={{ background: '#FEE2E2', border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', color: '#DC2626' }}>🗑</button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Info Tab */}
      {tab === 'info' && (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxWidth: 600 }}>
          {[
            ['Nome', `${patient.first_name} ${patient.last_name}`],
            ['Data di nascita', patient.date_of_birth],
            ['Codice Fiscale', patient.fiscal_code || '-'],
            ['Sesso', patient.gender || '-'],
            ['N° Ricovero', patient.admission_number],
            ['Reparto', patient.ward],
            ['Letto', patient.bed || '-'],
            ['Data ricovero', patient.admission_date],
            ['Peso', patient.weight_kg ? `${patient.weight_kg} kg` : '-'],
            ['Altezza', patient.height_cm ? `${patient.height_cm} cm` : '-'],
            ['Classe ASA', patient.asa_class ? `ASA ${patient.asa_class}` : '-'],
            ['Allergie', patient.allergies || '-'],
            ['Note', patient.notes || '-'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #F0F4F8' }}>
              <div style={{ width: 160, fontSize: 13, color: '#8A9BA8', fontWeight: 600 }}>{label}</div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: label === 'Allergie' && value !== '-' ? 700 : 400,
                color: label === 'Allergie' && value !== '-' ? '#EF4444' : '#1A2730' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Interventions Tab */}
      {tab === 'interventions' && (
        <div>
          {(profile?.role === 'medico' || profile?.role === 'admin') && (
            <button onClick={() => navigate(`/patients/${id}/interventions/new`)}
              style={{ backgroundColor: '#1A5F7A', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, marginBottom: 16 }}>
              + Aggiungi Intervento
            </button>
          )}
          {interventions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8A9BA8' }}>Nessun intervento registrato</div>
          ) : (
            interventions.map((i: any) => (
              <div key={i.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', color: '#1A2730' }}>{i.intervention_name}</h3>
                    {i.intervention_subtype && <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{i.intervention_subtype}</span>}
                  </div>
                  {canDelete && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => navigate(`/patients/${id}/interventions/${i.id}/edit`)}
                        style={{ background: '#EFF6FF', border: 'none', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#1D4ED8' }}>✏️</button>
                      <button onClick={() => deleteIntervention(i.id)}
                        style={{ background: '#FEE2E2', border: 'none', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#DC2626' }}>🗑</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                  {[
                    ['Categoria', i.category],
                    ['Anestesia', i.anesthesia_type],
                    ['Protocollo', i.pain_protocol?.replace(/_/g, ' ')],
                    ['Chirurgo', i.surgeon || '-'],
                    ['Anestesista', i.anesthesiologist_name || '-'],
                    ['Fine intervento', i.intervention_end_time ? format(parseISO(i.intervention_end_time), 'dd/MM/yyyy HH:mm') : '-'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ backgroundColor: '#F8FAFB', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, color: '#8A9BA8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, color: '#1A2730', fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {i.postop_drugs && (
                  <div style={{ marginTop: 10, padding: 10, backgroundColor: '#F0FDF4', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>💊 Terapia post-op: </span>
                    <span style={{ fontSize: 12, color: '#166534' }}>{i.postop_drugs}</span>
                  </div>
                )}
                {i.intervention_end_time && (
                  <div style={{ marginTop: 8, padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8, fontSize: 12, color: '#1D4ED8' }}>
                    ⏰ NRS programmati: +6h · +12h · +24h · +48h
                  </div>
                )}
              </div>
            ))
          )}
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
  const priorityColor: Record<string, string> = { critical: '#EF4444', high: '#F59E0B', normal: '#1A5F7A' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#1A2730' }}>🔔 Notifiche {unread > 0 && <span style={{ fontSize: 16, color: '#1A5F7A' }}>({unread} non lette)</span>}</h1>
        {unread > 0 && <button onClick={markAllRead} style={{ background: '#EFF6FF', border: '1.5px solid #1A5F7A', color: '#1A5F7A', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Segna tutte come lette</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#8A9BA8', backgroundColor: '#fff', borderRadius: 16 }}>🔔 Nessuna notifica</div>
        ) : notifications.map((n: any) => (
          <div key={n.id} onClick={() => { if (!n.is_read) markRead(n.id); if (n.patient_id) navigate(`/patients/${n.patient_id}`); }}
            style={{ backgroundColor: n.is_read ? '#fff' : '#EFF6FF', borderRadius: 12, padding: 16, cursor: 'pointer', borderLeft: `4px solid ${priorityColor[n.priority] || '#1A5F7A'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>{n.type === 'nrs_alert' ? '🔴' : '⚠️'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: n.is_read ? 400 : 700, color: '#1A2730', marginBottom: 4 }}>{n.title}</div>
              <div style={{ fontSize: 13, color: '#6B7280' }}>{n.body}</div>
            </div>
            <div style={{ fontSize: 12, color: '#8A9BA8', whiteSpace: 'nowrap' }}>
              {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: it })}
            </div>
            {!n.is_read && <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: priorityColor[n.priority] || '#1A5F7A' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// PATIENT FORM (Add/Edit)
// ============================================================
function PatientFormPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
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

  // Calcola CF da anagrafica
  const computeCF = (f: typeof form) => {
    if (!f.last_name || !f.first_name || !f.date_of_birth || !f.gender || !f.birth_place) {
      alert('Compila nome, cognome, data nascita, sesso e comune di nascita');
      return;
    }
    const cf = computeCodiceFiscale(f.first_name, f.last_name, f.date_of_birth, f.gender, f.birth_place.toUpperCase().slice(0,6).padEnd(6,'X'));
    if (cf) setForm(prev => ({ ...prev, fiscal_code: cf }));
  };

  // Decodifica CF
  const decodeCF = (cf: string) => {
    if (cf.length !== 16) return;
    const decoded = decodeCodiceFiscale(cf);
    if (decoded) {
      const month = String(decoded.month).padStart(2, '0');
      const day = String(decoded.day).padStart(2, '0');
      setForm(prev => ({
        ...prev,
        date_of_birth: decoded.year + '-' + month + '-' + day,
        gender: decoded.gender,
      }));
    }
  };

  useEffect(() => {
    if (patientId) loadPatient();
  }, [patientId]);

  const loadPatient = async () => {
    const { data } = await supabase.from('patients').select('*').eq('id', patientId).single();
    if (data) setForm({
      first_name: data.first_name?.replace(/\b\w/g, (l: string) => l.toUpperCase()) || '', last_name: data.last_name?.replace(/\b\w/g, (l: string) => l.toUpperCase()) || '',
      date_of_birth: data.date_of_birth, fiscal_code: data.fiscal_code || '',
      gender: data.gender || 'M', admission_number: data.admission_number,
      ward: data.ward, bed: data.bed || '',
      admission_date: data.admission_date, allergies: data.allergies || '',
      weight_kg: data.weight_kg?.toString() || '', height_cm: data.height_cm?.toString() || '',
      asa_class: data.asa_class?.toString() || '', notes: data.notes || '',
      birth_place: data.birth_place || '', birth_province: data.birth_province || '',
    });
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.admission_number || !form.ward) {
      alert('Compila i campi obbligatori'); return;
    }
    setSaving(true);
    const payload: any = {
      first_name: form.first_name.trim().replace(/\b\w/g, l => l.toUpperCase()), last_name: form.last_name.trim().replace(/\b\w/g, l => l.toUpperCase()),
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
      if (error) { alert('Errore update: ' + error.message); setSaving(false); return; }
      navigate('/patients/' + patientId);
    } else {
      const { data, error } = await supabase.from('patients').insert(payload).select().single();
      if (error) { alert('Errore insert: ' + error.message); setSaving(false); return; }
      navigate('/patients/' + data?.id);
    }
    setSaving(false);
  };

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#8A9BA8', marginBottom: 6, textTransform: 'uppercase' as const };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#1A2730' }}>{patientId ? '✏️ Modifica Paziente' : '+ Nuovo Paziente'}</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: '#F0F4F8', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ background: '#1A5F7A', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Salvataggio...' : '💾 Salva'}
          </button>
        </div>
      </div>

      <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A5F7A' }}>👤 Anagrafica</h3>
          {([['Nome *', 'first_name'], ['Cognome *', 'last_name'], ['Data di nascita (YYYY-MM-DD) *', 'date_of_birth'], ['Codice Fiscale', 'fiscal_code']] as [string,string][]).map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Sesso</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['M', 'F', 'altro'].map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, gender: g }))}
                  style={{ padding: '8px 20px', borderRadius: 20, border: '2px solid ' + (form.gender === g ? '#1A5F7A' : '#D0E3EC'), backgroundColor: form.gender === g ? '#1A5F7A' : '#fff', color: form.gender === g ? '#fff' : '#1A2730', cursor: 'pointer', fontWeight: 600 }}>
                  {g === 'M' ? '♂ M' : g === 'F' ? '♀ F' : '⚧ Altro'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A5F7A' }}>🏥 Ricovero</h3>
          {[['N° Ricovero *', 'admission_number'], ['Reparto *', 'ward'], ['Letto', 'bed'], ['Data ricovero (YYYY-MM-DD)', 'admission_date']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
            </div>
          ))}
          <h3 style={{ margin: '16px 0', color: '#1A5F7A' }}>🩺 Dati Clinici</h3>
          {[['Peso (kg)', 'weight_kg'], ['Altezza (cm)', 'height_cm']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{label}</label>
              <input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Classe ASA</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['1','2','3','4','5'].map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, asa_class: f.asa_class === c ? '' : c }))}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `2px solid ${form.asa_class === c ? '#1A5F7A' : '#D0E3EC'}`, backgroundColor: form.asa_class === c ? '#1A5F7A' : '#fff', color: form.asa_class === c ? '#fff' : '#1A2730', cursor: 'pointer', fontWeight: 600 }}>
                  ASA {c}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>⚠️ Allergie</label>
            <textarea value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Note</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STATS PAGE (placeholder)
// ============================================================
function StatsPage() {
  const [stats, setStats] = useState<any>({ nrsTrend: [], wardCounts: [], categories: [], missing: [] });
  const [period, setPeriod] = useState(7);

  useEffect(() => { fetchStats(); }, [period]);

  const fetchStats = async () => {
    const since = new Date(Date.now() - period * 24 * 3600000).toISOString();
    const [pRes, iRes, mRes] = await Promise.all([
      supabase.from('patients').select('ward').eq('is_active', true),
      supabase.from('interventions').select('category, intervention_subtype, intervention_name').gte('created_at', since),
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
      day, avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
      high: vals.filter(v => v >= 7).length, total: vals.length,
    }));

    setStats({
      wardCounts: Object.entries(wardMap).map(([ward, count]) => ({ ward, count })),
      categories: Object.entries(catMap).map(([cat, count]) => ({ cat, count })).sort((a: any, b: any) => b.count - a.count),
      nrsTrend,
    });
  };

  const maxWard = Math.max(...stats.wardCounts.map((w: any) => w.count), 1);
  const maxCat = Math.max(...stats.categories.map((c: any) => c.count), 1);
  const totalNRS = stats.nrsTrend.reduce((a: number, d: any) => a + d.total, 0);
  const highNRS = stats.nrsTrend.reduce((a: number, d: any) => a + d.high, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#1A2730' }}>📈 Statistiche</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {[7, 14, 30].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '8px 20px', borderRadius: 20, border: `2px solid ${period === p ? '#1A5F7A' : '#D0E3EC'}`, backgroundColor: period === p ? '#1A5F7A' : '#fff', color: period === p ? '#fff' : '#1A2730', cursor: 'pointer', fontWeight: 600 }}>
              {p} giorni
            </button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 768 ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { icon: '🏥', label: 'Pazienti attivi', value: stats.wardCounts.reduce((a: number, w: any) => a + w.count, 0), color: '#1A5F7A' },
          { icon: '📊', label: `Rilevazioni (${period}gg)`, value: totalNRS, color: '#57C5B6' },
          { icon: '🔴', label: 'Alert NRS elevati', value: `${totalNRS > 0 ? Math.round(highNRS / totalNRS * 100) : 0}%`, color: '#EF4444' },
        ].map(k => (
          <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 13, color: '#8A9BA8', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Pazienti per reparto */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A2730' }}>🏥 Pazienti per Reparto</h3>
          {stats.wardCounts.length === 0 ? <p style={{ color: '#8A9BA8' }}>Nessun dato</p> :
            stats.wardCounts.map((w: any) => (
              <div key={w.ward} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 100, fontSize: 13, color: '#6B7280' }}>{w.ward}</div>
                <div style={{ flex: 1, height: 20, backgroundColor: '#F0F4F8', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(w.count / maxWard) * 100}%`, backgroundColor: '#1A5F7A', borderRadius: 10 }} />
                </div>
                <div style={{ width: 24, fontWeight: 700, color: '#1A2730', textAlign: 'right' }}>{w.count}</div>
              </div>
            ))
          }
        </div>

        {/* Tipi di intervento */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A2730' }}>🔧 Tipi di Intervento</h3>
          {stats.categories.length === 0 ? <p style={{ color: '#8A9BA8' }}>Nessun dato</p> :
            stats.categories.map((c: any) => (
              <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 100, fontSize: 13, color: '#6B7280' }}>{c.cat}</div>
                <div style={{ flex: 1, height: 20, backgroundColor: '#F0F4F8', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c.count / maxCat) * 100}%`, backgroundColor: '#57C5B6', borderRadius: 10 }} />
                </div>
                <div style={{ width: 24, fontWeight: 700, color: '#1A2730', textAlign: 'right' }}>{c.count}</div>
              </div>
            ))
          }
        </div>

        {/* Andamento NRS */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A2730' }}>📊 Andamento NRS Medio</h3>
          {stats.nrsTrend.length === 0 ? <p style={{ color: '#8A9BA8' }}>Nessun dato</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
              {stats.nrsTrend.map((d: any) => (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 11, color: '#8A9BA8' }}>{parseFloat(d.avg).toFixed(1)}</div>
                  <div style={{ width: '100%', backgroundColor: getNrsColor(parseFloat(d.avg)), borderRadius: '4px 4px 0 0', height: `${(parseFloat(d.avg) / 10) * 80}px` }} />
                  <div style={{ fontSize: 10, color: '#8A9BA8', whiteSpace: 'nowrap' }}>{d.day.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EXPORT PAGE
// ============================================================
function ExportPage() {
  const [loading, setLoading] = useState<string|null>(null);

  const toCSV = (data: any[]) => {
    if (!data?.length) return 'Nessun dato\n';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => {
      const v = row[h] ?? '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
    }).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  const exportData = async (table: string, label: string) => {
    setLoading(table);
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    const csv = toCSV(data || []);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `APS_${label}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(null);
  };

  const tables = [
    { id: 'patients', label: 'Pazienti', icon: '👥' },
    { id: 'interventions', label: 'Interventi', icon: '🔧' },
    { id: 'nrs_measurements', label: 'Rilevazioni NRS', icon: '📊' },
    { id: 'notifications', label: 'Notifiche', icon: '🔔' },
    { id: 'profiles', label: 'Utenti', icon: '👤' },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, color: '#1A2730' }}>📊 Export Dati CSV</h1>
      <div style={{ backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, marginBottom: 24, color: '#1D4ED8', fontSize: 14 }}>
        📋 I file CSV sono compatibili con Excel, Numbers e Google Sheets. Include il BOM UTF-8 per la corretta visualizzazione dei caratteri italiani.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {tables.map(t => (
          <div key={t.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1A2730', marginBottom: 8 }}>{t.label}</div>
            <button onClick={() => exportData(t.id, t.label)} disabled={!!loading}
              style={{ backgroundColor: '#1A5F7A', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, width: '100%' }}>
              {loading === t.id ? 'Esportando...' : '⬇️ Scarica CSV'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: 12, backgroundColor: '#FEF9C3', borderRadius: 10, color: '#854D0E', fontSize: 13 }}>
        ⚠️ I dati esportati sono sensibili. Gestirli nel rispetto del GDPR.
      </div>
    </div>
  );
}

// ============================================================
// USERS PAGE (admin only)
// ============================================================
function UsersPage() {
  const { profile } = useAuth();
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
    const { data } = await supabase.from('profiles').select('*').order('last_name');
    setUsers(data || []);
    setLoading(false);
  };

  const callFn = async (body: any) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { alert('Sessione scaduta, rieffettua il login'); return {}; }
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pZ29rYXptb2NkZnVmanh4eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDU2NjgsImV4cCI6MjA4NzgyMTY2OH0.e_c2CHXgsTbeMaF0m3dYtc_eMnoGTjOWuot-1BIqgYM' },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const createUser = async () => {
    if (!form.email || !form.password || !form.firstName || !form.lastName) {
      alert('Compila tutti i campi obbligatori');
      return;
    }
    setSaving(true);
    const res = await callFn({
      action: 'create',
      email: form.email,
      password: form.password,
      role: form.role,
      firstName: form.firstName,
      lastName: form.lastName,
      department: form.department,
      badgeNumber: form.badgeNumber,
      phone: form.phone,
    });
    setSaving(false);
    if (res.error) { alert('Errore: ' + res.error); return; }
    setShowForm(false);
    setForm({ email: '', password: '', role: 'infermiere', firstName: '', lastName: '', department: '', badgeNumber: '', phone: '' });
    fetchUsers();
  };

  const updateRole = async (userId: string, role: string) => {
    const res = await callFn({ action: 'update_role', userId, role });
    if (res.error) alert('Errore: ' + res.error);
    else fetchUsers();
  };

  const toggleActive = async (userId: string) => {
    const res = await callFn({ action: 'toggle_active', userId });
    if (res.error) alert('Errore: ' + res.error);
    else fetchUsers();
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { alert('Password minimo 6 caratteri'); return; }
    setSaving(true);
    const res = await callFn({ action: 'reset_password', userId: resetUser.id, password: newPassword });
    setSaving(false);
    if (res.error) { alert('Errore: ' + res.error); return; }
    setResetUser(null);
    setNewPassword('');
    alert('Password aggiornata!');
  };

  const roleColor: Record<string, string> = { admin: '#7C3AED', medico: '#1A5F7A', infermiere: '#57C5B6', paziente: '#F59E0B' };
  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#8A9BA8', marginBottom: 6, textTransform: 'uppercase' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#1A2730' }}>Gestione Utenti</h1>
        <button onClick={() => setShowForm(true)} style={{ backgroundColor: '#1A5F7A', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>+ Nuovo Utente</button>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 32, width: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', color: '#1A2730' }}>Nuovo Utente</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([['Nome *', 'firstName'], ['Cognome *', 'lastName'], ['Email *', 'email'], ['Password *', 'password'], ['Reparto', 'department'], ['Badge', 'badgeNumber'], ['Telefono', 'phone']] as [string,string][]).map(([label, key]) => (
                <div key={key} style={{ gridColumn: ['email','password'].includes(key) ? '1 / -1' : 'auto' }}>
                  <label style={lbl}>{label}</label>
                  <input
                    type={key === 'password' ? 'password' : 'text'}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inp}
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Ruolo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['admin','medico','infermiere','paziente'].map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                      style={{ padding: '8px 16px', borderRadius: 20, border: '2px solid ' + (form.role === r ? roleColor[r] : '#D0E3EC'), backgroundColor: form.role === r ? roleColor[r] : '#fff', color: form.role === r ? '#fff' : '#1A2730', cursor: 'pointer', fontWeight: 600 }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, background: '#F0F4F8', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
              <button onClick={createUser} disabled={saving} style={{ flex: 1, padding: 12, background: '#1A5F7A', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Creazione...' : 'Crea Utente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 32, width: 400 }}>
            <h2 style={{ margin: '0 0 8px', color: '#1A2730' }}>Reset Password</h2>
            <p style={{ color: '#6B7280', marginBottom: 16 }}>{resetUser.first_name} {resetUser.last_name}</p>
            <label style={lbl}>Nuova Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimo 6 caratteri" style={{ ...inp, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setResetUser(null); setNewPassword(''); }} style={{ flex: 1, padding: 12, background: '#F0F4F8', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
              <button onClick={resetPassword} disabled={saving} style={{ flex: 1, padding: 12, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                {saving ? 'Aggiornamento...' : 'Aggiorna Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#8A9BA8' }}>Caricamento...</p> : (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#F8FAFB' }}>
              <tr>
                {['Utente', 'Email', 'Ruolo', 'Reparto', 'Badge', 'Stato', 'Azioni'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#8A9BA8', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #F0F4F8' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1A2730' }}>{u.last_name} {u.first_name}</td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 13 }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 8, border: '1.5px solid ' + (roleColor[u.role] || '#D0E3EC'), color: roleColor[u.role] || '#1A2730', fontWeight: 700, cursor: 'pointer', outline: 'none', backgroundColor: (roleColor[u.role] || '#D0E3EC') + '20' }}>
                      {['admin','medico','infermiere','paziente'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 13 }}>{u.department || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: 13 }}>{u.badge_number || '-'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, backgroundColor: u.is_active ? '#DCFCE7' : '#FEE2E2', color: u.is_active ? '#166534' : '#DC2626' }}>
                      {u.is_active ? 'Attivo' : 'Disattivo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setResetUser(u)} title="Reset password"
                        style={{ background: '#FEF3C7', border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', color: '#92400E', fontSize: 13 }}>🔑</button>
                      {u.id !== profile?.id && (
                        <button onClick={() => toggleActive(u.id)}
                          style={{ background: u.is_active ? '#FEE2E2' : '#DCFCE7', border: 'none', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', color: u.is_active ? '#DC2626' : '#166534', fontSize: 13 }}>
                          {u.is_active ? '🚫' : '✅'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const all = [...cons, ...vows, 'X', 'X', 'X'];
  return all.slice(0, 3).join('');
}

function cfSurnameCode(surname: string): string {
  const s = surname.toUpperCase().replace(/[^A-Z]/g, '');
  const cons = s.split('').filter(c => CF_CONSONANTS.includes(c));
  const vows = s.split('').filter(c => CF_VOWELS.includes(c));
  const all = [...cons, ...vows, 'X', 'X', 'X'];
  return all.slice(0, 3).join('');
}

function cfCheckCode(cf15: string): string {
  let sum = 0;
  cf15.split('').forEach((c, i) => {
    if ((i + 1) % 2 === 0) sum += CF_ODD[c] !== undefined ? 0 : 0; // even: direct
    sum += (i + 1) % 2 === 0 ? (isNaN(Number(c)) ? c.charCodeAt(0) - 65 : Number(c)) : (CF_ODD[c] ?? 0);
  });
  // recalculate properly
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
    const [year, month, day] = dob.split('-').map(Number);
    const surnCode = cfSurnameCode(lastName);
    const nameCode = cfNameCode(firstName);
    const yearCode = String(year).slice(-2);
    const monthCode = CF_MONTHS[month] || 'A';
    const dayCode = gender === 'F' ? String(day + 40).padStart(2, '0') : String(day).padStart(2, '0');
    const cf15 = surnCode + nameCode + yearCode + monthCode + dayCode + belfiore;
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
    const day = gender === 'F' ? dayRaw - 40 : dayRaw;
    return { year, month, day, gender };
  } catch(e) { return null; }
}

// ============================================================
// COMUNE SEARCH con autocomplete e codice Belfiore
// ============================================================
function ComuneSearch({ value, belfiore, onChange }: { value: string; belfiore: string; onChange: (comune: string, belfiore: string) => void }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(!!value);

  useEffect(() => {
    if (value && belfiore) { setQuery(value); setSelected(true); }
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    setSelected(false);
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch('https://axqvoqvjlslnsjaefhbz.supabase.co/functions/v1/comuni-search?q=' + encodeURIComponent(q));
      // Fallback: usa lista statica se API non disponibile
      const comuni = COMUNI_IT.filter(c => c.nome.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8);
      setResults(comuni);
    } catch(e) {
      const comuni = COMUNI_IT.filter(c => c.nome.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8);
      setResults(comuni);
    }
    setLoading(false);
  };

  const select = (comune: any) => {
    setQuery(comune.nome);
    setSelected(true);
    setResults([]);
    onChange(comune.nome, comune.belfiore);
  };

  return (
    <div style={{ marginBottom: 14, position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#8A9BA8', marginBottom: 6, textTransform: 'uppercase' as const }}>
        Comune di Nascita {belfiore && <span style={{ color: '#1A5F7A', fontFamily: 'monospace' }}>({belfiore})</span>}
      </label>
      <input
        value={query}
        onChange={e => search(e.target.value)}
        placeholder="Digita il comune..."
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + (selected ? '#57C5B6' : '#D0E3EC'), fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
      />
      {loading && <div style={{ fontSize: 12, color: '#8A9BA8', marginTop: 4 }}>Ricerca...</div>}
      {results.length > 0 && !selected && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 240, overflowY: 'auto' as const, border: '1px solid #E5EEF3' }}>
          {results.map((c: any) => (
            <div key={c.belfiore} onClick={() => select(c)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F0F4F8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F0F9FF')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
              <span style={{ fontWeight: 600, color: '#1A2730' }}>{c.nome}</span>
              <span style={{ fontSize: 12, color: '#8A9BA8', fontFamily: 'monospace' }}>{c.belfiore} · {c.provincia}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lista comuni italiani (principali) con codice Belfiore
const COMUNI_IT = [
  {nome:'Agrigento',belfiore:'A089',provincia:'AG'},{nome:'Alessandria',belfiore:'A182',provincia:'AL'},
  {nome:'Ancona',belfiore:'A271',provincia:'AN'},{nome:'Andria',belfiore:'A285',provincia:'BT'},
  {nome:'Aosta',belfiore:'A326',provincia:'AO'},{nome:'Arezzo',belfiore:'A390',provincia:'AR'},
  {nome:'Ascoli Piceno',belfiore:'A462',provincia:'AP'},{nome:'Asti',belfiore:'A479',provincia:'AT'},
  {nome:'Avellino',belfiore:'A509',provincia:'AV'},{nome:'Bari',belfiore:'A662',provincia:'BA'},
  {nome:'Barletta',belfiore:'A669',provincia:'BT'},{nome:'Belluno',belfiore:'A757',provincia:'BL'},
  {nome:'Benevento',belfiore:'A783',provincia:'BN'},{nome:'Bergamo',belfiore:'A794',provincia:'BG'},
  {nome:'Biella',belfiore:'A859',provincia:'BI'},{nome:'Bologna',belfiore:'A944',provincia:'BO'},
  {nome:'Bolzano',belfiore:'A952',provincia:'BZ'},{nome:'Brescia',belfiore:'B157',provincia:'BS'},
  {nome:'Brindisi',belfiore:'B180',provincia:'BR'},{nome:'Cagliari',belfiore:'B354',provincia:'CA'},
  {nome:'Caltanissetta',belfiore:'B429',provincia:'CL'},{nome:'Campobasso',belfiore:'B519',provincia:'CB'},
  {nome:'Caserta',belfiore:'B963',provincia:'CE'},{nome:'Catania',belfiore:'C351',provincia:'CT'},
  {nome:'Catanzaro',belfiore:'C352',provincia:'CZ'},{nome:'Chieti',belfiore:'C632',provincia:'CH'},
  {nome:'Como',belfiore:'C933',provincia:'CO'},{nome:'Cosenza',belfiore:'D086',provincia:'CS'},
  {nome:'Cremona',belfiore:'D150',provincia:'CR'},{nome:'Crotone',belfiore:'D122',provincia:'KR'},
  {nome:'Cuneo',belfiore:'D205',provincia:'CN'},{nome:'Enna',belfiore:'C342',provincia:'EN'},
  {nome:'Fermo',belfiore:'D542',provincia:'FM'},{nome:'Ferrara',belfiore:'D548',provincia:'FE'},
  {nome:'Firenze',belfiore:'D612',provincia:'FI'},{nome:'Foggia',belfiore:'D643',provincia:'FG'},
  {nome:'Forlì',belfiore:'D704',provincia:'FC'},{nome:'Frosinone',belfiore:'D810',provincia:'FR'},
  {nome:'Genova',belfiore:'D969',provincia:'GE'},{nome:'Gorizia',belfiore:'E098',provincia:'GO'},
  {nome:'Grosseto',belfiore:'E202',provincia:'GR'},{nome:'Imperia',belfiore:'E290',provincia:'IM'},
  {nome:'Isernia',belfiore:'E335',provincia:'IS'},{nome:"L'Aquila",belfiore:'A345',provincia:'AQ'},
  {nome:'La Spezia',belfiore:'E463',provincia:'SP'},{nome:'Latina',belfiore:'E472',provincia:'LT'},
  {nome:'Lecce',belfiore:'E506',provincia:'LE'},{nome:'Lecco',belfiore:'E507',provincia:'LC'},
  {nome:'Livorno',belfiore:'E625',provincia:'LI'},{nome:'Lodi',belfiore:'E648',provincia:'LO'},
  {nome:'Lucca',belfiore:'E715',provincia:'LU'},{nome:'Macerata',belfiore:'E783',provincia:'MC'},
  {nome:'Mantova',belfiore:'E897',provincia:'MN'},{nome:'Massa',belfiore:'F023',provincia:'MS'},
  {nome:'Matera',belfiore:'F052',provincia:'MT'},{nome:'Messina',belfiore:'F158',provincia:'ME'},
  {nome:'Milano',belfiore:'F205',provincia:'MI'},{nome:'Modena',belfiore:'F257',provincia:'MO'},
  {nome:'Monza',belfiore:'F704',provincia:'MB'},{nome:'Napoli',belfiore:'F839',provincia:'NA'},
  {nome:'Novara',belfiore:'F952',provincia:'NO'},{nome:'Nuoro',belfiore:'F979',provincia:'NU'},
  {nome:'Oristano',belfiore:'G113',provincia:'OR'},{nome:'Padova',belfiore:'G224',provincia:'PD'},
  {nome:'Palermo',belfiore:'G273',provincia:'PA'},{nome:'Parma',belfiore:'G337',provincia:'PR'},
  {nome:'Pavia',belfiore:'G388',provincia:'PV'},{nome:'Perugia',belfiore:'G478',provincia:'PG'},
  {nome:'Pesaro',belfiore:'G479',provincia:'PU'},{nome:'Pescara',belfiore:'G482',provincia:'PE'},
  {nome:'Piacenza',belfiore:'G535',provincia:'PC'},{nome:'Pisa',belfiore:'G702',provincia:'PI'},
  {nome:'Pistoia',belfiore:'G713',provincia:'PT'},{nome:'Pordenone',belfiore:'G888',provincia:'PN'},
  {nome:'Potenza',belfiore:'G942',provincia:'PZ'},{nome:'Prato',belfiore:'G999',provincia:'PO'},
  {nome:'Ragusa',belfiore:'H163',provincia:'RG'},{nome:'Ravenna',belfiore:'H199',provincia:'RA'},
  {nome:'Reggio Calabria',belfiore:'H224',provincia:'RC'},{nome:'Reggio Emilia',belfiore:'H223',provincia:'RE'},
  {nome:'Rieti',belfiore:'H282',provincia:'RI'},{nome:'Rimini',belfiore:'H294',provincia:'RN'},
  {nome:'Roma',belfiore:'H501',provincia:'RM'},{nome:'Rovigo',belfiore:'H620',provincia:'RO'},
  {nome:'Salerno',belfiore:'H703',provincia:'SA'},{nome:'Sassari',belfiore:'I452',provincia:'SS'},
  {nome:'Savona',belfiore:'I480',provincia:'SV'},{nome:'Siena',belfiore:'I726',provincia:'SI'},
  {nome:'Siracusa',belfiore:'I754',provincia:'SR'},{nome:'Sondrio',belfiore:'I829',provincia:'SO'},
  {nome:'Sud Sardegna',belfiore:'M209',provincia:'SU'},{nome:'Taranto',belfiore:'L049',provincia:'TA'},
  {nome:'Teramo',belfiore:'L103',provincia:'TE'},{nome:'Terni',belfiore:'L117',provincia:'TR'},
  {nome:'Torino',belfiore:'L219',provincia:'TO'},{nome:'Trani',belfiore:'L328',provincia:'BT'},
  {nome:'Trapani',belfiore:'L331',provincia:'TP'},{nome:'Trento',belfiore:'L378',provincia:'TN'},
  {nome:'Treviso',belfiore:'L407',provincia:'TV'},{nome:'Trieste',belfiore:'L424',provincia:'TS'},
  {nome:'Udine',belfiore:'L483',provincia:'UD'},{nome:'Varese',belfiore:'L682',provincia:'VA'},
  {nome:'Venezia',belfiore:'L736',provincia:'VE'},{nome:'Verbania',belfiore:'L746',provincia:'VB'},
  {nome:'Vercelli',belfiore:'L750',provincia:'VC'},{nome:'Verona',belfiore:'L781',provincia:'VR'},
  {nome:'Vibo Valentia',belfiore:'F537',provincia:'VV'},{nome:'Vicenza',belfiore:'L840',provincia:'VI'},
  {nome:'Viterbo',belfiore:'M082',provincia:'VT'},
];


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
      category: data.category, anesthesia_type: data.anesthesia_type || '',
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
      category: form.category, anesthesia_type: form.anesthesia_type,
      anesthesia_drugs: form.anesthesia_drugs || null,
      pain_protocol: (form as any).pain_protocols?.length > 0 ? (form as any).pain_protocols.join(',') : form.pain_protocol,
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
      if (error) { alert('Errore update: ' + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('interventions').insert({ ...payload, patient_id: id, intervention_date: new Date().toISOString(), created_by: profile?.id });
      if (error) { alert('Errore insert: ' + error.message); setSaving(false); return; }
    }
    setSaving(false);
    navigate('/patients/' + id);
  };

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #D0E3EC', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: '#8A9BA8', marginBottom: 6, textTransform: 'uppercase' as const };
  const chip = (active: boolean) => ({ padding: '6px 14px', borderRadius: 20, border: '2px solid ' + (active ? '#1A5F7A' : '#D0E3EC'), backgroundColor: active ? '#1A5F7A' : '#fff', color: active ? '#fff' : '#1A2730', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' as const, marginBottom: 4 });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#1A2730' }}>{isEdit ? 'Modifica Intervento' : 'Nuovo Intervento'}</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: '#F0F4F8', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ background: '#1A5F7A', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>

      <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A5F7A' }}>Intervento</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Categoria</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIES.map(c => <button key={c} onClick={() => set('category', c)} style={chip(form.category === c)}>{c}</button>)}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Tipo Specifico</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(SUBTYPES[form.category] || []).map(s => (
                <button key={s} onClick={() => { const v = form.intervention_subtype === s ? '' : s; set('intervention_subtype', v); if (v) set('intervention_name', v); }} style={chip(form.intervention_subtype === s)}>{s}</button>
              ))}
            </div>
            <input value={form.intervention_subtype} onChange={e => set('intervention_subtype', e.target.value)} placeholder="Oppure scrivi tipo specifico..." style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Nome Intervento *</label>
            <input value={form.intervention_name} onChange={e => set('intervention_name', e.target.value)} style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Chirurgo</label>
            <input value={form.surgeon} onChange={e => set('surgeon', e.target.value)} style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Anestesista</label>
            <input value={form.anesthesiologist_name} onChange={e => set('anesthesiologist_name', e.target.value)} style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Fine Intervento</label>
            <input type="datetime-local" value={form.intervention_end_time} onChange={e => set('intervention_end_time', e.target.value)} style={inp} />
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>NRS programmati a 6, 12, 24 e 48 ore</div>
          </div>
          <div>
            <label style={lbl}>Soglia Alert NRS</label>
            <input type="number" min="0" max="10" value={form.nrs_alert_threshold} onChange={e => set('nrs_alert_threshold', e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1A5F7A' }}>Anestesia</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Tipo Anestesia (selezione multipla)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ANESTHESIAS.map(a => {
                const selected = form.anesthesia_types.includes(a);
                return (
                  <button key={a} onClick={() => {
                    const updated = selected ? form.anesthesia_types.filter(x => x !== a) : [...form.anesthesia_types, a];
                    setForm(f => ({ ...f, anesthesia_types: updated }));
                  }} style={chip(selected)}>{a}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Farmaci Anestesia</label>
            <textarea value={form.anesthesia_drugs} onChange={e => set('anesthesia_drugs', e.target.value)} placeholder="Propofol, Fentanyl..." style={{ ...inp, minHeight: 70, resize: 'vertical' }} />
          </div>
          <h3 style={{ margin: '0 0 16px', color: '#1A5F7A' }}>Terapia Dolore</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Protocollo Dolore (selezione multipla)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PROTOCOLS.map(p => {
                const selected = ((form as any).pain_protocols || []).includes(p);
                return (
                  <button key={p} onClick={() => {
                    const current = (form as any).pain_protocols || [];
                    const updated = selected ? current.filter((x: string) => x !== p) : [...current, p];
                    setForm((f: any) => ({ ...f, pain_protocols: updated }));
                  }} style={chip(selected)}>{p.replace(/_/g, ' ')}</button>
                );
              })}
            </div>
          </div>
          {showRegional && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Blocchi Effettuati</label>
                <textarea value={form.regional_blocks} onChange={e => set('regional_blocks', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Farmaci Locoregionali</label>
                <textarea value={form.regional_drugs} onChange={e => set('regional_drugs', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
              </div>
            </>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Terapia Post-Operatoria</label>
            <textarea value={form.postop_drugs} onChange={e => set('postop_drugs', e.target.value)} style={{ ...inp, minHeight: 80, resize: 'vertical' }} />
          </div>
          <div>
            <label style={lbl}>Note</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP ROUTER
// ============================================================
function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A5F7A' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🩺</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>APS Manager</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>Caricamento...</div>
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

// placeholder - will be replaced
