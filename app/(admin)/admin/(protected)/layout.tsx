import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../lib/admin/session';
import { trouverCompteParId, lireOrdreModules } from '../../../lib/admin/comptes';
import { BoutonDeconnexion } from './BoutonDeconnexion';
import { Sidebar } from './Sidebar';
import { RevocationWatcher } from './RevocationWatcher';

/**
 * Coquille de l'admin (T1). Défense en profondeur : même si le proxy garde déjà
 * ces routes, on revérifie la session côté serveur ici (EX-12/EX-15).
 * En-tête de profil (M3-4 Lot C) : « Prénom Nom » + rôle pour un compte nommé ; « Accès de secours » pour la
 * voie de secours (sub=null, pas d'identité en base) — qui ne voit PAS le lien « Changer mon mot de passe »
 * (elle n'a pas de compte à modifier).
 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) {
    redirect('/admin/login');
  }

  const session = sessionDepuisPayload(payload);
  const secours = session.sub === null;
  const compte = secours ? null : await trouverCompteParId(session.sub as number);
  // Ordre personnalisé des modules (migration 030) — voie de secours (sub=null) → null → ordre par défaut.
  // `Sidebar` (client) appliquera `ordonner()`, à l'identique de la grille du tableau de bord (une source, deux rendus).
  const ordreModules = secours ? null : await lireOrdreModules(session.sub as number);
  const identite = secours
    ? 'Accès de secours'
    : compte
      ? `${compte.prenom} ${compte.nom}`
      : (session.identifiant ?? 'Compte');
  const roleLbl = session.role === 'administrateur' ? 'Administrateur' : 'Collaborateur';

  return (
    <div className="svv-adm-shell">
      <RevocationWatcher />
      <Sidebar role={session.role} perms={session.perms} ordreModules={ordreModules} />
      <div className="svv-adm-content">
        <div className="svv-adm-bandeau" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span>
            <strong>{identite}</strong> · {roleLbl}
          </span>
          {/* LOT ERGO-BOITE — les deux gestes de COMPTE, ensemble, en haut à droite. « Déconnexion » arrive du bas
              de la colonne de gauche, où il voisinait les modules : il n'y est pas supprimé, il est déplacé.
              `marginLeft: auto` est porté par le premier des deux, pour que la paire reste collée à droite même
              quand le lien de mot de passe est absent (voie de secours). */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            {!secours && (
              <a href="/admin/compte/mot-de-passe" style={{ color: 'var(--color-svv-ink)', fontWeight: 600 }}>
                Changer mon mot de passe
              </a>
            )}
            <BoutonDeconnexion />
          </span>
        </div>
        <main className="svv-adm-main">{children}</main>
      </div>
    </div>
  );
}
