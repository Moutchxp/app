import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../lib/admin/session';
import { trouverCompteParId, lireOrdreModules } from '../../../lib/admin/comptes';
import { BoutonDeconnexion } from './BoutonDeconnexion';
/**
 * 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2 — les deux ajouts du bandeau. Tous deux sont des composants du
 * NAVIGATEUR, et il le faut : l'un ouvre une fenêtre, l'autre lit une horloge. Ce fichier reste un composant
 * serveur ; il ne fait que les poser.
 */
import { BoutonDriveBandeau } from './BoutonDriveBandeau';
import { HeureParis } from './HeureParis';
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
          {/* ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2a — LE DRIVE, À UN CLIC DE PARTOUT ════════════════
              Arno : « juste à droite de “Nom · Statut” du collaborateur connecté ». Il est donc ICI, et non dans
              le groupe poussé à droite — sa place dit à quoi il se rattache : au poste de travail, pas au compte.

              🔴 C'EST NOTRE FENÊTRE, LE MÊME COMPOSANT QUE PARTOUT AILLEURS (arborescence, renommage, corbeille).
              Voir l'encadré de `BoutonDriveBandeau` : rien n'est recopié, et la fenêtre n'est chargée qu'au clic. */}
          <BoutonDriveBandeau />
          {/* LOT ERGO-BOITE — les deux gestes de COMPTE, ensemble, en haut à droite. « Déconnexion » arrive du bas
              de la colonne de gauche, où il voisinait les modules : il n'y est pas supprimé, il est déplacé.
              `marginLeft: auto` est porté par le premier des deux, pour que la paire reste collée à droite même
              quand le lien de mot de passe est absent (voie de secours). */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            {/* ══ 🔴🔴 POINT 2b — L'HEURE DE PARIS, JUSTE AVANT « Changer mon mot de passe » ═══════════════════
                Arno : « côté droit de la même ligne, juste AVANT “Changer mon mot de passe” ». Elle est donc le
                PREMIER élément de ce groupe poussé à droite, et elle garde sa place même pour la voie de secours,
                qui ne voit pas le lien de mot de passe.

                🔴 ELLE N'EST PAS RENDUE PAR LE SERVEUR, et c'est la seule façon juste : l'heure du serveur à
                l'instant de la requête serait fausse une seconde plus tard, et différente de celle que le
                navigateur calculerait. Voir l'encadré de `HeureParis`. */}
            <HeureParis />
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
