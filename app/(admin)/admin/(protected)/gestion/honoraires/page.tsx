import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../../lib/admin/session';
import { EnTetePage } from '../../_composants/EnTetePage';
import { HonorairesGestion } from './HonorairesGestion';

/**
 * LOT L1 — « HONORAIRES DE GESTION » : loyer de départ × taux, par lot, par propriétaire et pour l'agence.
 *
 * 🔒 RÉSERVÉ AUX ADMINISTRATEURS (décision d'Arno, 17/10/2026). Ce garde de PAGE lit le rôle du jeton pour ne pas
 * afficher l'écran à un collaborateur ; la VRAIE barrière est la route `/api/admin/gestion/honoraires`, qui relit le
 * rôle en base à chaque appel. `proxy.ts` exige déjà le droit « Gestion » pour tout `/admin/gestion`.
 */
const INTRO_HONORAIRES =
  'Les honoraires de gestion générés par chaque lot : loyer de départ × taux de gestion. Montant théorique — '
  + 'le réel encaissé est dans WIPPIMMO.';

export default async function HonorairesPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  const administrateur = session?.role === 'administrateur';
  return (
    <section className="gst-page">
      <EnTetePage titre="Honoraires de gestion" intro={INTRO_HONORAIRES} />
      {administrateur ? <HonorairesGestion /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>
          Cet écran est réservé aux administrateurs.
        </div>
      )}
    </section>
  );
}
