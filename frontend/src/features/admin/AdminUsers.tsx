import * as React from 'react';
import { listUsers, resetManagedPassword, updateUserIdentity, updateUserStatus, type ManagedUser } from '../../lib/api';
import { Button } from '../../components/ui/Button';

const roleLabels: Record<string, string> = {
  ADMINISTRATOR: 'Administrador',
  PHYSICIAN: 'Médico',
  ASSISTANT: 'Ayudante',
  PATIENT: 'Paciente',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  BLOCKED: 'Bloqueado',
};

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = React.useState<ManagedUser[]>([]); const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState('');
  const load = () => { setLoading(true); listUsers().then((data) => setUsers(Array.isArray(data) ? data : [])).catch((e) => setError(e.message)).finally(() => setLoading(false)); }; React.useEffect(load, []);
  const change = async (user: ManagedUser, status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') => { if (user.id === currentUserId && status !== 'ACTIVE') return; try { const updated = await updateUserStatus(user.id, status); setUsers((items) => items.map((item) => item.id === updated.id ? updated : item)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la cuenta.'); } };
  const reset = async (user: ManagedUser) => { const password = window.prompt('Nueva contraseña (mínimo 8 caracteres, con letras y números):'); if (!password) return; try { await resetManagedPassword(user.id, password); window.alert('Contraseña actualizada y sesiones revocadas.'); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la contraseña.'); } };
  const correctCi = async (user: ManagedUser) => { const nationalId = window.prompt('Nuevo CI numérico:', user.nationalId); if (!nationalId || !/^\d+$/.test(nationalId)) return; try { const updated = await updateUserIdentity(user.id, nationalId); setUsers((items) => items.map((item) => item.id === updated.id ? updated : item)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo corregir el CI.'); } };
  return <section aria-labelledby="users-title" className="mx-auto mt-6 w-full max-w-[960px] overflow-hidden rounded-[22px] border border-[#dce7ee] bg-white p-5 shadow-[0_18px_50px_#20425d12]"><h2 id="users-title" className="mb-4 text-xl font-bold">Cuentas del sistema</h2>{error && <p role="alert" className="mb-4 rounded p-3 text-sm text-[#b53b36]">{error}</p>}{loading ? <p role="status">Cargando cuentas…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Usuario</th><th className="p-3">Nombre</th><th className="p-3">Rol</th><th className="p-3">CI</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b"><td className="p-3 font-bold">{user.username}</td><td className="p-3">{user.fullName}</td><td className="p-3">{roleLabels[user.role] ?? user.role}</td><td className="p-3">{user.nationalId}</td><td className="p-3">{statusLabels[user.status ?? ''] ?? user.status}</td><td className="flex flex-wrap gap-2 p-3">{user.role !== 'ADMINISTRATOR' && <><Button type="button" onClick={() => reset(user)}>Restablecer contraseña</Button><Button type="button" onClick={() => correctCi(user)}>Corregir CI</Button></>}{user.id !== currentUserId && <Button type="button" onClick={() => change(user, user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}>{user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</Button>}</td></tr>)}</tbody></table></div>}</section>;
}
