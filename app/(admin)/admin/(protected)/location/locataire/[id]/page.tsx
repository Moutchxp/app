import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { FicheCommuneLocation } from '../../../gestion/FicheCommune';
import { BlocSortieLogement, EcranSortieLocataire } from '../../SortieLocataires';
import { BlocEnvoiFicheLocataire } from '../../EnvoiAdhocMonga';

/**
 * TUILE LOCATION — la fiche locataire, ouverte depuis la Location : c'est LA fiche de la Gestion (même composant, même
 * contenu, historique compris), sans écriture de mail. Règle d'Arno du 17/10/2026 : une seule fiche dans l'application.
 * Arno (19/10/2026) : AU-DESSUS de la fiche (qui ne change pas), le bloc « Sortie du logement » de la tuile Location.
 * Arno (18-19/10/2026) : EN MODE SORTIE (`?sortie=<occupation>`, depuis « Supprimer un/des locataire(s) »), l'écran de sortie
 * ALIGNÉ sur « Supprimer un des biens » (`EcranSortieLocataire`) — et lui seul : le bloc « Fiche commune avec la Gestion… »
 * et la fiche complète n'y sont pas (accord d'Arno pour cet écran). Sans `?sortie=`, la page est celle de toujours.
 * Arno (21/10/2026) : sous le bloc de sortie, le bouton « Envoi ADHOC & MONGA » de chaque bail en cours (ajout seul).
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
          : sortie !== null ? <EcranSortieLocataire occupationInitiale={sortie} gestion={gestion} />
          : (
            <>
              <BlocSortieLogement locataireId={id} occupationDemandee={sortie} gestion={gestion} />
              {/* Arno (21/10/2026) — « Envoi ADHOC & MONGA » pour chaque bail en cours (rien sans bail en cours). */}
              <BlocEnvoiFicheLocataire locataireId={id} />
              {!gestion ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div>
                : <FicheCommuneLocation fiche={{ sorte: 'locataire', id }} />}
            </>
          )}
    </section>
  );
}
