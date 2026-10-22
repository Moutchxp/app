import { accesLocation, REFUS_LOCATION } from '../../acces';
import { EcranSuiviActivite } from '../../EcransLocation';

/** TUILE LOCATION — « Outils de suivi » › « Suivi annuel » (Arno, 23/10/2026) : cumul, apporteurs, gestion, indicateurs, négociateurs, export. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranSuiviActivite vue="annee" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
