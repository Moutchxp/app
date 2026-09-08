import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../lib/admin/session';
import { lireOrdreModules } from '../../../lib/admin/comptes';
import { liensVisibles, ordonner } from './menuAdmin';
import { EnTetePage } from './_composants/EnTetePage';
import { GrilleModules } from './GrilleModules';

/**
 * Tableau de bord admin. La GRILLE de tuiles dérive de `liensVisibles` — la MÊME source que le menu latéral
 * (M3-4 Lot D) : rôle d'abord, puis permissions du JWS. Un administrateur ne perd jamais une tuile. CONFORT
 * d'affichage seulement : `proxy.ts` reste la seule autorité (il refuse un accès direct par URL).
 */
export default async function AdminAccueilPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  // Le layout (protected) a déjà exigé une session valide ; défaut prudent si absente (aucune tuile).
  const session = payload ? sessionDepuisPayload(payload) : null;
  // VOIE DE SECOURS (mot de passe partagé, sub=null) : pas de compte → pas de rangement personnel. On le fait DESCENDRE en
  //   prop pour que la grille empêche le geste inutile (poignées inactives) et DISE le motif, au lieu de laisser croire à une panne.
  const secours = session ? session.sub === null : false;
  // Lecture DÉDIÉE de l'ordre personnalisé (D1 : pas de partage layout→page via children). Voie de secours
  // (sub=null) ou session absente → null → ordre par défaut. `ordonner()` = MÊME appel que le menu latéral.
  const ordreModules = session && session.sub !== null ? await lireOrdreModules(session.sub) : null;
  const tuiles = session ? ordonner(liensVisibles(session.role, session.perms), ordreModules) : [];

  return (
    <section style={{ maxWidth: 720 }}>
      <EnTetePage titre="Tableau de bord" intro="Interface d’administration interne — Sans Vis-à-Vis®." />

      {/* Grille RÉORDONNABLE (client) : la lecture de l'ordre reste SERVEUR (ci-dessus), on passe la liste
          déjà ordonnée. Le drag/persistance/accessibilité vivent dans GrilleModules ; `secours` conditionne l'empêchement honnête. */}
      <GrilleModules tuiles={tuiles} secours={secours} />
    </section>
  );
}
