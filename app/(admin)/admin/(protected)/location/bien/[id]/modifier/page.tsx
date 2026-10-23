import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../../acces';
import { ModifierFicheBien } from '../../../../gestion/ModifierFicheBien';
import { retourVersLaFiche } from '../../../../../../../lib/gestion/ficheBienAdresses';
import { LienRetour } from '../../../../_composants/EnTetePage';

/**
 * TUILE LOCATION — « Modifier » la fiche du bien (Arno, 23/10/2026) : la page « Ajouter un nouveau bien », à l'identique (même
 * `<section className="gst-page">`, même composant `CreationBien`), sans le bloc « Propriétaire(s) », pré-remplie. Mêmes gardes que
 * la fiche : le droit Location, et celui de la fiche commune (Gestion).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { autorise, gestion } = await accesLocation();
  const id = identifiantPage((await params).id);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : !gestion ? <><LienRetour href="/admin/location" /><div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div></>
          : id === null ? <><LienRetour href="/admin/location" /><div className="svv-card">Adresse incomplète : identifiant manquant.</div></>
            : <ModifierFicheBien lotId={id} retour={retourVersLaFiche(id, true)} />}
    </section>
  );
}
