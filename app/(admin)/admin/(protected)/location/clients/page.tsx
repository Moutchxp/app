import { accesLocation, REFUS_LOCATION } from '../acces';
import { ClientsEtBiens } from '../ClientsEtBiens';

/** TUILE LOCATION — « Clients et biens » (Arno, 21/10/2026, 403) : les propriétaires et leurs biens, tous statuts. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <ClientsEtBiens /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
