import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';
import { EnTetePage } from '../_composants/EnTetePage';
import { chargerConfigVeille } from '../../../../lib/sitadel/veilleConfig';
import { categoriesConnues } from '../../../../lib/sitadel/priorite';
import { libelleTriCandidats } from '../../../../lib/sitadel/reglagesVeille';
import { PermisTuile } from './PermisTuile';

/**
 * Module « Permis de construire » (chantier S3) — veille des autorisations d'urbanisme (Sitadel).
 *
 * RÉSERVÉ AU RÔLE ADMINISTRATEUR — comme « Audit »/« Internautes », c'est une tuile de rôle, PAS une permission de
 * module (aucune colonne perm_* ajoutée). Le `proxy.ts` réserve déjà la page ET la route `/api/admin/permis` à
 * l'administrateur par son défaut FAIL-CLOSED (les collaborateurs sont refusés) ; ce gate serveur aligne la PAGE sur
 * l'API : un non-administrateur voit un avis « réservé », jamais de données. LECTURE SEULE (lit `sitadel_dossier`).
 */
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function PermisPage({ searchParams }: { searchParams: SearchParams }) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const estAdmin = payload ? sessionDepuisPayload(payload).role === 'administrateur' : false;
  const config = await chargerConfigVeille();

  // SURV-1 — lien direct depuis un e-mail d'alerte : `?q=<num_dau>` pré-filtre la liste des dossiers (onglet « Dossiers »).
  const sp = await searchParams;
  const qInitial = typeof sp.q === 'string' ? sp.q : '';

  // Date « depuis » par défaut = aujourd'hui − `annees_par_defaut` ans, calculée CÔTÉ SERVEUR (valeur stable → aucun
  // écart d'hydratation). La vue peut l'effacer (« depuis toujours ») pour remonter tout l'historique.
  const auj = new Date();
  const depuisParDefaut = `${auj.getFullYear() - config.anneesParDefaut}-${String(auj.getMonth() + 1).padStart(2, '0')}-${String(auj.getDate()).padStart(2, '0')}`;

  return (
    <section style={{ maxWidth: 1120 }}>
      <EnTetePage
        titre="Permis de construire"
        intro="Veille des autorisations d'urbanisme (Sitadel) : constructions, surélévations, extensions et démolitions autorisées, classées par priorité — réservé aux administrateurs."
      />
      {estAdmin ? (
        <PermisTuile depuisParDefaut={depuisParDefaut} categories={categoriesConnues(config)}
          ancienneteMaxAnnees={config.ancienneteMaxDemandeAnnees} triLibelle={libelleTriCandidats(config.triCandidats)} qInitial={qInitial} />
      ) : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>
          Cet espace est réservé aux administrateurs.
        </div>
      )}
    </section>
  );
}
