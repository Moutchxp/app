'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { DEPART_DRIVE_BANDEAU, LIBELLE_DRIVE_BANDEAU, AIDE_DRIVE_BANDEAU } from '../../../lib/admin/driveBandeau';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2a — LE BOUTON « DRIVE » DU BANDEAU ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « juste à droite de “Nom · Statut” du collaborateur connecté : un bouton “Drive”
 * (icône Drive + libellé) qui ouvre NOTRE fenêtre Drive (celle de l'application : arborescence, renommage,
 * corbeille), positionnée sur “Drives partagés”. Même fenêtre, même code. Pas de copie. »
 *
 * ═══ 🔴🔴 « MÊME FENÊTRE, MÊME CODE » — CE QUE CE FICHIER FAIT, ET SURTOUT CE QU'IL NE FAIT PAS ═══════════════════
 *
 * Il monte `SelecteurFichierDrive`, le composant que la fenêtre Drive EST — celui du rangement d'une pièce, du
 * Drive d'un bien, du picto « Dans le Drive ». Il n'en recopie pas une ligne : ni la liste, ni l'arborescence, ni
 * le renommage, ni la corbeille. Tout ce qui s'y ajoute (hier le crayon ✏️, avant-hier la corbeille du Drive)
 * apparaît donc ici le même jour, sans une ligne de plus.
 *
 * 🔴 `mode="consulter"`, ET C'EST LE SEUL MODE JUSTE. Les deux autres supposent un contexte qu'on n'a pas :
 * « joindre » suppose un message en cours d'écriture, « ranger » suppose des pièces reçues à poser. Ouvert depuis
 * le bandeau, on vient REGARDER le Drive — et c'est exactement ce que « consulter » veut dire. Le mode écarte le
 * bouton « Joindre la sélection », pas une seule autre commande (voir son encadré dans la fenêtre).
 *
 * ═══ 🔴 POURQUOI `next/dynamic`, ET POURQUOI CE N'EST PAS UNE OPTIMISATION GRATUITE ══════════════════════════════
 *
 * Ce bandeau coiffe TOUT l'admin : Statistiques, Internautes, Pilotage, Curation, Permis… La fenêtre Drive est le
 * plus gros composant du module Gestion. Importée en statique, elle partirait dans le paquet de CHAQUE page de
 * l'administration, pour un bouton que l'on clique une fois sur cent. Chargée à la demande, elle n'arrive qu'au
 * clic — et le comportement est identique, puisque c'est le même composant.
 *
 * ⚠️ `ssr: false` : elle ne sait pas se rendre sur le serveur (elle lit `sessionStorage` à l'initialisation pour
 * retrouver l'arbre qu'on avait laissé). Elle n'a de toute façon rien à y faire : elle n'existe qu'après un clic.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const FenetreDrive = dynamic(
  () => import('./gestion/SelecteurFichierDrive').then((m) => ({ default: m.SelecteurFichierDrive })),
  { ssr: false },
);

export function BoutonDriveBandeau() {
  const [ouverte, setOuverte] = useState(false);

  return (
    <>
      {/**
        * ⚠️ L'ICÔNE NE PORTE PAS L'INFORMATION À ELLE SEULE : le LIBELLÉ est écrit à côté (demande d'Arno, « icône
        * Drive + libellé »), et c'est aussi la règle du module — un glyphe seul n'existe pas pour un lecteur
        * d'écran et ne s'apprend pas au survol sur un téléphone.
        * ⚠️ `aria-expanded` : le bouton ouvre une fenêtre modale, et il le DIT.
        */}
      <button type="button" className="svv-adm-drive" aria-expanded={ouverte}
        title={AIDE_DRIVE_BANDEAU} onClick={() => setOuverte(true)}>
        <IconeDrive />
        <span>{LIBELLE_DRIVE_BANDEAU}</span>
      </button>
      {ouverte && (
        <FenetreDrive
          mode="consulter"
          /**
           * 🔴 POSITIONNÉE SUR « DRIVES PARTAGÉS » (demande d'Arno). C'est un REGROUPEMENT — un mot à nous, qui ne
           * désigne aucun dossier chez Google —, et la fenêtre sait l'ouvrir : c'est l'entrée que sa barre latérale
           * propose déjà. L'identifiant et le libellé viennent d'un module pur, jamais écrits en dur ici.
           */
          dossierDepart={DEPART_DRIVE_BANDEAU}
          onFermer={() => setOuverte(false)} />
      )}
    </>
  );
}

/**
 * 🔴 LE TRIANGLE DE GOOGLE DRIVE, EN SVG INLINE, dans les couleurs de Google — ce sont les siennes, pas les
 * nôtres : c'est son produit qu'on désigne, et un triangle gris ne se reconnaîtrait pas.
 *
 * ⚠️ `aria-hidden` : le mot est à côté. Un libellé sur l'icône le ferait annoncer deux fois.
 * ⚠️ AUCUNE IMAGE DISTANTE : une balise d'image pointant vers Google ferait partir une requête vers lui à chaque
 * page de l'administration, et lui dirait qui consulte quoi, et quand. Quelques chemins de SVG ne coûtent rien.
 */
function IconeDrive() {
  return (
    <svg viewBox="0 0 48 48" width="15" height="15" aria-hidden="true" focusable="false">
      <path fill="#0066da" d="M6.6 36.2 3 42.4a3.9 3.9 0 0 0 1.4 1.4l12.9-22.3H6.6Z" />
      <path fill="#00ac47" d="M24 14.6 17.1 2.6a3.9 3.9 0 0 0-1.4 1.4L3 26.3a3.9 3.9 0 0 0 0 3.9l3.6 6.2L24 14.6Z" />
      <path fill="#ea4335" d="M43.6 36.2H24l-6.6 11.5h19.2a3.9 3.9 0 0 0 3.4-2l3.6-6.2a3.9 3.9 0 0 0 0-3.3Z" />
      <path fill="#00832d" d="M24 14.6 17.1 2.6h13.8a3.9 3.9 0 0 1 3.4 2L47.2 26.3H24V14.6Z" />
      <path fill="#2684fc" d="M4.4 43.8a3.9 3.9 0 0 0 2 .5h17L30.9 32H17.3L4.4 43.8Z" />
      <path fill="#ffba00" d="M47.2 26.3 34.3 4.6 24 14.6l11.6 20.1h11.6a3.9 3.9 0 0 0 0-8.4Z" />
    </svg>
  );
}
