import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { FicheCommuneLocation } from '../../../gestion/FicheCommune';
import { LienRetour } from '../../../_composants/EnTetePage';
import { EcranSortieLocataire } from '../../SortieLocataires';
import { BauxEnPlace } from '../../BauxEnPlace';
import { ConditionsSuiviFicheLocataire } from '../../ConditionsSuiviFicheLocataire';

/**
 * TUILE LOCATION — la fiche locataire, ouverte depuis la Location : c'est LA fiche de la Gestion (même composant, même
 * contenu, historique compris), sans écriture de mail. Règle d'Arno du 17/10/2026 : une seule fiche dans l'application.
 * Arno (19/10/2026) : AU-DESSUS de la fiche (qui ne change pas), le bloc « Sortie du logement » de la tuile Location.
 * Arno (18-19/10/2026) : EN MODE SORTIE (`?sortie=<occupation>`, depuis « Supprimer un/des locataire(s) »), l'écran de sortie
 * ALIGNÉ sur « Supprimer un des biens » (`EcranSortieLocataire`) — et lui seul : le bloc « Fiche commune avec la Gestion… »
 * et la fiche complète n'y sont pas (accord d'Arno pour cet écran). Sans `?sortie=`, la page est celle de toujours.
 * Arno (21/10/2026) : sous le bloc de sortie, le bouton « Envoi ADHOC & MONGA » de chaque bail en cours (ajout seul).
 * 🔴 Arno (26/10/2026) : le bloc 4 « Suivi commercial » de « Nouveau locataire », sur la ligne de suivi du bail en cours (ajout seul).
 * 🔴🔴 Arno (20/11/2026, option B) — RETRAIT ACCORDÉ : le bloc « Sortie du logement » (`BlocSortieLogement` : cartes, « Sélectionner »,
 * « Enregistrer un préavis », « Faire sortir », « Sorties enregistrées » avec « Corriger la date » / « Annuler la sortie ») n'est plus sur la
 * fiche. « Tout ce qui touche à une sortie passe par le chemin dédié » : /admin/location/locataires/supprimer (occupants → écran de sortie :
 * préavis, sortie, gestes du préavis ; sorties enregistrées : corriger, annuler).
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
        : id === null ? <>{/* Arno (22/10/2026) — sans la fiche, un « ← Retour » vers la Location. */}<LienRetour href="/admin/location" /><div className="svv-card">Adresse incomplète : identifiant manquant.</div></>
          : sortie !== null ? <EcranSortieLocataire occupationInitiale={sortie} gestion={gestion} />
          : (
            <>
              {!gestion && <LienRetour href="/admin/location" />}
              {/* 🔴 Arno (20/11/2026) — sans le droit « Gestion », pas de fiche commune : la ligne « Conditions d'entrée et suivi commercial »
                  reste ici, en haut (rien n'est retiré). Avec la fiche commune, elle est SOUS l'en-tête du locataire (ci-dessous). */}
              {!gestion && <ConditionsSuiviFicheLocataire locataireId={id} />}
              {/* Arno (26/10/2026, 430) — la mention « locataire en place à la prise en gestion » de ses baux (rien sinon). */}
              <BauxEnPlace locataireId={id} />
              {!gestion ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div>
                : (
                  /* 🔴 Arno (20/11/2026) — les blocs 3 « Conditions d'entrée » et 4 « Suivi commercial » de « Nouveau locataire » (bail en cours),
                     repliés ensemble sur une ligne, JUSTE SOUS l'en-tête du locataire (nom, capsule, « Dossier Drive du bail ») et au-dessus de
                     « LE BAIL » ; dépliés : les deux blocs, leur « Enregistrer », puis « Bail en cours · Envoi ADHOC & MONGA ». */
                  <FicheCommuneLocation fiche={{ sorte: 'locataire', id }} sousEnteteLocataire={<ConditionsSuiviFicheLocataire locataireId={id} />} />
                )}
            </>
          )}
    </section>
  );
}
