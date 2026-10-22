import { accesLocation, REFUS_LOCATION } from '../../acces';
import { EcranSuiviActivite } from '../../EcransLocation';

/** TUILE LOCATION — « Outils de suivi » › « Suivi du mois » (Arno, 23/10/2026) : la feuille de chaque mois. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranSuiviActivite vue="mois" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
