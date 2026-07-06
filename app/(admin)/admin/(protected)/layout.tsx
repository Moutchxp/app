import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NOM_COOKIE, verifierJeton } from '../../../lib/admin/session';
import { Sidebar } from './Sidebar';

/**
 * Coquille de l'admin (T1). Défense en profondeur : même si le proxy garde déjà
 * ces routes, on revérifie la session côté serveur ici (EX-12/EX-15).
 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) {
    redirect('/admin/login');
  }

  return (
    <div className="svv-adm-shell">
      <Sidebar />
      <div className="svv-adm-content">
        {/* Bandeau d'état — neutre à l'Étape 1 (EX-4). */}
        <div className="svv-adm-bandeau">Profil : —</div>
        <main className="svv-adm-main">{children}</main>
      </div>
    </div>
  );
}
