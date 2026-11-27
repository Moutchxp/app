import { redirect } from 'next/navigation';
import { EnTetePage } from '../_composants/EnTetePage';
import { accesLocation, REFUS_LOCATION } from './acces';
import { AccueilLocation } from './AccueilLocation';
import { BoutonVingtPourcent } from './BoutonVingtPourcent';
import { redirectionAncienLien } from '../../../../lib/location/cheminCompteRendu';
import { compterLotsVacants } from '../../../../lib/location/lotsVacantsRepo';
import { titreLocation } from '../../../../lib/location/lotsVacants';

/**
 * Module « LOCATION » — l'accueil de la tuile (refonte d'Arno du 17/10/2026) : un moteur de recherche en haut, puis
 * trois grosses cases (propriétaires / biens, locataires, outils de suivi). MODULE GARDÉ par `perm_location` (migration 371).
 * 🔴 Les écrans de la Location vivent sous /admin/location ; seules les DONNÉES sont communes avec la Gestion.
 * 🔴 Arno (15/11/2026) — l'ancien lien du compte rendu (`?previsite=…&geste=compte-rendu`) est redirigé ICI, par le serveur, vers la page
 * du formulaire : la Location n'est jamais montée dessous.
 */
const INTRO_LOCATION =
  'L’espace de l’équipe location : propriétaires, biens et annexes, locataires — sur le même fichier que la Gestion.';

export default async function LocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cible = redirectionAncienLien(await searchParams);
  if (cible !== null) redirect(cible);
  const { autorise, gestion } = await accesLocation();
  // 🔴🔴 (Arno, 27/11/2026, 23h30) « Location (Nombre de lots vacants : 3) » : calculé par le serveur à CHAQUE affichage (la page est dynamique)
  const vacants = autorise ? await compterLotsVacants() : null;
  return (
    <section className="gst-page">
      {/* 🔴 Arno (28/11/2026, 00h45) « écrire "Nombre de lots vacants x" en plus discret, pas en gras » : plus petit, poids normal, couleur secondaire du thème,
          sur la ligne de « Location » (qui garde son style) ; au téléphone, il passe à la ligne entier */}
      <style>{CSS_TITRE_VACANTS}</style>
      {/* 🔴 Arno (23/11/2026) — sur la ligne du titre, à droite : « 20 % à restituer » en pleine page, avec sa pastille (rien d'autre ne bouge) */}
      <EnTetePage titre={vacants === null ? titreLocation(null)
        : <>Location <span className="loc-titre-vacants" data-lots-vacants={vacants}>{titreLocation(vacants).slice('Location '.length)}</span></>}
        intro={INTRO_LOCATION} {...(autorise ? { actions: <BoutonVingtPourcent /> } : {})} />
      {autorise ? <AccueilLocation gestion={gestion} /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
      )}
    </section>
  );
}

const CSS_TITRE_VACANTS = '.loc-titre-vacants{display:inline-block;font-size:.8rem;font-weight:400;color:var(--color-svv-muted);white-space:nowrap;vertical-align:baseline}';
