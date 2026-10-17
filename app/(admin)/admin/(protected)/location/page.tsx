import { EnTetePage } from '../_composants/EnTetePage';
import { accesLocation, REFUS_LOCATION } from './acces';
import { AccueilLocation } from './AccueilLocation';

/**
 * Module « LOCATION » — l'accueil de la tuile (refonte d'Arno du 17/10/2026) : un moteur de recherche en haut, puis
 * trois grosses cases (propriétaires / biens, locataires, outils de suivi). MODULE GARDÉ par `perm_location` (migration 371).
 * 🔴 Les écrans de la Location vivent sous /admin/location ; seules les DONNÉES sont communes avec la Gestion.
 */
const INTRO_LOCATION =
  'L’espace de l’équipe location : propriétaires, biens et annexes, locataires — sur le même fichier que la Gestion.';

export default async function LocationPage() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      <EnTetePage titre="Location" intro={INTRO_LOCATION} />
      {autorise ? <AccueilLocation /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
      )}
    </section>
  );
}
