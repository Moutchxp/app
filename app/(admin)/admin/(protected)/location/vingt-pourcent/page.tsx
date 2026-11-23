import { accesLocation, REFUS_LOCATION } from '../acces';
import { PageVingtPourcent } from '../VingtPourcentPage';

/** TUILE LOCATION — « 20 % à restituer » en pleine page (Arno, 23/11/2026) : ouverte par le petit bouton de la ligne de titre de l'accueil Location. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <PageVingtPourcent /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
