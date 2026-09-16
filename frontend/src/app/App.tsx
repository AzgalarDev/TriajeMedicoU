import * as React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { AuthForm } from '../features/auth/AuthForm';
import { AuthenticatedLanding } from '../features/auth/AuthenticatedLanding';
import { request, type User } from '../lib/api';
import { RecoveryForm } from '../features/auth/RecoveryForm';

export function App() {
  const [user, setUser] = React.useState<User | null>(null); const [mode, setMode] = React.useState<'login' | 'register' | 'recovery'>('login'); const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState('');
  React.useEffect(() => { request<User>('/auth/session').then(setUser).catch(() => undefined).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f4f8fb] p-4"><p className="text-[#678096]">Cargando sesión…</p></div>;
  if (user) return <AuthenticatedLanding user={user} onLogout={() => setUser(null)} />;
  return <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_right,#dceff0,transparent_38%),#f4f8fb] px-[clamp(14px,4vw,32px)] py-[clamp(20px,5vw,48px)]"><BrandHeader subtitle="Atención clara, desde el primer paso" /><main className="mx-auto w-full max-w-[480px] rounded-[clamp(16px,3vw,22px)] border border-[#dce7ee] bg-white p-[clamp(22px,5vw,34px)] shadow-[0_18px_50px_#20425d12]"><div className="mb-[clamp(20px,4vw,26px)]"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#147d7e]">Acceso seguro</p><h1 className="mb-2 text-[clamp(25px,7vw,30px)] font-bold leading-tight tracking-[-.04em]">{mode === 'recovery' ? 'Recupera tu contraseña' : mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta de paciente'}</h1><p className="leading-relaxed text-[#678096]">{mode === 'recovery' ? 'Usa tu usuario y CI para crear una nueva contraseña.' : mode === 'login' ? 'Ingresa para consultar tu espacio personal.' : 'Completa tus datos para comenzar.'}</p></div>{mode === 'recovery' ? <RecoveryForm onBack={() => setMode('login')} /> : <><AuthForm mode={mode} onSuccess={setUser} error={error} setError={setError} />{mode === 'login' && <button className="mx-auto mt-3 block border-0 bg-transparent p-1.5 text-[13px] text-[#147d7e]" onClick={() => { setMode('recovery'); setError(''); }}>¿Olvidaste tu contraseña?</button>}<button className="mx-auto mt-2 block border-0 bg-transparent p-1.5 text-[13px] text-[#147d7e]" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '¿Aún no tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}</button></>}</main></div>;
}
