'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  LIB_TELECHARGER_DOCUMENT, LIB_RETOUR_ESPACE, MSG_APERCU_INDISPONIBLE, MSG_APERCU_EN_PREPARATION,
  type DocumentApercu,
} from './presentation';

/**
 * PDF.js chargé UNIQUEMENT côté client, à la demande. On RÉUTILISE le viewer déjà en service sur la page publique de
 * vérification (`app/verifier/PdfViewer.tsx`) : il rend chaque page dans un <canvas> via le build LEGACY de pdfjs-dist,
 * choisi explicitement pour Safari iOS. Aucune duplication, et aucune modification de la page `/verifier`.
 *
 * POURQUOI un canvas et pas un <embed>/<iframe> : Safari iOS rend très mal un PDF intégré dans une page (cadre vide,
 * ou première page seule sans défilement). Le rendu canvas affiche le document de façon identique sur tous les
 * navigateurs, iPhone compris.
 */
const PdfViewer = dynamic(() => import('../verifier/PdfViewer'), { ssr: false });

/**
 * ÉCRAN D'APERÇU d'un document de certificat (corps de la page serveur `certificats/[id]/apercu`).
 *
 * Reçoit UNIQUEMENT des valeurs déjà validées côté serveur, derrière la garde de propriété : l'id du certificat, le
 * document demandé, et l'analyse d'où l'on vient (pour la rouvrir au retour). Aucune donnée nominative, aucune clé de
 * stockage, aucun jeton n'est sérialisé jusqu'ici.
 *
 * Deux actions sous l'aperçu, larges et pleine largeur (charte `.svv-btn`, cibles tactiles confortables) :
 *  - « Télécharger ce document » → MÊME route, `?telecharger=1` : le serveur répond `attachment`, le navigateur
 *    propose d'enregistrer. C'est le SEUL endroit qui déclenche une invite de téléchargement.
 *  - « Retour » → `/espace?analyse=<id>` : la liste rouvre l'analyse d'où l'on vient.
 */
export default function ApercuDocument({
  certificatId,
  doc,
  analyseId,
  disponible,
}: {
  certificatId: number;
  doc: DocumentApercu;
  analyseId: number | null;
  /** false = nominatif pas encore déposé : on n'affiche ni aperçu ni téléchargement, seulement la mention et le retour. */
  disponible: boolean;
}) {
  const [imageErreur, setImageErreur] = useState(false);

  const base = `/api/internaute/espace/certificats/${certificatId}/telecharger?doc=${doc}`;
  const retour = analyseId === null ? '/espace' : `/espace?analyse=${analyseId}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Cadre de l'aperçu : fond de surface, bordure de charte, défilement vertical borné sur petit écran. */}
      <div className="overflow-hidden rounded-xl border border-svv-line bg-svv-surface">
        {!disponible ? (
          <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_APERCU_EN_PREPARATION}</p>
        ) : doc === 'visuel' ? (
          imageErreur ? (
            <p className="px-4 py-12 text-center text-sm text-svv-muted">{MSG_APERCU_INDISPONIBLE}</p>
          ) : (
            // Le visuel est une image : <img> suffit, aucun PDF.js. `alt` vide = image décorative du point de vue du
            // lecteur d'écran (le titre de l'écran, juste au-dessus, nomme déjà le document).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={base} alt="" onError={() => setImageErreur(true)} className="block w-full" />
          )
        ) : (
          <div className="p-2">
            <PdfViewer url={base} />
          </div>
        )}
      </div>

      {/* Actions — pleine largeur, empilées, pouce-compatibles. Ordre : action principale puis retour. */}
      <div className="flex flex-col gap-3">
        {disponible && (
          // Lien direct (pas de fetch) : le navigateur suit la réponse `attachment` et propose l'enregistrement.
          // `download` sans valeur → le nom vient du `Content-Disposition` du serveur.
          <a className="svv-btn svv-btn-primary" href={`${base}&telecharger=1`} download>
            {LIB_TELECHARGER_DOCUMENT}
          </a>
        )}
        <Link className="svv-btn svv-btn-outline" href={retour}>{LIB_RETOUR_ESPACE}</Link>
      </div>
    </div>
  );
}
