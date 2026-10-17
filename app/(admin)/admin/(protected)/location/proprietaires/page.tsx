import { accesLocation, REFUS_LOCATION } from '../acces';
import { EcranProprietairesBiens } from '../EcransLocation';

/** TUILE LOCATION — ① « Ajouter / supprimer un propriétaire / bien » (refonte de l'accueil, 17/10/2026). */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranProprietairesBiens /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
