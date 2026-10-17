import { accesLocation, identifiantPage, REFUS_LOCATION } from '../../acces';
import { FicheProprietaireLocationVue } from '../../FichePersonneLocation';

/** TUILE LOCATION — la fiche (proprietaire), écran de la Location sur les données communes avec la Gestion. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { autorise } = await accesLocation();
  const id = identifiantPage((await params).id);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : id === null ? <div className="svv-card">Adresse incomplète : identifiant manquant.</div>
          : <FicheProprietaireLocationVue id={id} />}
    </section>
  );
}
