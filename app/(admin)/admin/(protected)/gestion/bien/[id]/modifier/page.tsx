import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../../../../lib/admin/session';
import { identifiantPage } from '../../../../location/acces';
import { ModifierFicheBien } from '../../../ModifierFicheBien';
import { retourVersLaFiche } from '../../../../../../../lib/gestion/ficheBienAdresses';

/**
 * GESTION — « Modifier » la fiche du bien (Arno, 23/10/2026) : la MÊME page que depuis la Location (le formulaire « Ajouter un
 * nouveau bien », pré-rempli, sans le bloc « Propriétaire(s) »), dans la même `<section className="gst-page">`. Gardée par le droit
 * Gestion, comme la fiche ; « Annuler » revient à la fiche de la Gestion.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const autorise = (payload ? sessionDepuisPayload(payload) : null)?.perms.gestion === true;
  const id = identifiantPage((await params).id);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Cet espace est réservé aux comptes disposant du droit « Gestion ».</div>
        : id === null ? <div className="svv-card">Adresse incomplète : identifiant manquant.</div>
          : <ModifierFicheBien lotId={id} retour={retourVersLaFiche(id, false)} />}
    </section>
  );
}
