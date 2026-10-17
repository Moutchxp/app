import { accesLocation, REFUS_LOCATION } from '../acces';
import { CreationLocataire } from '../CreationLocataire';

/** TUILE LOCATION — « Nouveau locataire » rattaché à un bien du portefeuille (refonte de l'accueil, 17/10/2026). */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <CreationLocataire /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
