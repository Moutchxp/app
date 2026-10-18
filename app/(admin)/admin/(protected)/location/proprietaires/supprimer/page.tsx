import { accesLocation, REFUS_LOCATION } from '../../acces';
import { EcranSupprimerChoix } from '../../EcransLocation';

/** TUILE LOCATION — « Supprimer un propriétaire » : l'écran intermédiaire (propriétaire et tous ses biens / un des biens). */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranSupprimerChoix /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
