'use client';

import { SuiviDemandes } from './SuiviDemandes';

/**
 * Q5/Q6 — onglet « EN COURS » : les demandes INITIÉES auprès des mairies, en attente de retour. Périmètre STRICT (statuts
 * envoyée · close, appliqué en amont par `SuiviDemandes`) : un brouillon/une prête/une abandonnée n'y apparaît JAMAIS — ils
 * ne sont pas partis. Aucune action groupée ici (elles portent sur des brouillons → onglet « À demander »). Le panneau détail
 * reste ouvrable. AUCUN envoi.
 */
interface Props { categories: { cle: string; libelle: string; rang: number }[] }

export function EnCoursVue({ categories }: Props) {
  return <SuiviDemandes categories={categories} perimetre="en_cours" />;
}
