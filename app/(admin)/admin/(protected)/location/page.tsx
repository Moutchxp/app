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
/* 🔴🔴 Arno (28/11/2026, 11h59, accord explicite pour CE texte) — « Supprimer la ligne "L'espace de l'équipe location : propriétaires, biens et annexes,
   locataires — sur le même fichier que la Gestion.", elle n'a aucun intérêt. Garder cette ligne vide, pour ne pas faire remonter tout ce qui suit en
   dessous. » Le sous-titre reste, VIDE, à la hauteur exacte qu'avait le texte à chaque largeur (CSS_INTRO_VIDE) : rien d'autre ne bouge. */
const INTRO_LOCATION = '';

export default async function LocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cible = redirectionAncienLien(await searchParams);
  if (cible !== null) redirect(cible);
  const { autorise, gestion } = await accesLocation();
  // 🔴🔴 (Arno, 27/11/2026, 23h30) « Location (Nombre de lots vacants : 3) » : calculé par le serveur à CHAQUE affichage (la page est dynamique)
  const vacants = autorise ? await compterLotsVacants() : null;
  return (
    <section className="gst-page loc-accueil-page">
      {/* 🔴 Arno (28/11/2026, 00h45) « écrire "Nombre de lots vacants x" en plus discret, pas en gras » : plus petit, poids normal, couleur secondaire du thème,
          sur la ligne de « Location » (qui garde son style) ; au téléphone, il passe à la ligne entier */}
      <style>{CSS_TITRE_VACANTS + CSS_INTRO_VIDE}</style>
      {/* 🔴 Arno (23/11/2026) — sur la ligne du titre, à droite : « 20 % à restituer » en pleine page, avec sa pastille (rien d'autre ne bouge) */}
      {/* 🔴🔴 Arno (28/11/2026, 11h47) « Lots vacants : 15 dont 10 logements et 5 parkings » : le total, puis le décompte par type */}
      <EnTetePage titre={vacants === null ? titreLocation(null)
        : <>Location <span className="loc-titre-vacants" data-lots-vacants={vacants.total}
            data-lots-vacants-detail={vacants.parType.map((x) => `${x.type}:${x.n}`).join('|')}>{titreLocation(vacants).slice('Location '.length)}</span></>}
        intro={INTRO_LOCATION} {...(autorise ? { actions: <BoutonVingtPourcent /> } : {})} />
      {autorise ? <AccueilLocation gestion={gestion} /> : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
      )}
    </section>
  );
}

// 🔴 (Arno, 28/11/2026, 11h47) le détail passe à la ligne proprement (au téléphone : le bloc entier sous « Location », coupé entre les mots)
const CSS_TITRE_VACANTS = '.loc-titre-vacants{display:inline-block;max-width:100%;font-size:.8rem;font-weight:400;color:var(--color-svv-muted);white-space:normal;overflow-wrap:anywhere;vertical-align:baseline}';
/* 🔴 (Arno, 28/11/2026, 11h59) la ligne vide garde la hauteur du texte retiré (0,9 rem × 1,45) : 1 ligne à partir de 1000 px et de 760 à 767 px, 2 lignes
   de 413 à 759 px et de 768 à 999 px, 3 lignes jusqu'à 412 px (mesuré au pixel près au Chrome) ; la barre de recherche et les tuiles ne bougent pas */
const CSS_INTRO_VIDE = '.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:1.45em}'
  + '@media (max-width:999.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:2.9em}}'
  + '@media (min-width:760px) and (max-width:767.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:1.45em}}'
  + '@media (max-width:412.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:4.35em}}';
