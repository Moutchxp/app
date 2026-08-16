'use client';

import { useState } from 'react';
import { PermisVue } from './PermisVue';
import { ADemanderVue } from './ADemanderVue';
import { EnCoursVue } from './EnCoursVue';
import { ReponsesVue } from './ReponsesVue';
import { ArchivesVue } from './ArchivesVue';
import { SaisinesVue } from './SaisinesVue';
import { ReglagesVue } from './ReglagesVue';
import { AutomatisationVue } from './AutomatisationVue';
import { CollaborateursVue } from './CollaborateursVue';
import { SuiviRattachementVue } from './SuiviRattachementVue';
import { OngletsPermis, type CleOnglet } from './PermisOnglets';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/**
 * Onglets « Permis de construire », répartis en 2 groupes nommés (S13) — « Mise à jour des dossiers » (Dossiers,
 * Automatisation) et « Demandes aux mairies » (À demander, En cours, Réponses, Archives, Saisines CADA, Collaborateurs,
 * Réglages). La barre est PURE (`OngletsPermis`) ; ici on ne gère que l'onglet actif et le montage du corps correspondant.
 * Q5 — l'ex-« Demandes » est scindé : « À demander » (préparation) et « En cours » (suivi), montés indépendamment.
 */
interface Props { depuisParDefaut: string; categories: { cle: CleCategorie; libelle: string; rang: number }[]; ancienneteMaxAnnees: number; triLibelle: string }

export function PermisTuile({ depuisParDefaut, categories, ancienneteMaxAnnees, triLibelle }: Props) {
  const [onglet, setOnglet] = useState<CleOnglet>('dossiers');
  // FUS-3b — depuis le suivi de rattachement, « ouvrir le détail complet » bascule vers Archives en pré-ouvrant le permis.
  const [archivesFocus, setArchivesFocus] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <OngletsPermis actif={onglet} onChoisir={setOnglet} />
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'rattachement' && <SuiviRattachementVue onOuvrirArchives={(id) => { setArchivesFocus(id); setOnglet('archives'); }} />}
      {onglet === 'a_demander' && <ADemanderVue categories={categories} ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle} onAllerReglages={() => setOnglet('reglages')} />}
      {onglet === 'en_cours' && <EnCoursVue categories={categories} />}
      {onglet === 'reponses' && <ReponsesVue />}
      {onglet === 'archives' && <ArchivesVue initialDossierOuvert={archivesFocus} />}
      {onglet === 'saisines' && <SaisinesVue />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
      {onglet === 'collaborateurs' && <CollaborateursVue />}
    </div>
  );
}
