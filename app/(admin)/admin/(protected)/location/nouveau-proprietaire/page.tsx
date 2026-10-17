import { accesLocation, REFUS_LOCATION } from '../acces';
import { CreationProprietaires } from '../CreationProprietaires';

/** TUILE LOCATION — « Créer un nouveau propriétaire » : cartes de contact, puis « Ajouter un bien à ce nouveau propriétaire ». */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <CreationProprietaires /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
