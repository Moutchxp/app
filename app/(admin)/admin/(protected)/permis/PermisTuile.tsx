'use client';

import { useState } from 'react';
import { PermisVue } from './PermisVue';
import { DemandesVue } from './DemandesVue';
import { ReponsesVue } from './ReponsesVue';
import { SaisinesVue } from './SaisinesVue';
import { ReglagesVue } from './ReglagesVue';
import { AutomatisationVue } from './AutomatisationVue';
import { CollaborateursVue } from './CollaborateursVue';
import { OngletsPermis, type CleOnglet } from './PermisOnglets';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/**
 * Onglets « Permis de construire », répartis en 2 groupes nommés (S13) — « Mise à jour des dossiers » (Dossiers,
 * Automatisation) et « Demandes aux mairies » (Demandes, Réponses, Saisines CADA, Collaborateurs, Réglages). La barre est PUR
 * (`OngletsPermis`) ; ici on ne gère que l'onglet actif et le montage du corps correspondant.
 */
interface Props { depuisParDefaut: string; categories: { cle: CleCategorie; libelle: string; rang: number }[] }

export function PermisTuile({ depuisParDefaut, categories }: Props) {
  const [onglet, setOnglet] = useState<CleOnglet>('dossiers');
  return (
    <div className="flex flex-col gap-3">
      <OngletsPermis actif={onglet} onChoisir={setOnglet} />
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'demandes' && <DemandesVue />}
      {onglet === 'reponses' && <ReponsesVue />}
      {onglet === 'saisines' && <SaisinesVue />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
      {onglet === 'collaborateurs' && <CollaborateursVue />}
    </div>
  );
}
