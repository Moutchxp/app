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
        titre="Internautes"
        intro="Base des internautes ayant consenti au recontact. Recherche, consultation et extraction pour la relation commerciale interne — réservé aux administrateurs."
      >
        <p className="svv-page-sub">
          <strong>F1 — Recontact commercial interne</strong> : consentement <strong>requis</strong> pour figurer dans cette
          base et être exporté ou recontacté ; sans F1, une personne n’apparaît jamais ici.{' '}
          <strong>F2</strong> : communications par email. <strong>F3</strong> : ciblage publicitaire tiers (retargeting).
          Les filtres F2 et F3 s’appliquent <strong>uniquement parmi les consentants F1</strong> : ils restreignent la
          sélection, ne l’élargissent jamais.
        </p>
      </EnTetePage>
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
