import { cookies } from 'next/headers';
import Link from 'next/link';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';
import { EnTetePage } from '../_composants/EnTetePage';

/**
 * Module « LOCATION » — la tuile dédiée de l'accueil (demande impérative d'Arno, 17/10/2026).
 *
 * MODULE GARDÉ par `perm_location` (migration 371), sur le patron de « Gestion » : `proxy.ts` refuse déjà `/admin/location`
 * à qui n'a pas le droit ; ce garde SERVEUR aligne la page — un non-autorisé voit un avis, jamais une donnée.
 *
 * 🔴 L'ESPACE EST EN CONSTRUCTION, et la page le DIT au lieu de simuler des écrans qui n'existent pas encore : les lots
 * suivants de l'étude (biens et annexes, personnes, prospection, bail et dossier d'entrée) viendront s'y poser. Ce qui sert
 * déjà est atteignable d'ici : l'annuaire commun avec la Gestion (même fichier, mêmes cartes).
 */
const INTRO_LOCATION =
  'L’espace de l’équipe location : prospects, estimations, candidats, baux et dossiers d’entrée — sur le même fichier que la Gestion.';

export default async function LocationPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  const autorise = session?.perms.location === true;

  return (
    <section className="gst-page">
      <EnTetePage titre="Location" intro={INTRO_LOCATION} />
      {autorise ? (
        <div className="svv-card">
          <p style={{ margin: '0 0 .6rem', fontWeight: 700 }}>Cet espace est en cours de construction.</p>
          <p style={{ margin: '0 0 .6rem', color: 'var(--color-svv-muted)' }}>
            Les écrans de la Location arrivent lot par lot : biens et annexes, personnes, prospection et estimation, puis
            bail et dossier d’entrée. Ils écriront dans le même annuaire que la Gestion.
          </p>
          {session?.perms.gestion === true && (
            <p style={{ margin: 0 }}>
              En attendant, les fiches communes sont dans l’<Link href="/admin/gestion?ecran=annuaire">annuaire de la Gestion</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>
          Cet espace est réservé aux comptes disposant du droit « Location ».
        </div>
      )}
    </section>
  );
}
