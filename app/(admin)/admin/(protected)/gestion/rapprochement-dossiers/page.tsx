import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../../lib/admin/session';
import { EnTetePage } from '../../_composants/EnTetePage';
import { RapprochementDossiers } from './RapprochementDossiers';

/**
 * Tuile Gestion — « Rapprochement des dossiers clients » (Arno, 19/10/2026). RÉSERVÉ À L'ADMINISTRATEUR : le proxy exige
 * déjà le droit « Gestion » ; cette page exige en plus le rôle administrateur, comme sa route (relue en base à chaque appel).
 */
const INTRO_RAPPROCHEMENT = 'Chaque dossier copié de « Documents clients scannés » et la fiche propriétaire proposée. '
  + 'Les décisions sont enregistrées, datées et modifiables jusqu’au lot suivant ; aucune n’écrit dans le Drive.';

export default async function Page() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  const admin = session?.role === 'administrateur';
  return (
    <section className="gst-page">
      <EnTetePage titre="Rapprochement des dossiers clients" intro={INTRO_RAPPROCHEMENT} />
      {admin ? <RapprochementDossiers /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Cet écran est réservé à l’administrateur.</div>
      )}
    </section>
  );
}
