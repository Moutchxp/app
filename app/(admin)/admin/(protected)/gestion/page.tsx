import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';
import { EnTetePage } from '../_composants/EnTetePage';
import { INTRO_GESTION } from '../../../../lib/gestion/ecran';
import { GestionVue } from './GestionVue';

/**
 * Module « GESTION » (gestion locative) — LOT 2 : la coquille de l'écran à deux côtés.
 *
 * MODULE GARDÉ par `perm_gestion` (migration 228), sur le patron des 7 autres modules. `proxy.ts` refuse déjà
 * `/admin/gestion` à qui n'a pas le droit ; ce gate SERVEUR aligne la PAGE sur l'API — un non-autorisé voit un avis,
 * jamais une donnée. Deux barrières indépendantes, comme ailleurs.
 *
 * Composant SERVEUR : il ne fait que décider qui entre. Les données sont chargées par la vue CLIENT depuis
 * `/api/admin/gestion` (elle-même gardée) — ainsi il n'existe qu'UN chemin de lecture des tables gestion_*, et le droit
 * y est vérifié une seule fois, au même endroit.
 */
export default async function GestionPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  const autorise = session?.perms.gestion === true;

  // LOT 5-GMAIL — une CLASSE, plus une largeur en dur dans l'attribut `style` : en plein écran la boîte doit pouvoir
  //   prendre toute la place, et une largeur inline ne se laisse pas surcharger par une feuille de style.
  return (
    <section className="gst-page">
      <EnTetePage titre="Gestion" intro={INTRO_GESTION} />
      {autorise ? <GestionVue intro={INTRO_GESTION} /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>
          Cet espace est réservé aux comptes disposant du droit « Gestion ».
        </div>
      )}
    </section>
  );
}
