import { accesLocation, REFUS_LOCATION } from '../acces';
import { EcranLocataires } from '../EcransLocation';

/** TUILE LOCATION — ② « Ajouter / supprimer un locataire » (refonte de l'accueil, 17/10/2026). */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranLocataires /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
