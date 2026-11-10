import { accesLocation, REFUS_LOCATION } from '../acces';
import { LienRetour } from '../../_composants/EnTetePage';
import { BlocPreavisAccueil } from '../PreavisAccueil';

/**
 * TUILE LOCATION — 🔴 Arno (10/11/2026) : le module « Préavis » en PLEINE PAGE. Le MÊME composant et la MÊME donnée que le bloc de l'accueil
 * (et que celui de la Gestion) : tous les tris dans les deux sens, les filtres par statut, la recherche par nom ou adresse.
 */
export default async function Page() {
  const { autorise, gestion } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <><LienRetour href="/admin/location" /><BlocPreavisAccueil gestion={gestion} plein /></>
        : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
