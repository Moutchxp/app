'use client';

import { type ReactNode } from 'react';
import { BlocRepliable } from './BlocRepliable';
import { familleAffichee, ORDRE_FAMILLES, type FamilleEncart, type OngletEncart } from '../../../../lib/permis/encartFamilles';

/**
 * UNIF-0 — ENCART de familles du détail d'un permis, RÉUTILISABLE par « En cours », « Réponses » et « Archives ». Applique la
 * règle d'affichage UNIQUE (`familleAffichee`, cf. encartFamilles.ts) et reproduit exactement le rendu de « Analyse et projection » :
 * un encart (colonne de blocs), des lignes REPLIÉES à titre court, TOUT enfermé dans son bloc (POLISH-1). Chaque famille fournit son
 * CONTENU en RENDER-PROP (`contenu`) → chargement PARESSEUX au dépliage (BlocRepliable ne monte l'enfant qu'à la 1re ouverture), la
 * paresse PERF-1 est donc préservée : le SIGNAL `nonVide` (compte batché, calculé ailleurs) décide de l'affichage SANS tirer le contenu.
 *
 * Ce composant ne décide RIEN d'autre : l'appelant lui passe les familles qu'il sait rendre (avec leur `nonVide`), l'encart filtre
 * (statut 'remplissable' → toujours ; 'si_non_vide' → si `nonVide` ; 'absente' → jamais) et ordonne (ORDRE_FAMILLES). Aucune I/O.
 */
export interface FamilleRendu {
  cle: FamilleEncart;
  titre: ReactNode;            // titre COURT, visible replié (peut porter un bilan léger, ex. « — dossier incomplet »)
  nonVide: boolean;            // signal batché « contient des infos » (jamais le contenu lui-même)
  contenu: () => ReactNode;    // RENDER-PROP : montée UNIQUEMENT au dépliage (paresse)
  defautOuvert?: boolean;      // rare : bloc ouvert d'emblée (ex. bilan de complétude visible sans déplier) — sinon replié
}

export function EncartFamilles({ onglet, familles }: { onglet: OngletEncart; familles: readonly FamilleRendu[] }) {
  const parCle = new Map(familles.map((f) => [f.cle, f]));
  // On ne rend QUE les familles fournies par l'appelant ET retenues par la règle d'affichage, dans l'ordre canonique.
  const aAfficher = ORDRE_FAMILLES
    .map((cle) => parCle.get(cle))
    .filter((f): f is FamilleRendu => f !== undefined && familleAffichee(onglet, f.cle, f.nonVide));
  if (aAfficher.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {aAfficher.map((f) => (
        <BlocRepliable key={f.cle} titre={f.titre} defautOuvert={f.defautOuvert}>
          {f.contenu}
        </BlocRepliable>
      ))}
    </div>
  );
}
