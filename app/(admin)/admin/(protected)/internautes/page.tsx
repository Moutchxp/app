import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';
import { EnTetePage } from '../_composants/EnTetePage';
import { InternautesVue } from './InternautesVue';

/**
 * Module « Internautes » (LOT 3) — exploitation interne de la base nominative (recontact SVAV).
 *
 * RÉSERVÉ AU RÔLE ADMINISTRATEUR (décision du plan : plus strict que la permission `internautes` délégable ; à
 * confirmer par Arno, mais démarre strict). Le `proxy.ts` laisse la PAGE accessible à un collaborateur porteur de
 * `perm_internautes`, mais les ROUTES `/api/admin/internautes*` sont réservées à l'administrateur (défaut
 * fail-closed du proxy + `exigerAdministrateur`). Ce gate serveur aligne la PAGE sur l'API : un non-administrateur
 * voit un avis « réservé », jamais de données. INVARIANT consentement F1 actif appliqué côté serveur (extraction).
 */
export default async function InternautesPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const role = payload ? sessionDepuisPayload(payload).role : null;
  const estAdmin = role === 'administrateur';

  return (
    <section style={{ maxWidth: 960 }}>
      <EnTetePage
        titre="Internautes (Base de données)"
        intro="Base des internautes ayant consenti au recontact téléphonique dans le formulaire. Recherche, consultation et extraction pour la relation commerciale interne — réservé aux administrateurs."
      />
      {estAdmin ? (
        <InternautesVue />
      ) : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>
          Cet espace est réservé aux administrateurs.
        </div>
      )}
    </section>
  );
}
