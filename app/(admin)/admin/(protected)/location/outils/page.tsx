import { accesLocation, REFUS_LOCATION } from '../acces';
import { EcranOutils } from '../EcransLocation';

/** TUILE LOCATION — ③ « Outils de suivi » (refonte de l'accueil, 17/10/2026) : honoraires (administrateurs) et la suite. */
export default async function Page() {
  const { autorise, administrateur } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranOutils administrateur={administrateur} /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
