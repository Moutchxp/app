'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TraceEmpriseVue } from './TraceEmpriseVue';
import { OngletsPermis, type CleOnglet } from './PermisOnglets';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/**
 * Onglets « Permis de construire », répartis en 2 groupes nommés (S13) — « Mise à jour des dossiers » (Dossiers,
 * Automatisation) et « Demandes aux mairies » (À demander, En cours, Réponses, Archives, Saisines CADA, Collaborateurs,
 * Réglages). La barre est PURE (`OngletsPermis`) ; ici on ne gère que l'onglet actif et le montage du corps correspondant.
 * Q5 — l'ex-« Demandes » est scindé : « À demander » (préparation) et « En cours » (suivi), montés indépendamment.
 */
interface Props { depuisParDefaut: string; categories: { cle: CleCategorie; libelle: string; rang: number }[]; ancienneteMaxAnnees: number; triLibelle: string }

interface Comptes { reponses: number; saisines: number; rattachement: number }

/** Millisecondes jusqu'à la PROCHAINE occurrence de l'heure locale `h` (0..23). Sert au SEUL recomptage quotidien (pas un sondage). */
function msJusquaProchaineHeure(h: number): number {
  const now = new Date();
  const cible = new Date(now);
  cible.setHours(h, 0, 0, 0);
  if (cible.getTime() <= now.getTime()) cible.setDate(cible.getDate() + 1);
  return cible.getTime() - now.getTime();
}

export function PermisTuile({ depuisParDefaut, categories, ancienneteMaxAnnees, triLibelle }: Props) {
  const [onglet, setOnglet] = useState<CleOnglet>('dossiers');
  const [comptes, setComptes] = useState<Comptes | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recompterRef = useRef<() => Promise<void>>(async () => {}); // rompt l'auto-référence (planification quotidienne)

  // UNE requête de comptage : à l'ouverture (montage), après chaque action réussie (via onRecompter), et une fois par jour à
  // l'heure réglée (replanifiée à chaque comptage, via la ref). AUCUN sondage périodique. Un échec laisse les onglets utilisables.
  const recompter = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/permis/actions', { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as Comptes & { total: number; recomptageHeure: number };
      setComptes({ reponses: d.reponses, saisines: d.saisines, rattachement: d.rattachement });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void recompterRef.current(); }, msJusquaProchaineHeure(d.recomptageHeure)); // recomptage quotidien
    } catch { /* compteurs indisponibles : sans pastille, les onglets restent pleinement utilisables */ }
  }, []);

  useEffect(() => {
    recompterRef.current = recompter;
    void (async () => { await recompterRef.current(); })(); // comptage à l'ouverture (via la ref → pas de setState direct en effet)
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [recompter]);

  return (
    <div className="flex flex-col gap-3">
      <OngletsPermis actif={onglet} onChoisir={setOnglet}
        compteurs={comptes ? { reponses: comptes.reponses, saisines: comptes.saisines, rattachement: comptes.rattachement } : undefined} />
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'rattachement' && <SuiviRattachementVue onRecompter={() => void recompter()} />}
      {onglet === 'trace_emprise' && <TraceEmpriseVue />}
      {onglet === 'a_demander' && <ADemanderVue categories={categories} ancienneteMaxAnnees={ancienneteMaxAnnees} triLibelle={triLibelle} onAllerReglages={() => setOnglet('reglages')} />}
      {onglet === 'en_cours' && <EnCoursVue categories={categories} />}
      {onglet === 'reponses' && <ReponsesVue onRecompter={() => void recompter()} />}
      {onglet === 'archives' && <ArchivesVue />}
      {onglet === 'saisines' && <SaisinesVue onRecompter={() => void recompter()} />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
      {onglet === 'collaborateurs' && <CollaborateursVue />}
    </div>
  );
}
