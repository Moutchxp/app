'use client';

import { createContext } from 'react';
import type { EcranTrace } from '../../../../lib/gestion/traceFiche';

/**
 * ══ 🔴 Arno (24/10/2026, 417) — UNE FICHE DE L'ANNUAIRE MODIFIÉE DEPUIS UN ÉCRAN TRACÉ (« Suivi du mois ») ═══════════════════════
 * Posé autour de la fiche commune existante (`FicheCommuneLocation`), il change trois choses, et seulement là :
 *   · « Enregistrer » d'une carte ouvre d'abord le RÉCAPITULATIF des seuls champs modifiés (« Confirmer » / « Revenir »), et reste
 *     inactif tant que rien n'a changé ;
 *   · l'enregistrement porte l'écran et le repère du journal pris à l'ouverture (`depuisJournalId`) : le serveur trace la session et
 *     refuse d'écraser une modification faite entre-temps par quelqu'un d'autre ;
 *   · après un enregistrement réussi, `onEnregistre` prévient l'hôte (la modale se ferme, la page se relit).
 * Absent (tous les autres écrans) : rien ne change.
 */
export interface EditionTracee {
  ecran: EcranTrace;
  depuisJournalId: number | null;
  onEnregistre?: () => void;
}

export const ContexteEditionTracee = createContext<EditionTracee | null>(null);
