import { accesLocation, REFUS_LOCATION } from '../../acces';
import { EcranAjouterLocatairesAVenir } from '../../SortieLocataires';

/** TUILE LOCATION — « Ajouter un/des locataire(s) » (Arno, 19/10/2026) : à venir, la spécification arrive. Aucun formulaire. */
export default async function Page() {
  const { autorise } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranAjouterLocatairesAVenir /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
