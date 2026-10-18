import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { FicheCommuneLocation } from '../../../gestion/FicheCommune';
import { BlocSortieLogement } from '../../SortieLocataires';

/**
 * TUILE LOCATION — la fiche locataire, ouverte depuis la Location : c'est LA fiche de la Gestion (même composant, même
 * contenu, historique compris), sans écriture de mail. Règle d'Arno du 17/10/2026 : une seule fiche dans l'application.
 * Arno (19/10/2026) : AU-DESSUS de la fiche (qui ne change pas), le bloc « Sortie du logement » de la tuile Location —
 * ouvert sur le bail choisi quand on arrive de « Supprimer un/des locataire(s) » (`?sortie=<occupation>`).
 */
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sortie?: string }>;
}) {
  const { autorise, gestion } = await accesLocation();
  const id = identifiantPage((await params).id);
  const sortie = identifiantPage((await searchParams).sortie);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : id === null ? <div className="svv-card">Adresse incomplète : identifiant manquant.</div>
          : (
            <>
              <BlocSortieLogement locataireId={id} occupationDemandee={sortie} />
              {!gestion ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div>
                : <FicheCommuneLocation fiche={{ sorte: 'locataire', id }} />}
            </>
          )}
    </section>
  );
}
