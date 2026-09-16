import { request, type User } from '../../lib/api';
import { BrandHeader } from '../../components/BrandHeader';
import { AdminProvisioning } from '../admin/AdminProvisioning';
import { AdminUsers } from '../admin/AdminUsers';
import { PatientProfile } from '../patient/PatientProfile';
import { StaffClinicalWorkspace } from '../clinical/StaffClinicalWorkspace';

export function AuthenticatedLanding({ user, onLogout }: { user: User; onLogout: () => void }) {
  const logout = async () => { try { await request('/auth/logout', { method: 'POST' }); } catch { /* keep local logout resilient when the API is unavailable */ } onLogout(); };
  const staff = user.role === 'PHYSICIAN' || user.role === 'ASSISTANT';
  return <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_right,#dceff0,transparent_38%),#f4f8fb] px-[clamp(14px,4vw,32px)] py-[clamp(20px,5vw,48px)]"><BrandHeader subtitle={user.role === 'ADMINISTRATOR' ? 'Panel de administración' : staff ? 'Espacio de personal' : 'Espacio del paciente'} action={<button className="ml-auto rounded-[9px] border border-[#b8cbd6] bg-transparent px-3 py-2 text-xs text-[#31516a]" onClick={logout}>Cerrar sesión</button>} />{user.role === 'ADMINISTRATOR' ? <><AdminProvisioning /><AdminUsers currentUserId={user.id} /></> : staff ? <StaffClinicalWorkspace physician={user.role === 'PHYSICIAN'} /> : <><h1 className="mx-auto mt-4 w-full max-w-[680px] text-2xl font-bold">Hola, {user.username}</h1><PatientProfile /></>}</div>;
}
