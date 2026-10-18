import { accesLocation, REFUS_LOCATION } from '../../acces';
import { EcranSortieRecherche } from '../../SortieLocataires';

/** TUILE LOCATION — « Supprimer un/des locataire(s) » (Arno, 19/10/2026) : la recherche des seuls occupants en place. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranSortieRecherche /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
